import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractSessions } from "../lib/extract";

const NOW = Date.parse("2026-07-14T12:00:00.000Z");

function tempProjects(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echoes-claude-"));
}

function writeClaudeSession(
  projects: string,
  sessionId: string,
  records: unknown[],
): void {
  const project = path.join(projects, "-Users-dev-projects-echoes");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(project, `${sessionId}.jsonl`),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
}

test("keeps Claude user messages and completed final answers only", () => {
  const projects = tempProjects();
  const timestamp = "2026-07-14T10:00:00.000Z";
  writeClaudeSession(projects, "visible", [
    {
      type: "ai-title",
      aiTitle: "Learn npm packaging",
      timestamp,
    },
    {
      type: "user",
      uuid: "user-1",
      timestamp,
      message: {
        role: "user",
        content: "I want to publish the package myself.",
      },
    },
    {
      type: "assistant",
      uuid: "assistant-commentary",
      timestamp,
      message: {
        id: "message-commentary",
        role: "assistant",
        stop_reason: "tool_use",
        content: [{
          type: "text",
          text: "I will inspect the package files.",
        }, {
          type: "tool_use",
          id: "tool-1",
          name: "Bash",
          input: {},
        }],
      },
    },
    {
      type: "user",
      uuid: "tool-result",
      timestamp,
      message: {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "private shell output",
        }],
      },
    },
    {
      type: "assistant",
      uuid: "assistant-final",
      timestamp,
      message: {
        id: "message-final",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{
          type: "thinking",
          thinking: "hidden reasoning",
        }, {
          type: "text",
          text: "You learned how npm bin entries launch the packaged CLI.",
        }],
      },
    },
    {
      type: "user",
      uuid: "wrapper",
      timestamp,
      message: {
        role: "user",
        content: "<system-reminder>internal context</system-reminder>",
      },
    },
  ]);

  const source = extractSessions(projects, NOW)[0];
  assert.equal(source.title, "Learn npm packaging");
  assert.equal(source.project, "projects echoes");
  assert.deepEqual(source.transcript, [
    {
      role: "user",
      text: "I want to publish the package myself.",
      timestamp: Date.parse(timestamp),
    },
    {
      role: "assistant",
      text: "You learned how npm bin entries launch the packaged CLI.",
      timestamp: Date.parse(timestamp),
    },
  ]);
  assert.doesNotMatch(
    source.detail.join("\n"),
    /inspect|private shell|hidden reasoning|internal context/i,
  );
});

test("retains old turns when the session has recent visible activity", () => {
  const projects = tempProjects();
  writeClaudeSession(projects, "long-running", [
    {
      type: "user",
      uuid: "old-user",
      timestamp: "2026-06-20T10:00:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "An early organization problem" }],
      },
    },
    {
      type: "assistant",
      uuid: "recent-final",
      timestamp: "2026-07-14T10:00:00.000Z",
      message: {
        id: "recent-message",
        role: "assistant",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "The recent outcome" }],
      },
    },
  ]);

  const source = extractSessions(projects, NOW)[0];
  assert.equal(source.transcript?.length, 2);
  assert.equal(source.startTs, Date.parse("2026-06-20T10:00:00.000Z"));
  assert.equal(source.endTs, Date.parse("2026-07-14T10:00:00.000Z"));
});

test("excludes old sessions, internal sidechains, and files without visible turns", () => {
  const projects = tempProjects();
  writeClaudeSession(projects, "old", [{
    type: "user",
    uuid: "old",
    timestamp: "2026-06-01T00:00:00.000Z",
    message: { role: "user", content: "Too old" },
  }]);
  writeClaudeSession(projects, "sidechain", [{
    type: "user",
    isSidechain: true,
    uuid: "sidechain",
    timestamp: "2026-07-14T10:00:00.000Z",
    message: { role: "user", content: "Internal child task" },
  }]);
  writeClaudeSession(projects, "tools-only", [{
    type: "user",
    uuid: "tool",
    timestamp: "2026-07-14T10:00:00.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", content: "tool output" }],
    },
  }]);

  assert.deepEqual(extractSessions(projects, NOW), []);
});
