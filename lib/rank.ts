import { WINDOW_DAYS } from "./config";
import type { Theme } from "./types";

const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Evidence strength in [0,1] from how much real activity backs a theme:
 * number of sessions (the strongest signal), browsing volume, and recency.
 * Saturating so one huge day doesn't dominate.
 */
export function evidenceStrength(theme: Theme, now = Date.now()): number {
  const sessions = theme.sources.filter((s) => s.kind === "session");
  const web = theme.sources.filter((s) => s.kind === "web");

  const sessionScore = 1 - Math.exp(-sessions.length / 2);
  const webWeight = web.reduce((n, s) => n + s.weight, 0);
  const webScore = 1 - Math.exp(-webWeight / 120);

  const maxEnd = Math.max(...theme.sources.map((s) => s.endTs));
  const age = now - maxEnd;
  const recencyScore = Math.max(0, Math.min(1, (WINDOW_MS - age) / WINDOW_MS));

  const evidence =
    0.55 * sessionScore + 0.25 * webScore + 0.2 * recencyScore;
  return Math.round(evidence * 1000) / 1000;
}

/** rank = evidence_strength × normalized interest (1..10 -> 0..1). */
export function rankScore(evidence: number, interest: number): number {
  const clamped = Math.max(1, Math.min(10, interest));
  return Math.round(evidence * (clamped / 10) * 1000) / 1000;
}
