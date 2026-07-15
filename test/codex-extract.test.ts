import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractCodexSessions } from "../lib/codex-extract";

const NOW = Date.parse("2026-07-14T12:00:00.000Z");

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echoes-codex-"));
}

function writeSession(home: string, area: "sessions" | "archived_sessions", name: string, options: {
  id: string;
  cwd?: string;
  source?: unknown;
  originator?: string;
  parentThreadId?: string;
  prompts?: string[];
  timestamp?: string;
  malformed?: boolean;
}): void {
  const dir = area === "sessions" ? path.join(home, area, "2026", "07", "14") : path.join(home, area);
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = options.timestamp ?? "2026-07-14T10:00:00.000Z";
  const records: string[] = [JSON.stringify({
    timestamp,
    type: "session_meta",
    payload: {
      id: options.id,
      cwd: options.cwd ?? "/Users/dev/projects/echoes",
      source: options.source ?? "vscode",
      originator: options.originator ?? "Codex Desktop",
      parent_thread_id: options.parentThreadId,
    },
  })];
  if (options.malformed) records.push("{broken");
  for (const prompt of options.prompts ?? ["Build a resilient activity extractor"])
    records.push(JSON.stringify({ timestamp, type: "event_msg", payload: { type: "user_message", message: prompt } }));
  fs.writeFileSync(path.join(dir, `${name}.jsonl`), `${records.join("\n")}\n`);
}

test("extracts active and archived sessions with titles, projects, and collision-safe ids", () => {
  const home = tempHome();
  writeSession(home, "sessions", "active", { id: "active-id", malformed: true });
  writeSession(home, "archived_sessions", "archived", { id: "archive-id", cwd: "/work/other-project", prompts: ["Archived prompt"] });
  fs.writeFileSync(path.join(home, "session_index.jsonl"), [
    "not json",
    JSON.stringify({ id: "active-id", thread_name: "Indexed title", updated_at: "2026-07-14T10:00:00Z" }),
  ].join("\n"));

  const sources = extractCodexSessions(home, NOW).sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(sources.length, 2);
  assert.equal(sources[0].id, "session:codex:active-id");
  assert.equal(sources[0].title, "Indexed title");
  assert.equal(sources[0].project, "echoes");
  assert.match(sources[0].summary, /^Codex session/);
  assert.equal(sources[1].title, "Archived prompt");
  assert.equal(sources[1].project, "other-project");
});

test("filters old and non-interactive sessions and falls back for empty prompts", () => {
  const home = tempHome();
  writeSession(home, "sessions", "old", { id: "old", timestamp: "2026-06-01T00:00:00Z" });
  writeSession(home, "sessions", "automation", { id: "automation", source: "automation" });
  writeSession(home, "sessions", "onboarding", { id: "onboarding", source: "onboarding" });
  writeSession(home, "sessions", "subagent", { id: "subagent", source: { subagent: { other: "worker" } } });
  writeSession(home, "sessions", "child", { id: "child", parentThreadId: "parent" });
  writeSession(home, "sessions", "claude", { id: "claude", originator: "claude-code" });
  writeSession(home, "sessions", "empty", { id: "empty", prompts: ["<environment_context>hidden</environment_context>"] });
  const sources = extractCodexSessions(home, NOW);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, "session:codex:empty");
  assert.equal(sources[0].title, "(untitled Codex session)");
});

test("deduplicates by id, preferring the most complete rollout", () => {
  const home = tempHome();
  writeSession(home, "sessions", "partial", { id: "same", prompts: ["First prompt"] });
  writeSession(home, "archived_sessions", "complete", { id: "same", prompts: ["First prompt", "Second prompt"] });
  const sources = extractCodexSessions(home, NOW);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].detail.length, 2);
});

test("missing Codex directories and indexes are harmless", () => {
  assert.deepEqual(extractCodexSessions(path.join(tempHome(), "missing"), NOW), []);
});
