import { GEN_TEMPERATURE } from "./config";
import { chatJSON } from "./deepseek";
import type { GeneratedIdea, PostFormat, Theme, Voice } from "./types";

const VOICES = `The user writes a personal blog and LinkedIn posts. They are a high-schooler
entering college who builds a lot with AI tools. Generate ideas across these voices:
- "opinion": a take/argument on something universal they can now speak to (student→college,
  learning to code, building with AI, the state of web dev). The activity EARNS the opinion.
- "technical": how they built X, tradeoffs, tutorials, debugging war stories.
- "professional": LinkedIn career narrative — shipping velocity, internship learnings,
  building in public.
- "indie": product experiments, tool choices, shipping momentum; casual.`;

const SYSTEM = `You turn a developer's real weekly activity into specific, grounded
ideas for FULL-LENGTH BLOG POSTS. ${VOICES}

A blog post sustains a whole narrative: a build story with tradeoffs, an argument
developed over several beats, multiple pieces of evidence. Favor themes with enough
substance to fill that arc.

Rules:
- Every idea MUST be grounded in the supplied activity — cite the specific things they did.
- Prefer variety of voice across the ideas you return.
- justification_support: why the activity genuinely supports this post.
- justification_interest: why it would be interesting to READERS (not generic).
- The activity logs capture WHAT they did but almost never WHY they cared, how they felt,
  what was happening around them, or what was at stake. The best personal/opinion posts hinge
  on exactly that missing context. When an idea would become materially stronger with a piece
  of context only the user knows, set needs_input=true and write ONE concrete "question" asking
  for exactly that piece (their motivation, a frustration, a decision, the stakes). This is
  common — expect roughly a third of ideas to need input, especially opinion/professional ones.
- Otherwise needs_input=false and question=null (the idea already stands on its own).
Return strict JSON.`;

const SHORT_SYSTEM = `You turn a developer's real weekly activity into specific, grounded
ideas for SHORT, CASUAL LINKEDIN POSTS. ${VOICES}

A short post is NOT a mini blog post. It rides on ONE sharp angle — a single crisp
observation, a hot take, a lesson learned, a small "huh, interesting" moment. It trades
completeness for punch and immediacy: a scroll-stopping hook plus a quick payoff, a few
sentences long. Even a single thin source is enough to fuel one.

Rules:
- Every idea MUST be grounded in the supplied activity — cite the specific thing they did.
- The "direction" should read as one tight, postable angle, not a full arc.
- justification_support: why the activity genuinely supports this post.
- justification_interest: why it would stop a reader mid-scroll (specific, not generic).
- Short posts almost always stand on their own single observation, so needs_input should
  usually be false. Only set needs_input=true in the rare case the angle is meaningless
  without one specific piece of context only the user knows; then write ONE concrete question.
- Otherwise needs_input=false and question=null.
Return strict JSON.`;

const VOICE_SET = new Set<Voice>([
  "opinion",
  "technical",
  "professional",
  "indie",
]);

function themeDigest(theme: Theme): string {
  const lines: string[] = [];
  lines.push(`Theme tag: ${theme.tag}`);
  lines.push("");
  for (const s of theme.sources) {
    lines.push(
      `• [${s.kind}] ${s.title}${s.project ? ` (project: ${s.project})` : ""}`
    );
    for (const d of s.detail.slice(0, 4)) lines.push(`    - ${d}`);
  }
  return lines.join("\n");
}

function coerceIdea(raw: any, format: PostFormat): GeneratedIdea | null {
  if (!raw || typeof raw !== "object") return null;
  const voice: Voice = VOICE_SET.has(raw.voice) ? raw.voice : "indie";
  const direction = String(raw.direction ?? "").trim();
  if (!direction) return null;
  const needs = !!raw.needs_input;
  const question =
    needs && raw.question ? String(raw.question).trim() : null;
  const source = Array.isArray(raw.source)
    ? raw.source.map((x: unknown) => String(x)).filter(Boolean)
    : [];
  let interest = Number(raw.interest_score);
  if (!Number.isFinite(interest)) interest = 5;
  interest = Math.max(1, Math.min(10, Math.round(interest)));
  return {
    voice,
    format,
    source,
    direction,
    justification_support: String(raw.justification_support ?? "").trim(),
    justification_interest: String(raw.justification_interest ?? "").trim(),
    interest_score: interest,
    needs_input: needs && !!question,
    question: needs ? question : null,
  };
}

