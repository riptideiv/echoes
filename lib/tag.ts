import { TAG_VOCAB, TAG_TEMPERATURE, type Tag } from "./config";
import { chatJSON } from "./deepseek";
import { getCachedTags, saveSourceTags } from "./db";
import type { Source, TaggedSource } from "./types";

const VALID = new Set<string>(TAG_VOCAB);

const SYSTEM = `You label a developer's activity with topic tags for a content-idea tool.
You MUST choose 1 to 3 tags per item, ONLY from this fixed vocabulary:
${TAG_VOCAB.join(", ")}
Pick the tags that best capture what the activity is really about. If nothing
fits well, use "misc". Return strict JSON.`;

interface TagResponse {
  tags: Record<string, string[]>; // sourceId -> tags
}

function sanitize(tags: unknown): Tag[] {
  if (!Array.isArray(tags)) return ["misc"];
  const clean = tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => VALID.has(t)) as Tag[];
  const uniq = [...new Set(clean)].slice(0, 3);
  return uniq.length ? uniq : ["misc"];
}

/**
 * Tag sources, using the per-source cache. Only un-tagged sources hit the LLM;
 * results are persisted so future runs skip them. Batched in one call.
 */
export async function tagSources(sources: Source[]): Promise<TaggedSource[]> {
  const result: TaggedSource[] = [];
  const todo: Source[] = [];

  for (const s of sources) {
    const cached = getCachedTags(s.id);
    if (cached) result.push({ ...s, tags: cached });
    else todo.push(s);
  }

  if (todo.length > 0) {
    const items = todo
      .map(
        (s, i) =>
          `### item_${i} (id=${s.id})\n${s.summary}`
      )
      .join("\n\n");

    const user = `Tag each item below. Return JSON:
{ "tags": { "item_0": ["tag", ...], "item_1": [...], ... } }
Use the item_N keys exactly.

${items}`;

    let parsed: TagResponse | null = null;
    try {
      parsed = await chatJSON<TagResponse>({
        system: SYSTEM,
        user,
        temperature: TAG_TEMPERATURE,
        maxTokens: 1200,
      });
    } catch (err) {
      console.warn("[tag] LLM tagging failed, falling back to 'misc':", err);
    }

    todo.forEach((s, i) => {
      const raw = parsed?.tags?.[`item_${i}`];
      const tags = sanitize(raw);
      const tagged: TaggedSource = { ...s, tags };
      saveSourceTags(tagged);
      result.push(tagged);
    });
  }

  return result;
}
