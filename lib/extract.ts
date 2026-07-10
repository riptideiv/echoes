import fs from "fs";
import path from "path";
import { CLAUDE_PROJECTS_DIR, WINDOW_DAYS } from "./config";
import { readAllHistory } from "./browser-history";
import type { Source } from "./types";

const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Browsing noise we never want to reason about.
const NOISE_DOMAINS = new Set([
  "accounts.google.com",
  "mail.google.com",
  "login.microsoftonline.com",
  "calendar.google.com",
  "chrome-ext.tilda.ws",
  "chromewebstore.google.com",
  "accounts.firefox.com",
]);

function decodeProject(dir: string): string {
  return dir
    .replace(/^-Users-[^-]+-Documents-/, "")
    .replace(/^-Users-[^-]+-/, "")
    .replace(/-/g, " ")
    .trim();
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: string; text: string } =>
          !!c && typeof c === "object" && (c as any).type === "text"
      )
      .map((c) => c.text)
      .join(" ");
  }
  return "";
}

function isRealUserText(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  if (s.startsWith("<")) return false; // command wrappers / system reminders
  if (s.startsWith("[Image")) return false;
  if (s.startsWith("Caveat:")) return false;
  return true;
}

/** Parse one session .jsonl into a Source, or null if outside the window. */
function parseSession(file: string, projectDir: string): Source | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let aiTitle: string | null = null;
  let firstPrompt: string | null = null;
  const prompts: string[] = [];
  let minTs = Infinity;
  let maxTs = -Infinity;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "ai-title" && o.aiTitle) aiTitle = o.aiTitle;
    if (typeof o.timestamp === "string") {
      const t = Date.parse(o.timestamp);
      if (!Number.isNaN(t)) {
        if (t < minTs) minTs = t;
        if (t > maxTs) maxTs = t;
      }
    }
    if (o.type === "user" && o.message && typeof o.message === "object") {
      const t = textFromContent(o.message.content).trim();
      if (isRealUserText(t)) {
        if (!firstPrompt) firstPrompt = t;
        if (prompts.length < 3) prompts.push(t);
      }
    }
  }

  if (maxTs === -Infinity) return null;
  if (Date.now() - maxTs > WINDOW_MS) return null; // last activity outside window

  const project = decodeProject(projectDir);
  const sessionId = path.basename(file, ".jsonl");
  const title = aiTitle || firstPrompt?.slice(0, 70) || "(untitled session)";
  const detail = prompts.map((p) => truncate(p, 180));

  const summary = [
    `Project: ${project}`,
    `Title: ${title}`,
    firstPrompt ? `First ask: ${truncate(firstPrompt, 240)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `session:${sessionId}`,
    kind: "session",
    title,
    summary,
    project,
    detail: detail.length ? detail : [truncate(firstPrompt ?? title, 180)],
    startTs: minTs === Infinity ? maxTs : minTs,
    endTs: maxTs,
    weight: 1,
  };
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

export function extractSessions(): Source[] {
  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: Source[] = [];
  for (const dir of projectDirs) {
    const full = path.join(CLAUDE_PROJECTS_DIR, dir);
    let files: string[];
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      files = fs.readdirSync(full);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue; // skips subagents/ subdir too
      const src = parseSession(path.join(full, f), dir);
      if (src) out.push(src);
    }
  }
  return out;
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function searchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname)) return null;
    if (!u.pathname.startsWith("/search")) return null;
    const q = u.searchParams.get("q");
    return q && q.trim().length > 2 ? q.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Turn browsing history into a handful of topical web sources: one per
 * meaningful domain (rollup of visits) plus one "Google searches" source
 * carrying the week's notable queries.
 */
export function extractWebSources(): Source[] {
  const entries = readAllHistory(WINDOW_MS);
  if (entries.length === 0) return [];
  const now = Date.now();
  const domains = new Map<
    string,
    { count: number; titles: Set<string>; min: number; max: number }
  >();
  const queries: { q: string; ts: number }[] = [];

  for (const e of entries) {
    if (!e.url) continue;
    const ts = e.visitTime ?? 0;
    if (ts && now - ts > WINDOW_MS) continue;

    const q = searchQuery(e.url);
    if (q) {
      queries.push({ q, ts });
      continue; // don't also count the search page as a domain visit
    }

    const dom = domainOf(e.url);
    if (!dom || NOISE_DOMAINS.has(dom)) continue;
    if (dom.startsWith("localhost")) continue;

    const d = domains.get(dom) ?? {
      count: 0,
      titles: new Set<string>(),
      min: ts || now,
      max: ts || 0,
    };
    d.count++;
    if (e.title) d.titles.add(truncate(e.title, 90));
    if (ts) {
      d.min = Math.min(d.min, ts);
      d.max = Math.max(d.max, ts);
    }
    domains.set(dom, d);
  }

  const out: Source[] = [];

  // Meaningful domains: enough visits to signal real activity.
  const ranked = [...domains.entries()]
    .filter(([, d]) => d.count >= 8)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);

  for (const [dom, d] of ranked) {
    const titles = [...d.titles].slice(0, 6);
    out.push({
      id: `web:${dom}`,
      kind: "web",
      title: `${dom} (${d.count} visits)`,
      summary: `Domain: ${dom}\nVisits this week: ${d.count}\nPages: ${titles
        .slice(0, 5)
        .join(" | ")}`,
      detail: titles.map((t) => `${dom}: ${t}`),
      startTs: d.min,
      endTs: d.max || now,
      weight: d.count,
    });
  }

  // Notable Google searches (deduped, most recent first).
  if (queries.length) {
    const seen = new Set<string>();
    const uniq: { q: string; ts: number }[] = [];
    for (const item of queries.sort((a, b) => b.ts - a.ts)) {
      const key = item.q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(item);
    }
    const top = uniq.slice(0, 30);
    out.push({
      id: "web:google-searches",
      kind: "web",
      title: `Google searches (${uniq.length} unique)`,
      summary:
        "Notable Google searches this week:\n" +
        top
          .slice(0, 20)
          .map((x) => `- ${truncate(x.q, 100)}`)
          .join("\n"),
      detail: top.slice(0, 12).map((x) => `searched: ${truncate(x.q, 120)}`),
      startTs: top.length ? top[top.length - 1].ts : now,
      endTs: top.length ? top[0].ts : now,
      weight: Math.min(uniq.length, 20),
    });
  }

  return out;
}

export function extractAllSources(): Source[] {
  return [...extractSessions(), ...extractWebSources()];
}
