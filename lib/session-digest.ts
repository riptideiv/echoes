import crypto from "node:crypto";
import { TAG_TEMPERATURE } from "./config";
import {
  getSessionDigestCache,
  saveSessionDigestCache,
} from "./db";
import { chatJSON } from "./deepseek";
import type { Source, TranscriptTurn } from "./types";

const DIGEST_VERSION = 2;
const DEFAULT_CHUNK_CHARS = 24_000;
const MAX_ROLLUP_INPUT_CHARS = 24_000;

export interface SessionDigest {
  overview: string;
  evidence: string[];
}

export interface SessionDigestCache {
  get(key: string): SessionDigest | null;
  set(key: string, stage: "chunk" | "rollup", digest: SessionDigest): void;
}

export type SessionDigestSummarizer = (
  stage: "chunk" | "rollup",
  input: string,
) => Promise<SessionDigest>;

interface DigestNode {
  key: string;
  digest: SessionDigest;
}

const defaultCache: SessionDigestCache = {
  get(key) {
    const raw = getSessionDigestCache(key);
    if (!raw) return null;
    try {
      return normalizeDigest(JSON.parse(raw), "Cached session activity", 30);
    } catch {
      return null;
    }
  },
  set(key, stage, digest) {
    saveSessionDigestCache(key, stage, JSON.stringify(digest));
  },
};

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
}

function normalizeDigest(
  value: unknown,
  fallbackOverview: string,
  evidenceLimit: number,
): SessionDigest {
  const candidate = value && typeof value === "object"
    ? value as { overview?: unknown; evidence?: unknown }
    : {};
  const overview = typeof candidate.overview === "string"
    ? cleanText(candidate.overview, 1_200)
    : cleanText(fallbackOverview, 1_200);
  const evidence = Array.isArray(candidate.evidence)
    ? candidate.evidence
      .filter((item): item is string => typeof item === "string")
      .map((item) => cleanText(item, 320))
      .filter(Boolean)
      .slice(0, evidenceLimit)
    : [];
  return {
    overview: overview || "Coding session activity",
    evidence,
  };
}

function renderTurn(turn: TranscriptTurn): string {
  const timestamp = new Date(turn.timestamp).toISOString();
  return `[${timestamp}] ${turn.role === "user" ? "USER" : "AGENT FINAL"}\n${turn.text.trim()}`;
}

export function transcriptRevision(turns: TranscriptTurn[]): string {
  const canonical = turns.map((turn) => ({
    role: turn.role,
    text: turn.text.trim(),
    timestamp: turn.timestamp,
  }));
  return `session-v${DIGEST_VERSION}:${hash(JSON.stringify(canonical)).slice(0, 24)}`;
}

