import fs from "node:fs/promises";
import path from "node:path";
import { getAppHome } from "./paths.mjs";

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
    model: "deepseek-v4-pro",
    generationTemperature: 0.8,
    tagTemperature: 0.2
  },
  server: {
    port: 3000,
    openBrowser: false,
  },
};

export const SECRETS_DEFAULTS = {
  schemaVersion: 1,
  providers: {
    deepseek: {
      apiKey: "",
    },
  },
};

export async function ensureAppDirectories(paths) {
  await Promise.all([
    fs.mkdir(paths.logs, { recursive: true, mode: 0o700 }),
    fs.mkdir(paths.cache, { recursive: true, mode: 0o700 }),
    fs.mkdir(paths.runtime, { recursive: true, mode: 0o700 }),
  ]);
}

export async function loadConfig(paths) {
  let config;
  try {
    config = JSON.parse(await fs.readFile(paths.config, "utf-8"));
    console.log('Successfully loaded config.');
    return {
      exists: true,
      value: config
    }
  } catch(error) {
    if (error.code === 'ENOENT') {
      console.log('config.json not found.');
      return {
        exists: false,
        value: null
      };
    } else {
      console.error('An error occured while loading config:', error);
      throw error;
    }
  }
}

export async function loadSecrets(paths) {
  let secrets;
  try {
    secrets = JSON.parse(await fs.readFile(paths.secrets, "utf-8"));
    console.log('Successfully loaded secrets.');
    return {
      exists: true,
      value: secrets
    }
  } catch(error) {
    if (error.code === 'ENOENT') {
      console.log('secrets.json not found.');
      return {
        exists: false,
        value: null
      };
    } else {
      console.error('An error occured while loading secrets:', error);
      throw error;
    }
  }
}

async function writeJsonAtomically(destination, value) {
  const temporary = destination + `.tmp`;

  await fs.writeFile(
    temporary,
    JSON.stringify(value, null, 2),
    { mode: 0o600 }
  );

  await fs.rename(temporary, destination);
}

export async function saveConfig(config, paths) {
  await writeJsonAtomically(paths.config, config);
  console.log('Successfully saved config.');
}

export async function saveSecrets(secrets, paths) {
  await writeJsonAtomically(paths.secrets, secrets);
  console.log('Successfully saved secrets.');
}
