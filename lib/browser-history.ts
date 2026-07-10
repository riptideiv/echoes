import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { getBrowserSources, type BrowserSource } from "./config";

/** One raw browsing visit, normalized across engines. visitTime = Unix ms. */
export interface HistoryEntry {
  url: string;
  title?: string;
  visitTime?: number;
}

// Chrome/WebKit epoch (1601-01-01) offset from Unix epoch, in milliseconds.
const CHROMIUM_EPOCH_OFFSET_MS = 11644473600000;

/**
 * Copy a SQLite DB (plus any -wal/-shm siblings) to a temp location and open
 * the writable copy. Copying avoids the live browser's writer lock, and a
 * writable copy lets SQLite fold the WAL in so the newest visits are included.
 * Returns the db handle and a cleanup fn that removes the temp files.
 */
function openCopy(dbPath: string): { db: Database.Database; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hist-"));
  const base = path.join(tmpDir, "db.sqlite");
  fs.copyFileSync(dbPath, base);
  for (const suffix of ["-wal", "-shm"]) {
    const sib = dbPath + suffix;
    if (fs.existsSync(sib)) fs.copyFileSync(sib, base + suffix);
  }
  const db = new Database(base);
  const cleanup = () => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { db, cleanup };
}

function readChromium(dbPath: string, sinceMs: number): HistoryEntry[] {
  const { db, cleanup } = openCopy(dbPath);
  try {
    // visit_time is microseconds since 1601; convert the cutoff into that space.
    const cutoff = (sinceMs + CHROMIUM_EPOCH_OFFSET_MS) * 1000;
    const rows = db
      .prepare(
        `SELECT u.url AS url, u.title AS title, v.visit_time AS vt
         FROM visits v JOIN urls u ON u.id = v.url
         WHERE v.visit_time > ?
         ORDER BY v.visit_time DESC`
      )
      .all(cutoff) as { url: string; title: string | null; vt: number }[];
    return rows.map((r) => ({
      url: r.url,
      title: r.title ?? undefined,
      visitTime: r.vt / 1000 - CHROMIUM_EPOCH_OFFSET_MS,
    }));
  } finally {
    cleanup();
  }
}

function readFirefox(dbPath: string, sinceMs: number): HistoryEntry[] {
  const { db, cleanup } = openCopy(dbPath);
  try {
    // visit_date is microseconds since the Unix epoch.
    const cutoff = sinceMs * 1000;
    const rows = db
      .prepare(
        `SELECT p.url AS url, p.title AS title, h.visit_date AS vt
         FROM moz_historyvisits h JOIN moz_places p ON p.id = h.place_id
         WHERE h.visit_date > ?
         ORDER BY h.visit_date DESC`
      )
      .all(cutoff) as { url: string; title: string | null; vt: number }[];
    return rows.map((r) => ({
      url: r.url,
      title: r.title ?? undefined,
      visitTime: r.vt / 1000,
    }));
  } finally {
    cleanup();
  }
}

function readJson(filePath: string, sinceMs: number): HistoryEntry[] {
  const entries = JSON.parse(fs.readFileSync(filePath, "utf8")) as HistoryEntry[];
  return entries.filter((e) => !e.visitTime || e.visitTime > sinceMs);
}

function readSource(src: BrowserSource, sinceMs: number): HistoryEntry[] {
  switch (src.engine) {
    case "chromium":
      return readChromium(src.path, sinceMs);
    case "firefox":
      return readFirefox(src.path, sinceMs);
    case "json":
      return readJson(src.path, sinceMs);
    default:
      console.warn(`[history] unknown engine "${src.engine}" for ${src.name}`);
      return [];
  }
}

/**
 * Read and merge browsing history from every configured source within the
 * given window. A broken/missing source logs a warning and contributes nothing,
 * so one bad browser never kills the pipeline.
 */
export function readAllHistory(windowMs: number): HistoryEntry[] {
  const sinceMs = Date.now() - windowMs;
  const out: HistoryEntry[] = [];
  for (const src of getBrowserSources()) {
    try {
      const entries = readSource(src, sinceMs);
      out.push(...entries);
    } catch (e) {
      console.warn(`[history] source "${src.name}" (${src.path}) failed:`, e);
    }
  }
  return out;
}
