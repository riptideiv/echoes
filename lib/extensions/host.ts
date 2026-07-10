import path from "node:path";
import { pathToFileURL } from "node:url";
import { getIdea } from "../db";
import {
  EXTENSION_API_VERSION,
  type IdeaSnapshot,
  type LocalExtension,
} from "./types";

let cachedPath: string | null = null;
let cachedExtension: LocalExtension | null = null;

export function extensionConfigured(): boolean {
  return Boolean(process.env.ECHOES_EXTENSION_PATH?.trim());
}

export async function loadLocalExtension(): Promise<LocalExtension | null> {
  const configuredPath = process.env.ECHOES_EXTENSION_PATH?.trim();
  if (!configuredPath) return null;
  if (cachedExtension && cachedPath === configuredPath) return cachedExtension;

  const entry = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
  const entryUrl = pathToFileURL(entry).href;
  // Keep the private module outside Next's bundle. It is trusted local code and
  // is loaded only when the user explicitly configures its absolute path.
  const runtimeImport = new Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<{ default?: unknown; extension?: unknown }>;
  const loaded = await runtimeImport(entryUrl);
  const candidate = (loaded.default ?? loaded.extension) as
    | LocalExtension
    | undefined;
  if (!candidate || candidate.apiVersion !== EXTENSION_API_VERSION) {
    throw new Error(
      `Local extension must implement Echoes extension API v${EXTENSION_API_VERSION}`
    );
  }
  if (typeof candidate.getView !== "function" || typeof candidate.execute !== "function") {
    throw new Error("Local extension is missing getView() or execute()");
  }
  cachedPath = configuredPath;
  cachedExtension = candidate;
  return candidate;
}

export function getIdeaSnapshot(id: number): IdeaSnapshot | null {
  const idea = getIdea(id);
  if (!idea) return null;
  return {
    id: idea.id,
    sourceKey: idea.source_key,
    generationDate: idea.generation_date,
    voice: idea.voice,
    format: idea.format,
    tag: idea.tag,
    source: JSON.parse(idea.source_json) as string[],
    direction: idea.direction,
    justificationSupport: idea.justification_support,
    justificationInterest: idea.justification_interest,
    status: idea.status,
    question: idea.question,
    userAnswer: idea.user_answer,
  };
}
