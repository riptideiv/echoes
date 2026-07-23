import os from "os";
import path from "path";
import fs from "fs";
import {
  BrowserSourceSchema,
  type BrowserSource,
} from "./config/schema";
import { expandHome } from "@/cli/paths";

function numberFromEnvironment(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined) return fallback;

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(
      `${name} must be a finite number; received ${JSON.stringify(raw)}`,
    );
  }

  return value;
}

export const ECHOES_REPORT_HOME =
  expandHome(process.env.ECHOES_REPORT_HOME ?? process.cwd());
export const ECHOES_REPORT_CONFIG =
  expandHome(process.env.ECHOES_REPORT_CONFIG ??
  path.join(ECHOES_REPORT_HOME, "config.json"));
export const DB_PATH =
  expandHome(process.env.DB_PATH ?? path.join(ECHOES_REPORT_HOME, "data.db"));

export const WINDOW_DAYS = numberFromEnvironment("WINDOW_DAYS", 7);

export const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY ?? "").trim();
export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

function configuredDirectory(
  name: string,
  fallback: string,
): string | null {
  const raw = process.env[name];
  if (raw === "" || raw === "null") return null;
  return expandHome(raw ?? fallback);
}

export const CLAUDE_PROJECTS_DIR = configuredDirectory(
  "CLAUDE_PROJECTS_DIR",
  path.join(os.homedir(), ".claude", "projects"),
);
export const CODEX_HOME = configuredDirectory(
  "CODEX_HOME",
  path.join(os.homedir(), ".codex"),
);

export const GEN_TEMPERATURE = numberFromEnvironment("GEN_TEMPERATURE", 0.8);
export const TAG_TEMPERATURE = numberFromEnvironment("TAG_TEMPERATURE", 0.2);

export const PORT = numberFromEnvironment("PORT", 3000);

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

// ---- browser history sources ---------------------------------------------

const BROWSERS_CONFIG = process.env.BROWSERS_CONFIG;
const HISTORY_PATH =
  expandHome(process.env.HISTORY_PATH ?? path.join(process.cwd(), "history.json"));

function parseBrowserSources(
  value: unknown,
  label: string,
): BrowserSource[] | null {
  const parsed = BrowserSourceSchema.array().safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(`[config] ignored invalid browser sources from ${label}`);
  return null;
}

function readBrowserSourcesFile(
  filePath: string,
): BrowserSource[] | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parseBrowserSources(
      Array.isArray(parsed) ? parsed : parsed?.browsers ?? parsed?.sources,
      filePath,
    );
  } catch (error) {
    console.warn(`[config] failed to read browser sources from ${filePath}:`, error);
    return null;
  }
}

/**
 * Resolve the browser sources configured by the CLI. A JSON environment value
 * is used by the packaged standalone server; file-based fallbacks preserve
 * development and older hand-written configurations.
 */
export function getBrowserSources(): BrowserSource[] {
  let sources: BrowserSource[] | null = null;

  const environmentSources = process.env.BROWSER_SOURCES_JSON;
  if (environmentSources) {
    try {
      sources = parseBrowserSources(
        JSON.parse(environmentSources),
        "BROWSER_SOURCES_JSON",
      );
    } catch (error) {
      console.warn("[config] failed to parse BROWSER_SOURCES_JSON:", error);
    }
  }

  if (!sources && BROWSERS_CONFIG) {
    sources = readBrowserSourcesFile(expandHome(BROWSERS_CONFIG));
  }

  if (!sources) {
    sources = readBrowserSourcesFile(expandHome(ECHOES_REPORT_CONFIG));
  }

  if (!sources && fs.existsSync(HISTORY_PATH)) {
    sources = [{
      id: "legacy-json-history",
      name: "Legacy JSON history export",
      engine: "json",
      path: HISTORY_PATH,
      enabled: true,
    }];
  }

  return (sources ?? [])
    .filter((source) => source.enabled)
    .map((source) => ({
      ...source,
      path: expandHome(source.path),
    }));
}
