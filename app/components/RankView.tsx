"use client";

import Star from "./Star";
import type { Idea } from "../types";

function ScoreRing({ score, pct }: { score: number; pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <span className="score-ring">
      <svg viewBox="0 0 36 36" width="36" height="36">
        <circle className="ring-track" cx="18" cy="18" r={r} fill="none" strokeWidth="3" />
        <circle
          className="ring-fill"
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="ring-num">{score}</span>
    </span>
  );
}

/** Compact leaderboard — a quick overview ranked strictly by score. */
export default function RankView({
  ideas,
  selectedId,
  onSelect,
  onToggleFavorite,
}: {
  ideas: Idea[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggleFavorite: (idea: Idea) => void;
}) {
  const max = Math.max(...ideas.map((i) => i.rank_score), 0.001);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Ranked by evidence × interest
      </div>
      <ol className="rank-list">
        {ideas.map((idea, i) => {
          const pct = Math.max(6, Math.round((idea.rank_score / max) * 100));
          const score = Math.round(idea.rank_score * 100);
          return (
            <li
              key={idea.id}
              className={`rank-row v-${idea.voice} ${
                selectedId === idea.id ? "selected" : ""
              }`}
            >
              <span className="rank-num">{i + 1}</span>
              <button
                type="button"
                onClick={() => onSelect(idea.id)}
                aria-pressed={selectedId === idea.id}
                className="rank-hit"
              >
                <span className="dot" aria-hidden />
                <span className="rank-title">{idea.direction}</span>
              </button>
              <Star filled={!!idea.favorite} onClick={() => onToggleFavorite(idea)} />
              <ScoreRing score={score} pct={pct} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
