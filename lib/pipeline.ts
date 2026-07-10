import { extractAllSources } from "./extract";
import { tagSources } from "./tag";
import { clusterByTag } from "./cluster";
import { generateIdeasForTheme, generateShortIdeasForTheme } from "./generate";
import { evidenceStrength, rankScore } from "./rank";
import { llmCallCount } from "./deepseek";
import {
  insertIdea,
  saveTheme,
  themeExists,
} from "./db";
import type { Theme } from "./types";

export interface RunReport {
  date: string;
  sourcesTotal: number;
  themesTotal: number;
  themesNew: number;
  themesCached: number;
  ideasCreated: number;
  llmCallsBefore: number;
  llmCallsAfter: number;
  errors: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The daily job. Idempotent: only themes whose source_key has never been
 * generated hit the LLM. Ideas are stamped with today's date.
 */
export async function runDailyPipeline(): Promise<RunReport> {
  const date = today();
  const llmCallsBefore = llmCallCount();
  const errors: string[] = [];

  const sources = extractAllSources();
  const tagged = await tagSources(sources);
  const themes = clusterByTag(tagged);

  const fresh: Theme[] = themes.filter((t) => !themeExists(t.sourceKey));
  const cached = themes.length - fresh.length;

  let ideasCreated = 0;
  for (const theme of fresh) {
    // Two grounded formats per theme: full-length blog ideas and short,
    // casual LinkedIn ideas. They use distinct prompts (see lib/generate.ts).
    let generated;
    try {
      const [long, short] = await Promise.all([
        generateIdeasForTheme(theme),
        generateShortIdeasForTheme(theme),
      ]);
      generated = [...long, ...short];
    } catch (err) {
      errors.push(`theme ${theme.tag} (${theme.sourceKey}): ${String(err)}`);
      continue;
    }

    const evidence = evidenceStrength(theme);
    const sourceSnapshot = JSON.stringify(
      theme.sources.map((s) => ({ id: s.id, title: s.title }))
    );

    for (const idea of generated) {
      const rank = rankScore(evidence, idea.interest_score);
      insertIdea({
        source_key: theme.sourceKey,
        generation_date: date,
        voice: idea.voice,
        format: idea.format,
        tag: theme.tag,
        source_json: JSON.stringify(idea.source),
        direction: idea.direction,
        justification_support: idea.justification_support,
        justification_interest: idea.justification_interest,
        evidence_strength: evidence,
        interest_score: idea.interest_score,
        rank_score: rank,
        status: idea.needs_input ? "needs_input" : "ready",
        question: idea.question,
        user_answer: null,
        rejection_reason: null,
      });
      ideasCreated++;
    }

    // Record the theme only after its ideas are persisted, so a mid-run
    // failure doesn't permanently mark it as "done" with no ideas.
    saveTheme(theme.sourceKey, theme.tag, date, sourceSnapshot);
  }

  return {
    date,
    sourcesTotal: sources.length,
    themesTotal: themes.length,
    themesNew: fresh.length,
    themesCached: cached,
    ideasCreated,
    llmCallsBefore,
    llmCallsAfter: llmCallCount(),
    errors,
  };
}
