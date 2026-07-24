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

interface FixtureTurn {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  phase?: "commentary" | "final_answer";
}

function writeSession(
  home: string,
  area: "sessions" | "archived_sessions",
  name: string,
  options: {
    id: string;
    cwd?: string;
    source?: unknown;
    threadSource?: unknown;
    originator?: string;
    parentThreadId?: string;
    turns?: FixtureTurn[];
    legacyPrompts?: string[];
    timestamp?: string;
    malformed?: boolean;
    extraRecords?: unknown[];
  },
): void {
  const dir = area === "sessions"
    ? path.join(home, area, "2026", "07", "14")
    : path.join(home, area);
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = options.timestamp ?? "2026-07-14T10:00:00.000Z";
  const records: string[] = [JSON.stringify({
    timestamp,
    type: "session_meta",
    payload: {
      id: options.id,
      cwd: options.cwd ?? "/Users/dev/projects/echoes",
      source: options.source ?? "vscode",
      thread_source: options.threadSource,
      originator: options.originator ?? "Codex Desktop",
      parent_thread_id: options.parentThreadId,
    },
  })];
  if (options.malformed) records.push("{broken");
  for (const turn of options.turns ?? [{
    role: "user",
    text: "Build a resilient activity extractor",
  }]) {
    records.push(JSON.stringify({
      timestamp: turn.timestamp ?? timestamp,
      type: "response_item",
      payload: {
        type: "message",
        role: turn.role,
        phase: turn.role === "assistant"
          ? turn.phase ?? "final_answer"
          : undefined,
        content: [{
          type: turn.role === "user" ? "input_text" : "output_text",
          text: turn.text,
        }],
      },
    }));
  }
  for (const prompt of options.legacyPrompts ?? []) {
    records.push(JSON.stringify({
      timestamp,
      type: "event_msg",
      payload: { type: "user_message", message: prompt },
    }));
  }
  for (const record of options.extraRecords ?? []) {
    records.push(JSON.stringify(record));
  }
  fs.writeFileSync(path.join(dir, `${name}.jsonl`), `${records.join("\n")}\n`);
}

test("extracts active and archived sessions with titles, projects, and collision-safe ids", () => {
  const home = tempHome();
  writeSession(home, "sessions", "active", {
    id: "active-id",
    malformed: true,
  });
  writeSession(home, "archived_sessions", "archived", {
    id: "archive-id",
    cwd: "/work/other-project",
    turns: [{ role: "user", text: "Archived prompt" }],
  });
  fs.writeFileSync(path.join(home, "session_index.jsonl"), [
    "not json",
    JSON.stringify({
      id: "active-id",
      thread_name: "Indexed title",
      updated_at: "2026-07-14T10:00:00Z",
    }),
  ].join("\n"));

  const sources = extractCodexSessions(home, NOW)
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(sources.length, 2);
  assert.equal(sources[0].id, "session:codex:active-id");
  assert.equal(sources[0].title, "Indexed title");
  assert.equal(sources[0].project, "echoes");
  assert.match(sources[0].summary, /^Codex session/);
  assert.equal(sources[1].title, "Archived prompt");
  assert.equal(sources[1].project, "other-project");
});

test("includes persisted interactive child chats but filters internal sessions", () => {
  const home = tempHome();
  writeSession(home, "sessions", "old", {
    id: "old",
    timestamp: "2026-06-01T00:00:00Z",
  });
  writeSession(home, "sessions", "automation", {
    id: "automation",
    source: "automation",
  });
  writeSession(home, "sessions", "onboarding", {
    id: "onboarding",
    source: "onboarding",
  });
  writeSession(home, "sessions", "subagent", {
    id: "subagent",
    source: { subagent: { other: "worker" } },
  });
  writeSession(home, "sessions", "thread-subagent", {
    id: "thread-subagent",
    threadSource: "subagent",
  });
  writeSession(home, "sessions", "child", {
    id: "child",
    parentThreadId: "parent",
    turns: [{ role: "user", text: "A persisted forked discussion" }],
  });
  writeSession(home, "sessions", "claude", {
    id: "claude",
    originator: "claude-code",
  });
  writeSession(home, "sessions", "empty", {
    id: "empty",
    turns: [{
      role: "user",
      text: "<environment_context>hidden</environment_context>",
    }],
  });

  const sources = extractCodexSessions(home, NOW);
  assert.deepEqual(sources.map((source) => source.id), [
    "session:codex:child",
  ]);
});

test("keeps user messages and final answers while excluding commentary and tool traffic", () => {
  const home = tempHome();
  const timestamp = "2026-07-14T10:00:00.000Z";
  writeSession(home, "sessions", "visible", {
    id: "visible",
    turns: [
      {
        role: "user",
        text: "I decided to publish the npm package myself.",
      },
      {
        role: "assistant",
        phase: "commentary",
        text: "I am inspecting package.json.",
      },
      {
        role: "assistant",
        phase: "final_answer",
        text: "You now have a working production CLI checkpoint.",
      },
    ],
    legacyPrompts: ["I decided to publish the npm package myself."],
    extraRecords: [
      {
        timestamp,
        type: "response_item",
        payload: { type: "reasoning", summary: ["hidden"] },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "function_call", name: "exec_command" },
      },
      {
        timestamp,
        type: "response_item",
        payload: { type: "function_call_output", output: "private output" },
      },
    ],
  });

  const source = extractCodexSessions(home, NOW)[0];
  assert.deepEqual(source.transcript, [
    {
      role: "user",
      text: "I decided to publish the npm package myself.",
      timestamp: Date.parse(timestamp),
    },
    {
      role: "assistant",
      text: "You now have a working production CLI checkpoint.",
      timestamp: Date.parse(timestamp),
    },
  ]);
  assert.doesNotMatch(source.detail.join("\n"), /inspecting|private|hidden/i);
});

test("uses recent visible activity for eligibility while retaining the entire session", () => {
  const home = tempHome();
  writeSession(home, "sessions", "long-running", {
    id: "long-running",
    turns: [
      {
        role: "user",
        text: "The session started with an old architecture decision.",
        timestamp: "2026-06-20T10:00:00.000Z",
      },
      {
        role: "assistant",
        text: "The recent final answer records the outcome.",
        timestamp: "2026-07-14T10:00:00.000Z",
      },
    ],
  });

  const source = extractCodexSessions(home, NOW)[0];
  assert.equal(source.transcript?.length, 2);
  assert.equal(source.startTs, Date.parse("2026-06-20T10:00:00.000Z"));
  assert.equal(source.endTs, Date.parse("2026-07-14T10:00:00.000Z"));
});

test("deduplicates by id, preferring the most complete rollout", () => {
  const home = tempHome();
  writeSession(home, "sessions", "partial", {
    id: "same",
    turns: [{ role: "user", text: "First prompt" }],
  });
  writeSession(home, "archived_sessions", "complete", {
    id: "same",
    turns: [
      { role: "user", text: "First prompt" },
      { role: "assistant", text: "Final response" },
    ],
  });
  const sources = extractCodexSessions(home, NOW);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].transcript?.length, 2);
});

test("falls back to legacy user events when structured messages are absent", () => {
  const home = tempHome();
  writeSession(home, "sessions", "legacy", {
    id: "legacy",
    turns: [],
    legacyPrompts: ["Legacy user prompt"],
  });
  const source = extractCodexSessions(home, NOW)[0];
  assert.equal(source.transcript?.[0].text, "Legacy user prompt");
});

test("missing Codex directories and indexes are harmless", () => {
  assert.deepEqual(
    extractCodexSessions(path.join(tempHome(), "missing"), NOW),
    [],
  );
});
