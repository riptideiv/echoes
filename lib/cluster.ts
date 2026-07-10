import crypto from "crypto";
import type { Tag } from "./config";
import type { TaggedSource, Theme } from "./types";

function sourceKey(ids: string[]): string {
  const sorted = [...ids].sort();
  return crypto
    .createHash("sha256")
    .update(sorted.join("|"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Group tagged sources into themes by shared tag. A source with multiple tags
 * joins multiple themes. Grouping is pure code over the (cached, immutable)
 * tags, so a theme's `sourceKey` is stable unless its membership changes.
 *
 * Themes need at least one session source (a real "thing you did") and >= 2
 * members, so a lone browsing rollup doesn't become a card on its own.
 */
export function clusterByTag(sources: TaggedSource[]): Theme[] {
  const byTag = new Map<Tag, TaggedSource[]>();
  for (const s of sources) {
    for (const tag of s.tags) {
      const arr = byTag.get(tag) ?? [];
      arr.push(s);
      byTag.set(tag, arr);
    }
  }

  const themes: Theme[] = [];
  for (const [tag, members] of byTag) {
    const hasSession = members.some((m) => m.kind === "session");
    if (!hasSession) continue;
    if (members.length < 2 && tag !== "misc") {
      // A single distinctive session may still stand alone as its own theme.
      if (members.length === 1 && members[0].kind === "session") {
        themes.push({
          sourceKey: sourceKey(members.map((m) => m.id)),
          tag,
          sources: members,
        });
      }
      continue;
    }
    if (tag === "misc") continue; // don't build a grab-bag theme

    // Sort members: sessions first, then by recency, for a stable digest.
    const ordered = [...members].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "session" ? -1 : 1;
      return b.endTs - a.endTs;
    });
    themes.push({
      sourceKey: sourceKey(ordered.map((m) => m.id)),
      tag,
      sources: ordered,
    });
  }

  // Largest / most-supported themes first (helps when capping generation).
  themes.sort((a, b) => b.sources.length - a.sources.length);
  return themes;
}
