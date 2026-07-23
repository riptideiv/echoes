import fs from "node:fs/promises";
import type { AppPaths } from "./paths";
import {
  ConfigV1Schema,
  SecretsV1Schema,
  type EchoesReportConfigV1,
  type EchoesReportSecretsV1,
} from "@/lib/config/schema";

export const CONFIG_DEFAULTS = {
  schemaVersion: 1,
  sessions: {
    claudeProjectsDir: "~/.claude/projects",
    codexHome: "~/.codex",
  },
  browsers: [
    /*
    {
      "id": "chrome-example",
      "name": "Chrome — Example",
      "engine": "chromium",
      "path": "example/path/to/Google/Chrome/Default/History",
      "enabled": false
    },
  */
  ],
  generation: {
    windowDays: 7,
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    generationTemperature: 0.8,
    tagTemperature: 0.2,
  },
  server: {
    port: 3000,
    openBrowser: false,
  },
} satisfies EchoesReportConfigV1;

export const SECRETS_DEFAULTS = {
  schemaVersion: 1,
  providers: {
    deepseek: {
      apiKey: "",
    },
  },
} satisfies EchoesReportSecretsV1;

export async function ensureAppDirectories(paths: AppPaths) {
  await Promise.all([
    fs.mkdir(paths.logs, { recursive: true, mode: 0o700 }),
    fs.mkdir(paths.cache, { recursive: true, mode: 0o700 }),
    fs.mkdir(paths.runtime, { recursive: true, mode: 0o700 }),
  ]);
}

export async function loadConfig(
  paths: AppPaths,
  options: { silent?: boolean } = {},
) {
  let config;
  try {
    const rawConfig = JSON.parse(await fs.readFile(paths.config, "utf-8"));
    config = ConfigV1Schema.parse(rawConfig);
    if (!options.silent) console.log("Successfully loaded config.");
    return {
      exists: true,
      value: config,
    };
  } catch (error) {
    let nodeError;
    if (error instanceof Error) {
      nodeError = error as NodeJS.ErrnoException;
    }
    if (nodeError?.code === "ENOENT") {
      if (!options.silent) console.log("config.json not found.");
      return {
        exists: false,
        value: null,
      };
    } else {
      console.error("An error occured while loading config:", error);
      throw error;
    }
  }
}

export async function loadSecrets(
  paths: AppPaths,
  options: { silent?: boolean } = {},
) {
  let secrets;
  try {
    const rawSecrets = JSON.parse(await fs.readFile(paths.secrets, "utf-8"));
    secrets = SecretsV1Schema.parse(rawSecrets);
    if (!options.silent) console.log("Successfully loaded secrets.");
    return {
      exists: true,
      value: secrets,
    };
  } catch (error) {
    let nodeError;
    if (error instanceof Error) {
      nodeError = error as NodeJS.ErrnoException;
    }
    if (nodeError?.code === "ENOENT") {
      if (!options.silent) console.log("secrets.json not found.");
      return {
        exists: false,
        value: null,
      };
    } else {
      console.error("An error occured while loading secrets:", error);
      throw error;
    }
  }
}

async function writeJsonAtomically(destination: string, value: any) {
  const temporary = destination + `.tmp`;

  await fs.writeFile(temporary, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });

  await fs.rename(temporary, destination);
}

export async function saveConfig(
  config: EchoesReportConfigV1,
  paths: AppPaths,
) {
  await writeJsonAtomically(paths.config, config);
  console.log("Successfully saved config.");
}

export async function saveSecrets(
  secrets: EchoesReportSecretsV1,
  paths: AppPaths,
) {
  await writeJsonAtomically(paths.secrets, secrets);
  console.log("Successfully saved secrets.");
}
