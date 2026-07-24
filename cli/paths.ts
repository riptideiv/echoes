import path from "node:path";
import os from "node:os";
import fs from "fs/promises";
import Database from "better-sqlite3";
import type { BrowserSource } from "@/lib/config/schema";

export interface AppPaths {
  home: string;
  config: string;
  secrets: string;
  database: string;
  logs: string;
  cache: string;
  runtime: string;
  serverState: string;
}

export type AgentDirectoryVerificationCode =
  | "ok"
  | "not_found"
  | "permission_denied"
  | "no_sessions"
  | "invalid_format"
  | "read_error";

export interface AgentDirectoryVerificationResult {
  success: boolean;
  code: AgentDirectoryVerificationCode;
  message: string;
}

export type BrowserDirectoryVerificationCode =
  | "ok"
  | "not_found"
  | "permission_denied"
  | "invalid_format"
  | "unsupported_engine"
  | "read_error";

export interface BrowserDirectoryVerificationResult {
  success: boolean;
  code: BrowserDirectoryVerificationCode;
  message: string;
}

function verificationFailure(
  error: unknown,
  subject: string,
): AgentDirectoryVerificationResult {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") {
    return {
      success: false,
      code: "not_found",
      message: `${subject} does not exist.`,
    };
  }
  if (code === "EACCES" || code === "EPERM") {
    return {
      success: false,
      code: "permission_denied",
      message: `${subject} is not readable (${code}). Check its permissions and macOS Full Disk Access.`,
    };
  }
  return {
    success: false,
    code: "read_error",
    message: `Could not read ${subject}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

export function expandHome(candidate: string | null): string {
  if (candidate === null) return "null";
  if (candidate === "~") return os.homedir();

  if (candidate.startsWith("~/")) {
    return path.join(os.homedir(), candidate.slice(2));
  }

  return candidate;
}

export function getDefaultAppHome() {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "com.riptideiv.echoes-report"
      );

    case "win32":
      return path.join(
        process.env.APPDATA ??
          path.join(os.homedir(), "AppData"),
        "Echoes Report"
      );

    default: // Linux
      return path.join(
        process.env.XDG_CONFIG_HOME ??
          path.join(os.homedir(), ".config"),
        "echoes-report"
      );
  }
}

export function getAppHome() {
  return path.resolve(
      process.env.ECHOES_REPORT_HOME ?? getDefaultAppHome()
    );
}

export function getAppPaths():AppPaths {
  const home = getAppHome();

  return {
    home,
    config: path.join(home, "config.json"),
    secrets: path.join(home, "secrets.json"),
    database: path.join(home, "data.db"),
    logs: path.join(home, "logs"),
    cache: path.join(home, "cache"),
    runtime: path.join(home, "runtime"),
    serverState: path.join(home, "runtime", "server.json"),
  };
}

// Coding agent source verification functions

export async function verifyClaudeDirectory(
  directory: string,
): Promise<AgentDirectoryVerificationResult> { // mirror claude section in extract.ts
  directory = expandHome(directory);

  try {
    await fs.access(directory, fs.constants.R_OK);
    const projects = await fs.readdir(directory, { withFileTypes: true });
    const sessionFiles: string[] = [];

    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectPath = path.join(directory, project.name);
      let entries;
      try {
        entries = await fs.readdir(projectPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          sessionFiles.push(path.join(projectPath, entry.name));
        }
      }
    }

    if (sessionFiles.length === 0) {
      return {
        success: false,
        code: "no_sessions",
        message: "No Claude JSONL session files were found in any project directory.",
      };
    }

    for (const sessionFile of sessionFiles) {
      let sessionContent: string;
      try {
        sessionContent = await fs.readFile(sessionFile, "utf8");
      } catch {
        continue;
      }

      for (const line of sessionContent.split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (
            record !== null &&
            typeof record === "object" &&
            typeof record.type === "string"
          ) {
            return {
              success: true,
              code: "ok",
              message: "Verified a readable Claude JSONL session record.",
            };
          }
        } catch {
          // A malformed line should not hide a valid record later in the file.
        }
      }
    }

    return {
      success: false,
      code: "invalid_format",
      message: "Claude JSONL files were found, but none contained a valid session record.",
    };
  } catch (error) {
    return verificationFailure(error, `Claude directory '${directory}'`);
  }
}

async function findJsonlFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findJsonlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function verifyCodexDirectory(
  directory: string,
): Promise<AgentDirectoryVerificationResult> { // mirror codex-extract.ts
  directory = expandHome(directory);

  try {
    await fs.access(directory, fs.constants.R_OK);
    const sessionFiles = [
      ...await findJsonlFiles(path.join(directory, "sessions")),
      ...await findJsonlFiles(path.join(directory, "archived_sessions")),
    ];

    if (sessionFiles.length === 0) {
      return {
        success: false,
        code: "no_sessions",
        message: "No Codex JSONL files were found under sessions or archived_sessions.",
      };
    }

    for (const sessionFile of sessionFiles) {
      let sessionContent: string;
      try {
        sessionContent = await fs.readFile(sessionFile, "utf8");
      } catch {
        continue;
      }

      for (const line of sessionContent.split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          const payload = record?.type === "session_meta"
            ? record.payload
            : null;
          const sessionId = payload?.id ?? payload?.session_id;

          if (
            typeof sessionId === "string" &&
            sessionId.length > 0 &&
            typeof payload?.cwd === "string" &&
            payload.cwd.length > 0
          ) {
            return {
              success: true,
              code: "ok",
              message: "Verified a readable Codex session metadata record.",
            };
          }
        } catch {
          // A malformed line should not hide a valid record later in the file.
        }
      }
    }

    return {
      success: false,
      code: "invalid_format",
      message: "Codex JSONL files were found, but none contained valid session metadata.",
    };
  } catch (error) {
    return verificationFailure(error, `Codex directory '${directory}'`);
  }
}

// Browser source verification functions

function browserVerificationFailure(
  error: unknown,
  source: BrowserSource,
): BrowserDirectoryVerificationResult {
  const code = (error as NodeJS.ErrnoException)?.code;
  const subject = `Browser source '${source.name}' at '${expandHome(source.path)}'`;

  if (code === "ENOENT") {
    return {
      success: false,
      code: "not_found",
      message: `${subject} does not exist.`,
    };
  }

  if (code === "EACCES" || code === "EPERM") {
    return {
      success: false,
      code: "permission_denied",
      message: `${subject} is not readable (${code}). Check its permissions and macOS Full Disk Access.`,
    };
  }

  if (typeof code === "string" && code.startsWith("SQLITE_")) {
    return {
      success: false,
      code: "invalid_format",
      message: `${subject} is not a valid ${source.engine} history database: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    success: false,
    code: "read_error",
    message: `Could not read ${subject}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/**
 * Run a verification query against a temporary copy of a browser database.
 * Copying the WAL/SHM siblings mirrors browser-history.ts: it avoids live
 * browser locks while retaining visits that have not yet reached the main DB.
 */
async function withBrowserDatabase<T>(
  source: BrowserSource,
  verify: (database: Database.Database) => T,
): Promise<T> {
  const sourcePath = expandHome(source.path);
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "echoes-report-browser-verify-"),
  );
  const databasePath = path.join(temporaryDirectory, "history.sqlite");

  try {
    await fs.access(sourcePath, fs.constants.R_OK);
    await fs.copyFile(sourcePath, databasePath);

    for (const suffix of ["-wal", "-shm"]) {
      try {
        await fs.copyFile(sourcePath + suffix, databasePath + suffix);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const database = new Database(databasePath);
    try {
      return verify(database);
    } finally {
      database.close();
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function verifyChromiumSource(source: BrowserSource): Promise<BrowserDirectoryVerificationResult> {
  try {
    await withBrowserDatabase(source, (database) => {
      database.prepare(
        `SELECT u.url AS url, u.title AS title, v.visit_time AS vt
         FROM visits v JOIN urls u ON u.id = v.url
         LIMIT 1`,
      ).get();
    });

    return {
      success: true,
      code: "ok",
      message: "Verified a readable Chromium history database.",
    };
  } catch (error) {
    return browserVerificationFailure(error, source);
  }
}

async function verifyFirefoxSource(source: BrowserSource): Promise<BrowserDirectoryVerificationResult> {
  try {
    await withBrowserDatabase(source, (database) => {
      database.prepare(
        `SELECT p.url AS url, p.title AS title, h.visit_date AS vt
         FROM moz_historyvisits h JOIN moz_places p ON p.id = h.place_id
         LIMIT 1`,
      ).get();
    });

    return {
      success: true,
      code: "ok",
      message: "Verified a readable Firefox history database.",
    };
  } catch (error) {
    return browserVerificationFailure(error, source);
  }
}

async function verifyJsonSource(source: BrowserSource): Promise<BrowserDirectoryVerificationResult> {
  const sourcePath = expandHome(source.path);

  try {
    await fs.access(sourcePath, fs.constants.R_OK);
    const parsed: unknown = JSON.parse(await fs.readFile(sourcePath, "utf8"));

    if (!Array.isArray(parsed)) {
      return {
        success: false,
        code: "invalid_format",
        message: `Browser source '${source.name}' must contain a JSON array of history entries.`,
      };
    }

    const invalidEntry = parsed.find((entry) => {
      if (entry === null || typeof entry !== "object") return true;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.url !== "string" ||
        (candidate.title !== undefined && typeof candidate.title !== "string") ||
        (candidate.visitTime !== undefined &&
          (typeof candidate.visitTime !== "number" || !Number.isFinite(candidate.visitTime)))
      );
    });

    if (invalidEntry !== undefined) {
      return {
        success: false,
        code: "invalid_format",
        message: `Browser source '${source.name}' contains an invalid history entry. Expected url, optional title, and optional numeric visitTime.`,
      };
    }

    return {
      success: true,
      code: "ok",
      message: "Verified a readable JSON browser history source.",
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        code: "invalid_format",
        message: `Browser source '${source.name}' does not contain valid JSON: ${error.message}`,
      };
    }
    return browserVerificationFailure(error, source);
  }
}

async function verifySafariSource(source: BrowserSource): Promise<BrowserDirectoryVerificationResult> {
  try {
    await withBrowserDatabase(source, (database) => {
      database.prepare(
        `SELECT i.url AS url, v.title AS title, v.visit_time AS vt
         FROM history_visits v
         JOIN history_items i ON i.id = v.history_item
         LIMIT 1`,
      ).get();
    });

    return {
      success: true,
      code: "ok",
      message: "Verified a readable Safari history database.",
    };
  } catch (error) {
    return browserVerificationFailure(error, source);
  }
}

export async function verifyBrowserSource(source: BrowserSource): Promise<BrowserDirectoryVerificationResult> {
  switch (source.engine) {
    case "chromium":
      return await verifyChromiumSource(source);
    case "firefox":
      return await verifyFirefoxSource(source);
    case "json":
      return await verifyJsonSource(source);
    case "safari":
      return await verifySafariSource(source);
    default:
      return {
        success: false,
        code: "unsupported_engine",
        message: `Unsupported browser engine: ${source.engine}`,
      };
  }
}
