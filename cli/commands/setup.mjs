import { ensureAppDirectories, loadConfig, loadSecrets, saveConfig, saveSecrets } from "../config-store.mjs";
import { verifyClaudeDirectory, verifyCodexDirectory } from "../paths.mjs";
import { CONFIG_DEFAULTS, SECRETS_DEFAULTS } from "../config-store.mjs";

// deepseek api key

async function setupDeepseekApiKey(secrets) {
  if(secrets.deepseekApiKey) {
    const useKey = prompt('DeepSeek API key already set. Update it? (y/N) ');
    if (useKey.toLowerCase() === 'y') {
      const newKey = prompt('Enter your new DeepSeek API key: ');
      secrets.deepseekApiKey = newKey;
    }
  }
}

// claude sessions directory

async function promptForClaudeDir() {
  for (let i = 0;; i++) {
    const newDir = prompt(`Enter your new Claude projects directory (default: ${CONFIG_DEFAULTS.sessions.claudeProjectsDir}): `);
    if (newDir === '') {
      newDir = CONFIG_DEFAULTS.sessions.claudeProjectsDir;
    }
    const verifiedDir = await verifyClaudeDirectory(newDir);
    if (verifiedDir.success) {
      return newDir;
    } else {
      if (i>=3) {
        console.log(`Invalid directory '${newDir}' (3/3). Skipping Claude projects directory...`);
        return null;
      }
      console.log(`Invalid directory '${newDir}' (${i + 1}/3). Please try again.`);
    }
  }
}

async function setupClaudeDir(config) {
  if (config.sessions.claudeProjectsDir) {
    console.log(`Claude projects directory already set to: ${config.sessions.claudeProjectsDir}`);
    const useDir = prompt(`Update to a new directory? (y/N): `)
    if (useDir.toLowerCase() === 'y') {
      const newDir = await promptForClaudeDir();
      if (newDir) {
        config.sessions.claudeProjectsDir = newDir;
      }
    }
  }
}

// codex sessions directory

async function promptForCodexDir() {
  for (let i = 0;; i++) {
    const newDir = prompt(`Enter your new Codex directory (default: ${CONFIG_DEFAULTS.sessions.codexHome}): `);
    if (newDir === '') {
      newDir = CONFIG_DEFAULTS.sessions.codexHome;
    }
    const verifiedDir = await verifyCodexDirectory(newDir);
    if (verifiedDir.success) {
      return newDir;
    } else {
      if (i>=3) {
        console.log(`Invalid directory '${newDir}' (3/3). Skipping Codex directory...`);
        return null;
      }
      console.log(`Invalid directory '${newDir}' (${i + 1}/3). Please try again.`);
    }
  }
}

async function setupCodexDir(config) {
  if (config.sessions.codexProjectsDir) {
    console.log(`Codex projects directory already set to: ${config.sessions.codexProjectsDir}`);
    const useDir = prompt(`Update to a new directory? (y/N): `)
    if (useDir.toLowerCase() === 'y') {
      const newDir = await promptForCodexDir();
      if (newDir) {
        config.sessions.codexProjectsDir = newDir;
      }
    }
  }
}

// deepseek generation settings

async function setupDeepseekGeneration(config) {
  // todo: add full wizard for this
  // if (config.generation exists and matches the zod schema ? idk how to write this tbh) {
    const useOld = prompt("Deepseek generation settings are already configured. Reset to default? (y/N) ");
    if (useOld.toLowerCase() === 'y') {
      console.log(`Using default DeepSeek settings...`);
      config.generation = CONFIG_DEFAULTS.generation;
    }
  // }
}

// server startup settings

async function setupServerStartup(config) {
  // todo: add full wizard for this
  // same problem as function above, don't know how to use zod
  console.log(`Using default server startup settings...`);
  config.server = CONFIG_DEFAULTS.server;
}

export async function runSetup(paths) {
  console.log(`Running echoes-report setup...`);

  await ensureAppDirectories(paths);
  const { exists: configExists, value: config } = await loadConfig(paths);
  const { exists: secretsExists, value: secrets } = await loadSecrets(paths);

  if (!configExists) {
    console.log(`No config found. Creating config.json...`);
    await saveConfig(paths, {});
    config = {};
  }
  if (!secretsExists) {
    console.log(`No secrets found. Creating secrets.json...`);
    await saveSecrets(paths, {});
    secrets = {};
  }

  await setupDeepseekApiKey(secrets);
  await setupClaudeDir(config);
  await setupCodexDir(config);
  // not sure how to write the browsers discovery
  await setupDeepseekGeneration(config);
  await setupServerSettings(config);

  // save settings
  saveConfig(config);
  saveSecrets(secrets);
}
