import fs from "fs";
import path from "path";
import { CODEX_HOME, WINDOW_DAYS } from "./config";
import type { Source, TranscriptTurn } from "./types";

const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

interface Candidate {
  source: Source;
  turnCount: number;
}

function truncate(value: string, length: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

function messageText(value: unknown, acceptedTypes: Set<string>): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is { type: string; text: string } =>
      !!item && typeof item === "object" &&
      acceptedTypes.has((item as any).type) &&
      typeof (item as any).text === "string")
    .map((item) => item.text)
    .join("\n");
}

function meaningfulUserText(value: string): boolean {
  const text = value.trim();
  if (!text || text.startsWith("<") || text.startsWith("[Image")) return false;
  return !/^(Caveat:|You are Codex\b|A previous agent produced the plan below)/i.test(text);
}

function meaningfulAssistantText(value: string): boolean {
  const text = value.trim();
  return Boolean(text) && !text.startsWith("<");
}

function containsMarker(value: unknown, marker: RegExp): boolean {
  if (typeof value === "string") return marker.test(value);
  if (!value || typeof value !== "object") return false;
  try {
    return marker.test(JSON.stringify(value));
  } catch {
    return false;
  }
}

function excludedSession(meta: any): boolean {
  const payload = meta?.payload ?? {};
  const provenance = [payload.source, payload.thread_source, payload.originator];
  return provenance.some((value) =>
    containsMarker(value, /(subagent|automation|onboarding|claude[ _-]?code|claude-code)/i)
  ) || provenance.some((value) =>
    typeof value === "string" && /^(exec|codex_exec|noninteractive)$/i.test(value)
  );
}

function projectFromCwd(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return path.basename(normalized) || cwd;
}

function readTitles(codexHome: string): Map<string, string> {
  const titles = new Map<string, string>();
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(codexHome, "session_index.jsonl"), "utf8");
  } catch {
    return titles;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (typeof item.id === "string" && typeof item.thread_name === "string" && item.thread_name.trim()) {
        titles.set(item.id, item.thread_name.trim());
      }
    } catch {
      // The index is a best-effort convenience; one bad line must not hide sessions.
    }
  }
  return titles;
}

function jsonlFiles(root: string): string[] {
  const files: string[] = [];
  function visit(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
    }
  }
  visit(root);
  return files;
}

function parseCodexSession(file: string, titles: Map<string, string>, now: number): Candidate | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }

  let meta: any = null;
  const structuredTurns: TranscriptTurn[] = [];
  const legacyUserTurns: TranscriptTurn[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "session_meta" && !meta) meta = record;
    const timestamp = typeof record.timestamp === "string"
      ? Date.parse(record.timestamp)
      : Number.NaN;
    if (Number.isNaN(timestamp)) continue;

    if (record.type === "response_item" && record.payload?.type === "message") {
      const payload = record.payload;
      if (payload.role === "user") {
        const text = messageText(
          payload.content,
          new Set(["input_text", "text"]),
        ).trim();
        if (meaningfulUserText(text)) {
          structuredTurns.push({ role: "user", text, timestamp });
        }
      } else if (
        payload.role === "assistant" &&
        payload.phase === "final_answer"
      ) {
        const text = messageText(
          payload.content,
          new Set(["output_text", "text"]),
        ).trim();
        if (meaningfulAssistantText(text)) {
          structuredTurns.push({ role: "assistant", text, timestamp });
        }
      }
    }

    if (record.type === "event_msg" && record.payload?.type === "user_message") {
      const text = messageText(
        record.payload.message ?? record.payload.content,
        new Set(["input_text", "text"]),
      ).trim();
      if (meaningfulUserText(text)) {
        legacyUserTurns.push({ role: "user", text, timestamp });
      }
    }
  }

  const id = meta?.payload?.id ?? meta?.payload?.session_id;
  const cwd = meta?.payload?.cwd;
  if (typeof id !== "string" || !id || typeof cwd !== "string" || !cwd) return null;
  const turns = structuredTurns.length > 0
    ? structuredTurns
    : legacyUserTurns;
  if (excludedSession(meta) || turns.length === 0) return null;

  const dedupedTurns = turns.filter((turn, index) => {
    const previous = turns[index - 1];
    return !previous ||
      previous.role !== turn.role ||
      previous.text !== turn.text ||
      previous.timestamp !== turn.timestamp;
  });
  const minTs = Math.min(...dedupedTurns.map((turn) => turn.timestamp));
  const maxTs = Math.max(...dedupedTurns.map((turn) => turn.timestamp));
  if (now - maxTs > WINDOW_MS || maxTs - now > 5 * 60_000) return null;

  const project = projectFromCwd(cwd);
  const firstPrompt = dedupedTurns.find((turn) => turn.role === "user")?.text ?? "";
  const title = titles.get(id) || truncate(firstPrompt, 70) || "(untitled Codex session)";
  const summary = [
    "Codex session",
    `Project: ${project}`,
    `Title: ${title}`,
    `${dedupedTurns.length} visible conversation turn(s)`,
  ].filter(Boolean).join("\n");
  return {
    turnCount: dedupedTurns.length,
    source: {
      id: `session:codex:${id}`,
      kind: "session",
      title,
      summary,
      project,
      detail: dedupedTurns.map((turn) =>
        `${turn.role === "user" ? "User" : "Agent"}: ${truncate(turn.text, 240)}`
      ),
      startTs: minTs,
      endTs: maxTs,
      weight: 1,
      transcript: dedupedTurns,
      sessionProvider: "codex",
    },
  };
}

/** Read interactive Codex rollouts. The on-disk format is intentionally treated as best-effort. */
export function extractCodexSessions(
  codexHome: string | null = CODEX_HOME,
  now = Date.now(),
): Source[] {
  if (!codexHome) return [];
  const titles = readTitles(codexHome);
  const files = [
    ...jsonlFiles(path.join(codexHome, "sessions")),
    ...jsonlFiles(path.join(codexHome, "archived_sessions")),
  ];
  const sessions = new Map<string, Candidate>();
  for (const file of files) {
    const candidate = parseCodexSession(file, titles, now);
    if (!candidate) continue;
    const previous = sessions.get(candidate.source.id);
    // Prefer a more complete copy, then the latest copy when completeness ties.
    if (!previous || candidate.turnCount > previous.turnCount ||
      (candidate.turnCount === previous.turnCount && candidate.source.endTs > previous.source.endTs)) {
      sessions.set(candidate.source.id, candidate);
    }
  }
  return [...sessions.values()].map(({ source }) => source);
}
