"use client";

import { useEffect, useRef, useState } from "react";
import Star from "./Star";
import LocalTools from "./LocalTools";
import { VOICE_LABEL, type Idea } from "../types";

function IdeaTags({ idea }: { idea: Idea }) {
  const needsInput = idea.status === "needs_input";
  return (
    <div className="tags">
      <span className="chip voice">{VOICE_LABEL[idea.voice]}</span>
      <span className="chip">#{idea.tag}</span>
      <span className="chip score">rank {idea.rank_score.toFixed(2)}</span>
      <span className="chip">evidence {idea.evidence_strength.toFixed(2)}</span>
      <span className="chip">interest {idea.interest_score}/10</span>
      {idea.status === "finalized" && <span className="chip score">✓ finalized</span>}
      {needsInput && <span className="chip needs">needs your input</span>}
      {idea.status === "rejected" && <span className="chip">dismissed</span>}
    </div>
  );
}

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDetailsOpen(false);
  }, [idea?.id]);

  useEffect(() => {
    if (!detailsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      detailsButtonRef.current?.focus();
    };
  }, [detailsOpen]);

  if (!idea) {
    return (
      <aside className="preview">
        <div className="card preview-summary">
          <p className="muted">Select an idea to see its summary.</p>
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
    } catch (cause) {
      setError(String(cause));
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
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const needsInput = idea.status === "needs_input";
  const sourceList = (
    <ul className="source-list">
      {idea.source.map((source, index) => (
        <li key={index}>{source}</li>
      ))}
    </ul>
  );

  return (
    <aside className="preview">
      <div className={`card preview-summary v-${idea.voice}`}>
        <div className="card-head">
          <p className="eyebrow">Selected idea</p>
          <Star filled={!!idea.favorite} onClick={() => onToggleFavorite(idea)} />
        </div>
        <p className="direction">{idea.direction}</p>
        <IdeaTags idea={idea} />
        <div className="section">
          <div className="label">Source — what you did</div>
          {sourceList}
        </div>
        <div className="section">
          <div className="label">Why it&apos;s worth posting</div>
          <div>{idea.justification_interest}</div>
        </div>
        <button
          ref={detailsButtonRef}
          type="button"
          className="primary details-trigger"
          onClick={() => setDetailsOpen(true)}
        >
          Details
        </button>
      </div>

      {detailsOpen && (
        <div className="details-overlay" onMouseDown={() => setDetailsOpen(false)}>
          <section
            className={`details-drawer v-${idea.voice}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="details-drawer-head">
              <p className="eyebrow">Idea details</p>
              <button
                ref={closeButtonRef}
                type="button"
                className="details-close"
                aria-label="Close idea details"
                onClick={() => setDetailsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="details-scroll">
              <div className="details-title-row">
                <h2 id="details-title">{idea.direction}</h2>
                <Star filled={!!idea.favorite} onClick={() => onToggleFavorite(idea)} />
              </div>
              <IdeaTags idea={idea} />

              <div className="section">
                <div className="label">Source — what you did</div>
                {sourceList}
              </div>
              <div className="section">
                <div className="label">Why it&apos;s worth posting</div>
                <div>{idea.justification_interest}</div>
              </div>
              <div className="section">
                <div className="label">Why the source supports it</div>
                <div>{idea.justification_support}</div>
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
                    onChange={(event) => setAnswer(event.target.value)}
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
                <div className="row details-actions">
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

              {error && <div className="local-tools-error">{error}</div>}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
