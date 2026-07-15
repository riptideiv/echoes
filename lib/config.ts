import os from "os";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Load .env for both Next (redundant, harmless) and the standalone tsx script.
dotenv.config({ path: path.join(process.cwd(), ".env") });

export const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? 7);

export const CLAUDE_PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR ??
  path.join(os.homedir(), ".claude", "projects");

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

export const HISTORY_PATH =
  process.env.HISTORY_PATH ?? path.join(process.cwd(), "history.json");

export const DB_PATH =
  process.env.DB_PATH ?? path.join(process.cwd(), "data.db");

export const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY ?? "").trim();
export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
export const GEN_TEMPERATURE = Number(process.env.GEN_TEMPERATURE ?? 0.8);
export const TAG_TEMPERATURE = Number(process.env.TAG_TEMPERATURE ?? 0.2);

// Fixed tag vocabulary. The LLM must pick from this set so that grouping keys
// stay stable and cacheable. Tuned from the user's recent activity.
export const TAG_VOCAB = [
  "web-dev",
  "frontend-design",
  "ai-tooling",
  "data-infra",
  "dashboards",
  "graph-algorithms",
  "competitor-research",
  "personal-brand",
  "blogging",
  "career-internship",
  "student-life",
  "devops-deploy",
  "misc",
] as const;

export type Tag = (typeof TAG_VOCAB)[number];

export function hasHistoryFile(): boolean {
  try {
    return fs.existsSync(HISTORY_PATH);
  } catch {
    return false;
  }
}

// ---- browser history sources ---------------------------------------------

export type BrowserEngine = "chromium" | "firefox" | "json";

export interface BrowserSource {
  name: string;
  engine: BrowserEngine;
  path: string;
  enabled?: boolean;
}

const BROWSERS_CONFIG =
  process.env.BROWSERS_CONFIG ??
  path.join(process.cwd(), "config", "browsers.json");

/** Expand a leading ~ or $HOME so config files can use portable paths. */
function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p.startsWith("$HOME/")) return path.join(os.homedir(), p.slice(6));
  return p;
}

/**
 * The browser history sources to mine. Read from config/browsers.json when
 * present; otherwise fall back to the legacy exported history.json so existing
 * setups keep working. Disabled sources are dropped here.
 */
export function getBrowserSources(): BrowserSource[] {
  let sources: BrowserSource[] | null = null;
  try {
    if (fs.existsSync(BROWSERS_CONFIG)) {
      const parsed = JSON.parse(fs.readFileSync(BROWSERS_CONFIG, "utf8"));
      if (Array.isArray(parsed?.sources)) sources = parsed.sources;
    }
  } catch (e) {
    console.warn(`[config] failed to read ${BROWSERS_CONFIG}:`, e);
  }

  if (!sources) {
    // Backward-compat: the old single-file export, if it still exists.
    if (hasHistoryFile()) {
      return [{ name: "export", engine: "json", path: HISTORY_PATH }];
    }
    return [];
  }

  return sources
    .filter((s) => s && s.enabled !== false && s.engine && s.path)
    .map((s) => ({ ...s, path: expandHome(s.path) }));
}
