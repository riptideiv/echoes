"use client";

import { useEffect, useState } from "react";
import type {
  ExtensionEffect,
  ExtensionPanel,
  ExtensionView,
} from "@/lib/extensions/types";

function valuesFor(panel: ExtensionPanel): Record<string, string> {
  return Object.fromEntries(panel.fields.map((field) => [field.id, field.value]));
}

async function applyEffect(effect?: ExtensionEffect) {
  if (!effect) return;
  if (effect.kind === "clipboard") {
    await navigator.clipboard.writeText(effect.text);
    return;
  }
  const blob = new Blob([effect.text], {
    type: effect.mimeType ?? "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = effect.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function LocalTools({ ideaId }: { ideaId: number }) {
  const [view, setView] = useState<ExtensionView | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError(null);
    fetch(`/api/local-tools?ideaId=${ideaId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error || "Could not load local tools");
        if (!data.enabled) return;
        const next = data.view as ExtensionView;
        setView(next);
        setValues(Object.fromEntries(next.panels.map((panel) => [panel.id, valuesFor(panel)])));
      })
      .catch((cause) => !cancelled && setError(String(cause)));
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  if (!view && !error) return null;

  const run = async (panel: ExtensionPanel, actionId: string) => {
    const key = `${panel.id}:${actionId}`;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/local-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaId,
          panelId: panel.id,
          actionId,
          values: values[panel.id] ?? {},
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Action failed");
      const result = data.result;
      await applyEffect(result.effect);
      setView(result.view);
      setValues(
        Object.fromEntries(
          result.view.panels.map((nextPanel: ExtensionPanel) => [
            nextPanel.id,
            valuesFor(nextPanel),
          ])
        )
      );
      setMessage(result.message ?? result.effect?.message ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const panelBody = (panel: ExtensionPanel) => (
    <>
      {panel.fields.map((field) =>
        field.type === "select" ? (
          <label className="local-tools-field" key={field.id}>
            <span>{field.label}</span>
            <select
              value={values[panel.id]?.[field.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [panel.id]: {
                    ...current[panel.id],
                    [field.id]: event.target.value,
                  },
                }))
              }
            >
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="local-tools-field" key={field.id}>
            <span>{field.label}</span>
            <textarea
              rows={field.rows ?? 8}
              placeholder={field.placeholder}
              value={values[panel.id]?.[field.id] ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [panel.id]: {
                    ...current[panel.id],
                    [field.id]: event.target.value,
                  },
                }))
              }
            />
          </label>
        )
      )}
      <div className="row">
        {panel.actions.map((action) => {
          const key = `${panel.id}:${action.id}`;
          return (
            <button
              key={action.id}
              className={action.variant === "primary" ? "primary" : ""}
              disabled={busy !== null}
              onClick={() => run(panel, action.id)}
            >
              {busy === key ? "Working…" : action.label}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="local-tools section">
      <div className="label">{view?.displayName ?? "Local tools"}</div>
      {view?.panels.map((panel) =>
        panel.presentation === "dropdown" ? (
          <details className="local-tools-dropdown" key={panel.id}>
            <summary>{panel.title}</summary>
            <div className="local-tools-dropdown-body">{panelBody(panel)}</div>
          </details>
        ) : (
          <div className="local-tools-panel" key={panel.id}>
            <div className="local-tools-title">{panel.title}</div>
            {panelBody(panel)}
          </div>
        )
      )}
      {message && <div className="muted local-tools-message">{message}</div>}
      {error && <div className="local-tools-error">{error}</div>}
    </div>
  );
}
