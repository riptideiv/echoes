import fs from "fs";
import path from "path";
import { CODEX_HOME, WINDOW_DAYS } from "./config";
import type { Source } from "./types";

const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

interface Candidate {
  source: Source;
  promptCount: number;
}

function truncate(value: string, length: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

function userText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is { type: string; text: string } =>
      !!item && typeof item === "object" &&
      (item as any).type === "text" && typeof (item as any).text === "string")
    .map((item) => item.text)
    .join(" ");
}

function meaningfulPrompt(value: string): boolean {
  const text = value.trim();
  if (!text || text.startsWith("<") || text.startsWith("[Image")) return false;
  return !/^(Caveat:|You are Codex\b|A previous agent produced the plan below)/i.test(text);
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
  if (payload.parent_thread_id) return true;
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
  let minTs = Infinity;
  let maxTs = -Infinity;
  const prompts: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "session_meta" && !meta) meta = record;
    if (typeof record.timestamp === "string") {
      const timestamp = Date.parse(record.timestamp);
      if (!Number.isNaN(timestamp)) {
        minTs = Math.min(minTs, timestamp);
        maxTs = Math.max(maxTs, timestamp);
      }
    }
    if (record.type === "event_msg" && record.payload?.type === "user_message") {
      const text = userText(record.payload.message ?? record.payload.content).trim();
      if (meaningfulPrompt(text)) prompts.push(text);
    }
  }

  const id = meta?.payload?.id ?? meta?.payload?.session_id;
  const cwd = meta?.payload?.cwd;
  if (typeof id !== "string" || !id || typeof cwd !== "string" || !cwd) return null;
  if (excludedSession(meta) || maxTs === -Infinity || now - maxTs > WINDOW_MS || maxTs - now > 5 * 60_000) return null;
  const project = projectFromCwd(cwd);
  const firstPrompt = prompts[0] ?? "";
  const title = titles.get(id) || truncate(firstPrompt, 70) || "(untitled Codex session)";
  const summary = [
    "Codex session",
    `Project: ${project}`,
    `Title: ${title}`,
    firstPrompt ? `First ask: ${truncate(firstPrompt, 240)}` : "",
  ].filter(Boolean).join("\n");
  return {
    promptCount: prompts.length,
    source: {
      id: `session:codex:${id}`,
      kind: "session",
      title,
      summary,
      project,
      detail: prompts.length
        ? prompts.slice(0, 3).map((prompt) => truncate(prompt, 180))
        : [title],
      startTs: minTs === Infinity ? maxTs : minTs,
      endTs: maxTs,
      weight: 1,
    },
  };
}

/** Read interactive Codex rollouts. The on-disk format is intentionally treated as best-effort. */
export function extractCodexSessions(codexHome = CODEX_HOME, now = Date.now()): Source[] {
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
    if (!previous || candidate.promptCount > previous.promptCount ||
      (candidate.promptCount === previous.promptCount && candidate.source.endTs > previous.source.endTs)) {
      sessions.set(candidate.source.id, candidate);
    }
  }
  return [...sessions.values()].map(({ source }) => source);
}