/** Generate 1–3 grounded full-length blog post ideas for a theme. */
export async function generateIdeasForTheme(
  theme: Theme
): Promise<GeneratedIdea[]> {
  const user = `Here is a cluster of things the user actually did this week (tag: ${theme.tag}).
Propose 1 to 3 FULL-LENGTH BLOG POST ideas grounded in it, varying the voice.

ACTIVITY:
${themeDigest(theme)}

Return JSON:
{ "ideas": [ {
  "voice": "opinion|technical|professional|indie",
  "source": ["specific thing they did", ...],
  "direction": "what to write about (one sentence)",
  "justification_support": "why the activity supports it",
  "justification_interest": "why readers would care",
  "interest_score": 1-10,
  "needs_input": false,
  "question": null
} ] }`;

  const parsed = await chatJSON<{ ideas: any[] }>({
    system: SYSTEM,
    user,
    temperature: GEN_TEMPERATURE,
    maxTokens: 2000,
  });

  const ideas = (parsed.ideas ?? [])
    .map((raw) => coerceIdea(raw, "long"))
    .filter((x): x is GeneratedIdea => !!x)
    .slice(0, 3);
  return ideas;
}

/**
 * Generate 1–2 grounded short, casual LinkedIn post ideas for a theme. These
 * ride on a single sharp angle rather than a developed narrative, so a thin
 * theme can still yield a good one.
 */
export async function generateShortIdeasForTheme(
  theme: Theme
): Promise<GeneratedIdea[]> {
  const user = `Here is a cluster of things the user actually did this week (tag: ${theme.tag}).
Propose 1 to 2 SHORT, CASUAL LINKEDIN POST ideas grounded in it, varying the voice.
Each should be one tight, postable angle — not a full blog arc.

ACTIVITY:
${themeDigest(theme)}

Return JSON:
{ "ideas": [ {
  "voice": "opinion|technical|professional|indie",
  "source": ["specific thing they did", ...],
  "direction": "the one angle to post (one sentence)",
  "justification_support": "why the activity supports it",
  "justification_interest": "why it stops a reader mid-scroll",
  "interest_score": 1-10,
  "needs_input": false,
  "question": null
} ] }`;

  const parsed = await chatJSON<{ ideas: any[] }>({
    system: SHORT_SYSTEM,
    user,
    temperature: GEN_TEMPERATURE,
    maxTokens: 1500,
  });

  const ideas = (parsed.ideas ?? [])
    .map((raw) => coerceIdea(raw, "short"))
    .filter((x): x is GeneratedIdea => !!x)
    .slice(0, 2);
  return ideas;
}

export interface RefineResult {
  status: "finalized" | "rejected";
  direction: string;
  justification_support: string;
  justification_interest: string;
  interest_score: number;
  rejection_reason: string | null;
}

/**
 * Re-run one idea after the user answers its gap question. The answer becomes
 * part of the sources. The model either finalizes a strengthened idea or
 * rejects it (the answer revealed it isn't worth posting).
 */
export async function refineIdeaWithAnswer(input: {
  direction: string;
  source: string[];
  question: string;
  answer: string;
}): Promise<RefineResult> {
  const user = `An earlier draft idea had a gap. The user has now answered.

DRAFT DIRECTION: ${input.direction}
GROUNDING (things they did):
${input.source.map((s) => `- ${s}`).join("\n")}

QUESTION ASKED: ${input.question}
USER'S ANSWER: ${input.answer}

Fold the answer into the idea. Decide:
- If the answer makes a worthwhile post, status="finalized" and rewrite the
  direction + justifications incorporating the new context.
- If the answer shows it is NOT worth posting, status="rejected" with a short
  rejection_reason.

Return JSON:
{ "status": "finalized|rejected",
  "direction": "...",
  "justification_support": "...",
  "justification_interest": "...",
  "interest_score": 1-10,
  "rejection_reason": null }`;

  const raw = await chatJSON<any>({
    system: SYSTEM,
    user,
    temperature: GEN_TEMPERATURE,
    maxTokens: 1200,
  });

  const status = raw?.status === "rejected" ? "rejected" : "finalized";
  let interest = Number(raw?.interest_score);
  if (!Number.isFinite(interest)) interest = 5;
  interest = Math.max(1, Math.min(10, Math.round(interest)));
  return {
    status,
    direction: String(raw?.direction ?? input.direction).trim(),
    justification_support: String(raw?.justification_support ?? "").trim(),
    justification_interest: String(raw?.justification_interest ?? "").trim(),
    interest_score: interest,
    rejection_reason:
      status === "rejected"
        ? String(raw?.rejection_reason ?? "Not worth posting.").trim()
        : null,
  };
}