export function chunkTranscript(
  turns: TranscriptTurn[],
  maxChars = DEFAULT_CHUNK_CHARS,
): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 40) {
    throw new Error("Session transcript chunks must be at least 40 characters.");
  }

  const pieces: string[] = [];
  for (const turn of turns) {
    const rendered = renderTurn(turn);
    if (rendered.length <= maxChars) {
      pieces.push(rendered);
      continue;
    }
    for (let offset = 0; offset < rendered.length; offset += maxChars) {
      pieces.push(rendered.slice(offset, offset + maxChars));
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const separator = current ? "\n\n" : "";
    if (current && current.length + separator.length + piece.length > maxChars) {
      chunks.push(current);
      current = piece;
    } else {
      current += `${separator}${piece}`;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function defaultSummarizer(
  stage: "chunk" | "rollup",
  input: string,
): Promise<SessionDigest> {
  const isChunk = stage === "chunk";
  const system = isChunk
    ? `Summarize one portion of a coding-agent conversation for a personal content-idea tool.
The input contains only the user's messages and the agent's final answers.
Capture concrete decisions, lessons learned, difficulties, tradeoffs, attempted approaches,
organizational problems, and outcomes. Do not invent motivations or quote hidden reasoning.
Return strict JSON with "overview" and an "evidence" array of at most 10 concise facts.`
    : `Consolidate chronological coding-session digests into one faithful whole-session digest.
Represent material from across the entire input, including early decisions and later outcomes.
Preserve distinct lessons, struggles, tradeoffs, organization problems, and changes of mind.
Do not invent details. Return strict JSON with "overview" and an "evidence" array of at most
30 concise facts suitable for grounding blog or LinkedIn ideas.`;
  const raw = await chatJSON<SessionDigest>({
    system,
    user: input,
    temperature: TAG_TEMPERATURE,
    maxTokens: isChunk ? 1_400 : 2_800,
  });
  return normalizeDigest(
    raw,
    isChunk ? "Coding-session transcript segment" : "Complete coding session",
    isChunk ? 10 : 30,
  );
}

function cacheKey(stage: "chunk" | "rollup", input: string): string {
  return `session-digest-v${DIGEST_VERSION}:${stage}:${hash(input)}`;
}

async function digestInput(
  stage: "chunk" | "rollup",
  input: string,
  cache: SessionDigestCache,
  summarize: SessionDigestSummarizer,
  identity = input,
): Promise<DigestNode> {
  const key = cacheKey(stage, identity);
  const cached = cache.get(key);
  if (cached) return { key, digest: cached };
  const digest = normalizeDigest(
    await summarize(stage, input),
    stage === "chunk" ? "Coding-session transcript segment" : "Complete coding session",
    stage === "chunk" ? 10 : 30,
  );
  cache.set(key, stage, digest);
  return { key, digest };
}

function renderDigestNode(node: DigestNode, index: number): string {
  return [
    `### Segment ${index + 1}`,
    node.digest.overview,
    ...node.digest.evidence.map((item) => `- ${item}`),
  ].join("\n");
}

function packNodes(nodes: DigestNode[]): DigestNode[][] {
  const groups: DigestNode[][] = [];
  let group: DigestNode[] = [];
  let length = 0;
  for (const node of nodes) {
    const renderedLength = JSON.stringify(node.digest).length + 40;
    if (
      group.length > 0 &&
      length + renderedLength > MAX_ROLLUP_INPUT_CHARS
    ) {
      groups.push(group);
      group = [];
      length = 0;
    }
    group.push(node);
    length += renderedLength;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

async function rollUpNodes(
  initial: DigestNode[],
  cache: SessionDigestCache,
  summarize: SessionDigestSummarizer,
): Promise<SessionDigest> {
  let nodes = initial;
  while (nodes.length > 1) {
    const groups = packNodes(nodes);
    const next: DigestNode[] = [];
    for (const group of groups) {
      if (group.length === 1) {
        next.push(group[0]);
        continue;
      }
      const input = group
        .map((node, index) => renderDigestNode(node, index))
        .join("\n\n");
      const identity = group.map((node) => node.key).join("|");
      next.push(await digestInput(
        "rollup",
        input,
        cache,
        summarize,
        identity,
      ));
    }
    if (next.length === nodes.length) {
      throw new Error("Session digest rollup could not reduce its input.");
    }
    nodes = next;
  }
  return nodes[0].digest;
}

function fallbackDigest(source: Source): SessionDigest {
  const turns = source.transcript ?? [];
  const evidence = turns.map((turn) =>
    `${turn.role === "user" ? "User" : "Agent"}: ${cleanText(turn.text, 280)}`
  );
  if (evidence.length <= 30) {
    return {
      overview: `${source.title}: ${turns.length} visible conversation turn(s)`,
      evidence,
    };
  }
  const sampled: string[] = [];
  for (let index = 0; index < 30; index++) {
    sampled.push(evidence[Math.floor(index * (evidence.length - 1) / 29)]);
  }
  return {
    overview: `${source.title}: ${turns.length} visible conversation turn(s)`,
    evidence: [...new Set(sampled)],
  };
}

async function prepareSessionSource(
  source: Source,
  options: {
    cache: SessionDigestCache;
    summarize: SessionDigestSummarizer;
    maxChunkChars: number;
  },
): Promise<Source> {
  const turns = source.transcript ?? [];
  if (source.kind !== "session" || turns.length === 0) return source;

  const revision = transcriptRevision(turns);
  let digest: SessionDigest;
  try {
    const chunks = chunkTranscript(turns, options.maxChunkChars);
    const nodes: DigestNode[] = [];
    for (const chunk of chunks) {
      nodes.push(await digestInput(
        "chunk",
        chunk,
        options.cache,
        options.summarize,
      ));
    }
    digest = await rollUpNodes(nodes, options.cache, options.summarize);
  } catch (error) {
    console.warn(
      `[session-digest] failed for ${source.id}; using a deterministic fallback:`,
      error,
    );
    digest = fallbackDigest(source);
  }

  return {
    ...source,
    revision,
    summary: [
      `${source.sessionProvider === "codex" ? "Codex" : "Claude Code"} session`,
      source.project ? `Project: ${source.project}` : "",
      `Title: ${source.title}`,
      digest.overview,
      ...digest.evidence.map((item) => `- ${item}`),
    ].filter(Boolean).join("\n"),
    detail: digest.evidence.length ? digest.evidence : [digest.overview],
    transcript: undefined,
  };
}

export async function prepareSessionSources(
  sources: Source[],
  options: {
    cache?: SessionDigestCache;
    summarize?: SessionDigestSummarizer;
    maxChunkChars?: number;
  } = {},
): Promise<Source[]> {
  const cache = options.cache ?? defaultCache;
  const summarize = options.summarize ?? defaultSummarizer;
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_CHUNK_CHARS;
  const prepared: Source[] = [];
  // Keep model traffic sequential. A first run can discover many sessions,
  // and a burst of one request per session is both costly and rate-limit prone.
  for (const source of sources) {
    prepared.push(await prepareSessionSource(source, {
      cache,
      summarize,
      maxChunkChars,
    }));
  }
  return prepared;
}
