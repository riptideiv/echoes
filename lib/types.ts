import type { Tag } from "./config";

/** An atomic unit of activity: one Claude session or one browsing cluster. */
export interface Source {
  id: string; // stable id: "session:<sessionId>" or "web:<slug>"
  kind: "session" | "web";
  title: string; // short human label
  summary: string; // compact text fed to the tagger (token-conscious)
  project?: string; // decoded project dir, for sessions
  detail: string[]; // bullet lines shown on the card as concrete evidence
  startTs: number; // epoch ms
  endTs: number; // epoch ms
  weight: number; // volume signal (session count-equivalent / visit count)
}

export interface TaggedSource extends Source {
  tags: Tag[];
}

/** A group of sources sharing a dominant tag. */
export interface Theme {
  sourceKey: string; // sha256 of sorted member source ids — the cache unit
  tag: Tag;
  sources: TaggedSource[];
}

export type Voice =
  | "opinion"
  | "technical"
  | "professional"
  | "indie";

/**
 * How much the idea is meant to become:
 * - "long": a full-length blog post — a developed narrative/argument.
 * - "short": a casual LinkedIn post — one sharp angle, punchy, stands alone.
 */
export type PostFormat = "long" | "short";

export type IdeaStatus = "ready" | "needs_input" | "finalized" | "rejected";

/** What the LLM returns per idea. */
export interface GeneratedIdea {
  voice: Voice;
  format: PostFormat;
  source: string[]; // specific activities cited
  direction: string;
  justification_support: string;
  justification_interest: string;
  interest_score: number; // 1..10
  needs_input: boolean;
  question: string | null;
}

/** A persisted idea row (subset of columns the UI needs). */
export interface IdeaRow {
  id: number;
  source_key: string;
  generation_date: string; // YYYY-MM-DD
  voice: Voice;
  format: PostFormat;
  tag: string;
  source_json: string; // JSON string[] of cited activities
  direction: string;
  justification_support: string;
  justification_interest: string;
  evidence_strength: number;
  interest_score: number;
  rank_score: number;
  status: IdeaStatus;
  question: string | null;
  user_answer: string | null;
  rejection_reason: string | null;
  favorite: number; // 0 | 1
  created_at: string;
  updated_at: string;
}
