// Client-side shape returned by the API (mirrors IdeaRow + parsed source[]).
export interface Idea {
  id: number;
  source_key: string;
  generation_date: string;
  voice: "opinion" | "technical" | "professional" | "indie";
  format: "long" | "short";
  tag: string;
  source: string[];
  direction: string;
  justification_support: string;
  justification_interest: string;
  evidence_strength: number;
  interest_score: number;
  rank_score: number;
  status: "ready" | "needs_input" | "finalized" | "rejected";
  question: string | null;
  user_answer: string | null;
  rejection_reason: string | null;
  favorite: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export const VOICE_LABEL: Record<Idea["voice"], string> = {
  opinion: "Opinion",
  technical: "Technical",
  professional: "Professional",
  indie: "Indie",
};

export const VOICES: Idea["voice"][] = [
  "opinion",
  "technical",
  "professional",
  "indie",
];

export type VoiceFilter = "all" | Idea["voice"];

export const FORMAT_LABEL: Record<Idea["format"], string> = {
  long: "Blog",
  short: "LinkedIn",
};

export type FormatFilter = "all" | Idea["format"];
