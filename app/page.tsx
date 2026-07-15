"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import IdeaRow from "./components/IdeaRow";
import IdeaPreview from "./components/IdeaPreview";
import RankView from "./components/RankView";
import {
  FORMAT_LABEL,
  VOICES,
  VOICE_LABEL,
  type FormatFilter,
  type Idea,
  type VoiceFilter,
} from "./types";

type View = "cards" | "rank";

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  const [archived, setArchived] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [voice, setVoice] = useState<VoiceFilter>("all");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [view, setView] = useState<View>("cards");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { date?: string; arch?: boolean; saved?: boolean }) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (opts?.saved) params.set("favorites", "1");
      else if (opts?.date) params.set("date", opts.date);
      if (opts?.arch) params.set("archived", "1");
      const res = await fetch(`/api/ideas?${params.toString()}`);
      const data = await res.json();
      setIdeas(data.ideas);
      setDates(data.dates);
      if (data.date) setDate(data.date);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const reload = (over?: {
    date?: string;
    arch?: boolean;
    saved?: boolean;
  }) =>
    load({
      date: over?.date ?? date,
      arch: over?.arch ?? archived,
      saved: over?.saved ?? savedOnly,
    });

  const generate = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const res = await fetch("/api/generate", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const r = data.report;
      setNotice(
        r.themesNew === 0
          ? `Up to date — all ${r.themesTotal} themes cached, no new ideas (0 LLM calls).`
          : `Generated ${r.ideasCreated} ideas from ${r.themesNew} new theme(s). ${r.themesCached} cached.`
      );
      await reload();
    } catch (e) {
      setNotice(`Generation failed: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  // Voice counts are scoped to the active format so the numbers match the list.
  const byFormat = useMemo(
    () => (format === "all" ? ideas : ideas.filter((i) => i.format === format)),
    [ideas, format]
  );

  const counts = useMemo(() => {
    const c: Record<VoiceFilter, number> = {
      all: 0,
      opinion: 0,
      technical: 0,
      professional: 0,
      indie: 0,
    };
    for (const i of byFormat) {
      c.all++;
      c[i.voice]++;
    }
    return c;
  }, [byFormat]);

  const formatCounts = useMemo(() => {
    const c: Record<FormatFilter, number> = { all: 0, long: 0, short: 0 };
    for (const i of ideas) {
      c.all++;
      c[i.format]++;
    }
    return c;
  }, [ideas]);

  const filtered = useMemo(
    () =>
      voice === "all" ? byFormat : byFormat.filter((i) => i.voice === voice),
    [byFormat, voice]
  );

  const selected = useMemo(
    () => filtered.find((i) => i.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    if (filtered.length === 0) setSelectedId(null);
    else if (!filtered.some((i) => i.id === selectedId))
      setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (voice !== "all" && counts[voice] === 0) setVoice("all");
  }, [counts, voice]);

  const patchIdea = (updated: Idea) => {
    setIdeas((prev) => {
      if (!archived && updated.status === "rejected") {
        return prev.filter((i) => i.id !== updated.id);
      }
      return prev.map((i) => (i.id === updated.id ? updated : i));
    });
  };

  const toggleFavorite = async (idea: Idea) => {
    const next = !idea.favorite;
    // Optimistic update.
    setIdeas((prev) =>
      prev
        .map((i) => (i.id === idea.id ? { ...i, favorite: next ? 1 : 0 } : i))
        // In the Saved view, un-starring removes it from the list.
        .filter((i) => !(savedOnly && i.id === idea.id && !next))
    );
    try {
      const res = await fetch(`/api/idea/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
    } catch {
      // Revert on failure.
      reload();
    }
  };

  const savedCount = useMemo(
    () => ideas.filter((i) => i.favorite).length,
    [ideas]
  );

  return (
    <main className="wrap wide">
      <div className="topbar">
        <h1>🌊 Echoes of the Week</h1>
        <div className="controls">
          {!savedOnly && dates.length > 0 && (
            <select
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                reload({ date: e.target.value });
              }}
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <button
            className={savedOnly ? "primary" : ""}
            onClick={() => {
              const next = !savedOnly;
              setSavedOnly(next);
              reload({ saved: next });
            }}
          >
            {savedOnly ? "★ Saved" : "☆ Saved"}
          </button>
          <button
            onClick={() => {
              const next = !archived;
              setArchived(next);
              reload({ arch: next });
            }}
          >
            {archived ? "Hide dismissed" : "Show dismissed"}
          </button>
          <button className="primary" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate today's ideas"}
          </button>
        </div>
      </div>
      <p className="sub">
        Blog & LinkedIn post ideas mined from your Claude Code and Codex sessions,
        plus browsing this week — ranked by evidence × interest.
      </p>

      {notice && <div className="banner">{notice}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : ideas.length === 0 ? (
        <div className="empty">
          {savedOnly ? (
            <>No saved ideas yet — star ideas to keep them here.</>
          ) : (
            <>
              No ideas yet for this date. Click{" "}
              <b>Generate today&apos;s ideas</b> to mine your week.
            </>
          )}
        </div>
      ) : (
        <>
          <div className="filterbar">
            {(["all", ...VOICES] as VoiceFilter[]).map((v) => (
              <button
                key={v}
                className={`v-${v} ${voice === v ? "active" : ""}`}
                onClick={() => setVoice(v)}
                disabled={v !== "all" && counts[v] === 0}
              >
                {v !== "all" && <span className="dot" />}
                {v === "all" ? "All" : VOICE_LABEL[v]}
                <span className="count">{counts[v]}</span>
              </button>
            ))}
          </div>

          <div className="count-line">
            {savedOnly && <span>★ {savedCount} saved</span>}
            <span>
              {filtered.length}/{ideas.length}
            </span>
            <span className="viewtoggle">
              {(["all", "long", "short"] as FormatFilter[]).map((f) => (
                <button
                  key={f}
                  className={format === f ? "active" : ""}
                  onClick={() => setFormat(f)}
                  disabled={f !== "all" && formatCounts[f] === 0}
                >
                  {f === "all" ? "All" : FORMAT_LABEL[f]}
                  <span className="count">{formatCounts[f]}</span>
                </button>
              ))}
            </span>
            <span className="viewtoggle">
              {(["cards", "rank"] as View[]).map((v) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => setView(v)}
                >
                  {v === "cards" ? "Cards" : "Rank"}
                </button>
              ))}
            </span>
          </div>

          <div className="two-pane">
            {view === "cards" ? (
              <div className="list">
                {filtered.map((idea, i) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    rank={i + 1}
                    selected={idea.id === (selected?.id ?? selectedId)}
                    onSelect={() => setSelectedId(idea.id)}
                    onToggleFavorite={() => toggleFavorite(idea)}
                  />
                ))}
              </div>
            ) : (
              <RankView
                ideas={filtered}
                selectedId={selected?.id ?? selectedId}
                onSelect={setSelectedId}
                onToggleFavorite={toggleFavorite}
              />
            )}
            <IdeaPreview
              idea={selected}
              onChange={patchIdea}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        </>
      )}
    </main>
  );
}
