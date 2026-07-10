import Database from "better-sqlite3";
import { DB_PATH } from "./config";
import type { Tag } from "./config";
import type { IdeaRow, TaggedSource } from "./types";

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      tags_json  TEXT NOT NULL,
      tagged_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS themes (
      source_key TEXT PRIMARY KEY,
      tag        TEXT NOT NULL,
      first_generated_date TEXT NOT NULL,
      source_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      generation_date TEXT NOT NULL,
      voice TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'long',
      tag TEXT NOT NULL,
      source_json TEXT NOT NULL,
      direction TEXT NOT NULL,
      justification_support TEXT NOT NULL,
      justification_interest TEXT NOT NULL,
      evidence_strength REAL NOT NULL,
      interest_score REAL NOT NULL,
      rank_score REAL NOT NULL,
      status TEXT NOT NULL,
      question TEXT,
      user_answer TEXT,
      rejection_reason TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ideas_date ON ideas(generation_date);
    CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
  `);

  // Migration for DBs created before the favorite column existed.
  const cols = d.prepare("PRAGMA table_info(ideas)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "favorite")) {
    d.exec("ALTER TABLE ideas ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
  }
  // Migration for DBs created before ideas carried a long/short format. Existing
  // ideas were all full-length blog ideas, so they default to 'long'.
  if (!cols.some((c) => c.name === "format")) {
    d.exec("ALTER TABLE ideas ADD COLUMN format TEXT NOT NULL DEFAULT 'long'");
  }

  _db = d;
  return d;
}

// ---- source tag cache -----------------------------------------------------

export function getCachedTags(id: string): Tag[] | null {
  const row = db()
    .prepare("SELECT tags_json FROM sources WHERE id = ?")
    .get(id) as { tags_json: string } | undefined;
  return row ? (JSON.parse(row.tags_json) as Tag[]) : null;
}

export function saveSourceTags(src: TaggedSource): void {
  db()
    .prepare(
      `INSERT INTO sources (id, kind, summary_json, tags_json, tagged_at)
       VALUES (@id, @kind, @summary_json, @tags_json, @tagged_at)
       ON CONFLICT(id) DO UPDATE SET tags_json = excluded.tags_json`
    )
    .run({
      id: src.id,
      kind: src.kind,
      summary_json: JSON.stringify({ title: src.title, summary: src.summary }),
      tags_json: JSON.stringify(src.tags),
      tagged_at: new Date().toISOString(),
    });
}

// ---- theme cache ----------------------------------------------------------

export function themeExists(sourceKey: string): boolean {
  const row = db()
    .prepare("SELECT 1 FROM themes WHERE source_key = ?")
    .get(sourceKey);
  return !!row;
}

export function saveTheme(
  sourceKey: string,
  tag: string,
  date: string,
  sourceJson: string
): void {
  db()
    .prepare(
      `INSERT OR IGNORE INTO themes (source_key, tag, first_generated_date, source_json)
       VALUES (?, ?, ?, ?)`
    )
    .run(sourceKey, tag, date, sourceJson);
}

// ---- ideas ----------------------------------------------------------------

export function insertIdea(
  row: Omit<IdeaRow, "id" | "favorite" | "created_at" | "updated_at">
): number {
  const now = new Date().toISOString();
  const info = db()
    .prepare(
      `INSERT INTO ideas (
        source_key, generation_date, voice, format, tag, source_json, direction,
        justification_support, justification_interest, evidence_strength,
        interest_score, rank_score, status, question, user_answer,
        rejection_reason, created_at, updated_at
      ) VALUES (
        @source_key, @generation_date, @voice, @format, @tag, @source_json, @direction,
        @justification_support, @justification_interest, @evidence_strength,
        @interest_score, @rank_score, @status, @question, @user_answer,
        @rejection_reason, @created_at, @updated_at
      )`
    )
    .run({ ...row, created_at: now, updated_at: now });
  return Number(info.lastInsertRowid);
}

export function getIdea(id: number): IdeaRow | null {
  return (
    (db().prepare("SELECT * FROM ideas WHERE id = ?").get(id) as
      | IdeaRow
      | undefined) ?? null
  );
}

export function updateIdea(id: number, patch: Partial<IdeaRow>): void {
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  const setSql = cols.map((c) => `${c} = @${c}`).join(", ");
  db()
    .prepare(`UPDATE ideas SET ${setSql}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...patch, id, updated_at: new Date().toISOString() });
}

export function setFavorite(id: number, favorite: boolean): void {
  db()
    .prepare("UPDATE ideas SET favorite = ?, updated_at = ? WHERE id = ?")
    .run(favorite ? 1 : 0, new Date().toISOString(), id);
}

export function listIdeas(opts: {
  date?: string;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
}): IdeaRow[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  // In favorites mode we show saved ideas across all dates; otherwise scope to
  // the requested day.
  if (opts.favoritesOnly) {
    clauses.push("favorite = 1");
  } else if (opts.date) {
    clauses.push("generation_date = @date");
    params.date = opts.date;
  }
  if (!opts.includeArchived) {
    clauses.push("status IN ('ready','needs_input','finalized')");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db()
    .prepare(
      `SELECT * FROM ideas ${where}
       ORDER BY rank_score DESC, id DESC`
    )
    .all(params) as IdeaRow[];
}

export function distinctDates(): string[] {
  const rows = db()
    .prepare(
      "SELECT DISTINCT generation_date FROM ideas ORDER BY generation_date DESC"
    )
    .all() as { generation_date: string }[];
  return rows.map((r) => r.generation_date);
}
