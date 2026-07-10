"use client";

import { useState } from "react";
import Star from "./Star";
import LocalTools from "./LocalTools";
import { VOICE_LABEL, type Idea } from "../types";

export default function IdeaPreview({
  idea,
  onChange,
  onToggleFavorite,
}: {
  idea: Idea | null;
  onChange: (updated: Idea) => void;
  onToggleFavorite: (idea: Idea) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!idea) {
    return (
      <aside className="preview">
        <div className="card" style={{ marginBottom: 0 }}>
          <p className="muted">Select an idea to see the full breakdown.</p>
        </div>
      </aside>
    );
  }

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id, answer }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed");
      setAnswer("");
      onChange(data.idea as Idea);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchStatus = async (
    status: "finalized" | "rejected",
    reason?: string
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/idea/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejection_reason: reason }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed");
      onChange(data.idea as Idea);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const needsInput = idea.status === "needs_input";

  return (
    <aside className="preview">
      <div className={`card v-${idea.voice}`} style={{ marginBottom: 0 }}>
        <div className="card-head">
          <p className="eyebrow">Selected idea</p>
          <div className="row" style={{ marginTop: 0 }}>
            <Star
              filled={!!idea.favorite}
              onClick={() => onToggleFavorite(idea)}
            />
          </div>
        </div>
        <p className="direction" style={{ marginTop: 6 }}>
          {idea.direction}
        </p>

        <div className="tags" style={{ marginTop: 10 }}>
          <span className="chip voice">{VOICE_LABEL[idea.voice]}</span>
          <span className="chip">#{idea.tag}</span>
          <span className="chip score">rank {idea.rank_score.toFixed(2)}</span>
          <span className="chip">evidence {idea.evidence_strength.toFixed(2)}</span>
          <span className="chip">interest {idea.interest_score}/10</span>
          {idea.status === "finalized" && (
            <span className="chip score">✓ finalized</span>
          )}
          {needsInput && <span className="chip needs">needs your input</span>}
          {idea.status === "rejected" && <span className="chip">dismissed</span>}
        </div>

        <div className="section">
          <div className="label">Source — what you did</div>
          <ul className="source-list">
            {idea.source.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="section">
          <div className="label">Why the source supports it</div>
          <div>{idea.justification_support}</div>
        </div>

        <div className="section">
          <div className="label">Why it&apos;s worth posting</div>
          <div>{idea.justification_interest}</div>
        </div>

        {idea.status === "rejected" && idea.rejection_reason && (
          <div className="section">
            <div className="label">Why it was dropped</div>
            <div className="muted">{idea.rejection_reason}</div>
          </div>
        )}

        {needsInput && idea.question && (
          <div className="q-box">
            <div className="label">One thing only you know</div>
            <div>{idea.question}</div>
            <textarea
              placeholder="Your answer — this gets folded into the idea…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy}
            />
            <div className="row">
              <button
                className="primary"
                onClick={submitAnswer}
                disabled={busy || !answer.trim()}
              >
                {busy ? "Thinking…" : "Answer & complete"}
              </button>
              <button
                onClick={() => patchStatus("rejected", "Dismissed by user.")}
                disabled={busy}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <LocalTools ideaId={idea.id} />

        {(idea.status === "ready" || idea.status === "finalized") && (
          <div className="row">
            {idea.status !== "finalized" && (
              <button onClick={() => patchStatus("finalized")} disabled={busy}>
                Mark finalized
              </button>
            )}
            <button
              onClick={() => patchStatus("rejected", "Dismissed by user.")}
              disabled={busy}
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="muted" style={{ color: "var(--red)", marginTop: 8 }}>
            {error}
          </div>
        )}
      </div>
    </aside>
  );
}
