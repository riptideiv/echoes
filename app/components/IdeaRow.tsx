"use client";

import Star from "./Star";
import { FORMAT_LABEL, VOICE_LABEL, type Idea } from "../types";

export default function IdeaRow({
  idea,
  rank,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  idea: Idea;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={`row-card v-${idea.voice} ${selected ? "selected" : ""}`}>
      <span className="accent" aria-hidden />
      <Star
        filled={!!idea.favorite}
        onClick={onToggleFavorite}
        className="row-star"
      />
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="row-hit"
      >
        <div className="row-grid">
          <span className="rank-num">{rank}</span>
          <div style={{ minWidth: 0 }}>
            <div className="tags">
              <span className="chip voice">{VOICE_LABEL[idea.voice]}</span>
              <span className={`chip format fmt-${idea.format}`}>
                {FORMAT_LABEL[idea.format]}
              </span>
              <span className="chip">#{idea.tag}</span>
              {idea.status === "needs_input" && (
                <span className="chip needs">needs input</span>
              )}
              {idea.status === "finalized" && (
                <span className="chip score">✓ finalized</span>
              )}
              {idea.status === "rejected" && (
                <span className="chip">dismissed</span>
              )}
            </div>
            <p className="headline">{idea.direction}</p>
            <p className="snippet">{idea.justification_interest}</p>
            <p className="scoreline">
              rank {idea.rank_score.toFixed(2)} · evidence{" "}
              {idea.evidence_strength.toFixed(2)} · interest{" "}
              {idea.interest_score}/10
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
