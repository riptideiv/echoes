import assert from "node:assert/strict";
import test from "node:test";
import { clusterByTag } from "../lib/cluster";
import {
  chunkTranscript,
  prepareSessionSources,
  type SessionDigest,
  type SessionDigestCache,
} from "../lib/session-digest";
import { sourceTagCacheId } from "../lib/tag";
import type {
  Source,
  TaggedSource,
  TranscriptTurn,
} from "../lib/types";

class MemoryDigestCache implements SessionDigestCache {
  values = new Map<string, SessionDigest>();

  get(key: string): SessionDigest | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, _stage: "chunk" | "rollup", digest: SessionDigest): void {
    this.values.set(key, digest);
  }
}

function sessionSource(turns: TranscriptTurn[]): Source {
  return {
    id: "session:codex:cache-test",
    kind: "session",
    title: "Cache test",
    summary: "Unprocessed session",
    project: "echoes",
    detail: [],
    startTs: turns[0].timestamp,
    endTs: turns[turns.length - 1].timestamp,
    weight: 1,
    transcript: turns,
    sessionProvider: "codex",
  };
}

test("chunks retain chronological material from the full transcript", () => {
  const turns: TranscriptTurn[] = [
    {
      role: "user",
      text: "The earliest architecture decision",
      timestamp: 1_700_000_000_000,
    },
    {
      role: "assistant",
      text: "The middle packaging explanation",
      timestamp: 1_700_000_001_000,
    },
    {
      role: "user",
      text: "The latest organization struggle",
      timestamp: 1_700_000_002_000,
    },
  ];
  const chunks = chunkTranscript(turns, 100);
  assert.ok(chunks.length > 1);
  assert.match(chunks[0], /earliest architecture/);
  assert.match(chunks[chunks.length - 1], /latest organization/);
});

test("reuses unchanged chunk and rollup digests and revises only changed sessions", async () => {
  const cache = new MemoryDigestCache();
  const calls: { stage: "chunk" | "rollup"; input: string }[] = [];
  const summarize = async (
    stage: "chunk" | "rollup",
    input: string,
  ): Promise<SessionDigest> => {
    calls.push({ stage, input });
    return {
      overview: `${stage} summary`,
      evidence: [
        input.includes("npm") ? "Learned npm packaging" : "Session evidence",
      ],
    };
  };
  const turns: TranscriptTurn[] = [
    {
      role: "user",
      text: "I decided to learn npm packaging and publish the release myself.",
      timestamp: 1_700_000_000_000,
    },
    {
      role: "assistant",
      text: "The final answer explained bin entries and standalone Next.js.",
      timestamp: 1_700_000_001_000,
    },
  ];

  const first = await prepareSessionSources([sessionSource(turns)], {
    cache,
    summarize,
    maxChunkChars: 120,
  });
  const firstCallCount = calls.length;
  assert.ok(firstCallCount >= 3);
  assert.match(first[0].summary, /Learned npm packaging/);
  assert.ok(first[0].revision);
  assert.equal(first[0].transcript, undefined);

  calls.length = 0;
  const unchanged = await prepareSessionSources([sessionSource(turns)], {
    cache,
    summarize,
    maxChunkChars: 120,
  });
  assert.equal(calls.length, 0);
  assert.equal(unchanged[0].revision, first[0].revision);

  calls.length = 0;
  const appendedTurns = [...turns, {
    role: "user" as const,
    text: "I struggled to organize the CLI code before the checkpoint.",
    timestamp: 1_700_000_002_000,
  }];
  const changed = await prepareSessionSources(
    [sessionSource(appendedTurns)],
    { cache, summarize, maxChunkChars: 120 },
  );
  assert.ok(calls.length > 0);
  assert.ok(calls.length < firstCallCount);
  assert.notEqual(changed[0].revision, first[0].revision);
});

test("theme keys include both source revisions and the selected tag", () => {
  const base: TaggedSource = {
    ...sessionSource([{
      role: "user",
      text: "Build the package",
      timestamp: 1_700_000_000_000,
    }]),
    transcript: undefined,
    revision: "revision-a",
    tags: ["web-dev"],
  };
  const revisionA = clusterByTag([base])[0].sourceKey;
  const revisionB = clusterByTag([{
    ...base,
    revision: "revision-b",
  }])[0].sourceKey;
  const differentTag = clusterByTag([{
    ...base,
    tags: ["ai-tooling"],
  }])[0].sourceKey;

  assert.notEqual(revisionA, revisionB);
  assert.notEqual(revisionA, differentTag);
  assert.notEqual(sourceTagCacheId(base), sourceTagCacheId({
    ...base,
    revision: "revision-b",
  }));
});
