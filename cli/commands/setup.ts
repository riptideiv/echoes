import {
  ensureAppDirectories,
  loadConfig,
  loadSecrets,
  saveConfig,
  saveSecrets,
} from "../config-store";

import {
  type AppPaths,
  expandHome,
  verifyBrowserSource,
  verifyClaudeDirectory,
  verifyCodexDirectory,
} from "../paths";

import { CONFIG_DEFAULTS, SECRETS_DEFAULTS } from "../config-store";
import {
  ConfigV1Schema,
  SecretsV1Schema,
  type EchoesReportConfigV1,
  type EchoesReportSecretsV1,
  type BrowserSource,
} from "@/lib/config/schema";
import {
  createCustomBrowserSource,
  discoverBrowserSources,
} from "@/lib/browser-catalog";

import {
  input,
  password,
  confirm,
  checkbox,
  select,
} from "@inquirer/prompts";

// deepseek api key

async function setupDeepseekApiKey(secrets: EchoesReportSecretsV1) {
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    console.log("Using DEEPSEEK_API_KEY from the environment.");
    return;
  }
  if (secrets?.providers?.deepseek?.apiKey) {
    const updateNew = await confirm({
      message: "DeepSeek API key already set. Update it?",
      default: false,
    });
    if (!updateNew) return;
  }
  for (;;) {
    const newKey = await password({
      message: "Enter your DeepSeek API key:",
      mask: "*",
    });
    if (newKey.trim()) {
      secrets.providers.deepseek.apiKey = newKey.trim();
      return;
    }
    console.log("A DeepSeek API key is required to generate reports.");
  }
}

// claude sessions directory

async function promptForClaudeDir(current: string | null) {
  for (let i = 1; ; i++) {
    let claudeDir = await input({
      message: "Claude projects directory:",
      default: current ?? CONFIG_DEFAULTS.sessions.claudeProjectsDir,
    });
    const verifiedDir = await verifyClaudeDirectory(claudeDir);
    if (verifiedDir.success) {
      console.log(verifiedDir.message);
      return claudeDir;
    } else {
      console.log(verifiedDir.message);
      if (i >= 3) {
        console.log(
          `Invalid directory '${claudeDir}' (3/3). Skipping Claude projects directory...`,
        );
        return null;
      }
      console.log(
        `Invalid directory '${claudeDir}' (${i + 1}/3). Please try again.`,
      );
    }
  }
}

async function setupClaudeDir(config: EchoesReportConfigV1) {
  config.sessions.claudeProjectsDir = await promptForClaudeDir(config.sessions.claudeProjectsDir);
}

// codex sessions directory

async function promptForCodexDir(current: string | null) {
  for (let i = 1; ; i++) {
    let codexDir = await input({
      message: "Codex projects directory:",
      default: current ?? CONFIG_DEFAULTS.sessions.codexHome,
    });
    const verifiedDir = await verifyCodexDirectory(codexDir);
    if (verifiedDir.success) {
      console.log(verifiedDir.message);
      return codexDir;
    } else {
      console.log(verifiedDir.message);
      if (i >= 3) {
        console.log(
          `Invalid directory '${codexDir}' (3/3). Skipping Codex directory...`,
        );
        return null;
      }
      console.log(
        `Invalid directory '${codexDir}' (${i + 1}/3). Please try again.`,
      );
    }
  }
}

async function setupCodexDir(config: EchoesReportConfigV1) {
  config.sessions.codexHome = await promptForCodexDir(config.sessions.codexHome);
}

// deepseek generation settings

async function setupDeepseekGeneration(config: EchoesReportConfigV1) {
  // todo: add full wizard for this
  if (!(JSON.stringify(config.generation) === JSON.stringify(CONFIG_DEFAULTS.generation))) {
    const resetDefault = await confirm({
        message: `Reset to default DeepSeek settings?`,
        default: false,
    });
    if (!resetDefault) {
      return;
    }
  }
  console.log(`Using default DeepSeek settings...`);
  config.generation = CONFIG_DEFAULTS.generation;
}

// server startup settings

async function setupServerStartup(config: EchoesReportConfigV1) {
  // todo: add full wizard for this
  if (!(JSON.stringify(config.server) === JSON.stringify(CONFIG_DEFAULTS.server))) {
    const resetDefault = await confirm({
      message: `Reset to default server startup settings?`,
      default: false,
    });
    if (!resetDefault) {
      return;
    }
  }
  console.log(`Using default server startup settings...`);
  config.server = CONFIG_DEFAULTS.server;
}

// browser settings

function browserPathKey(sourcePath: string): string {
  const normalized = expandHome(sourcePath);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

export function mergeBrowserSources(
  configured: BrowserSource[],
  discovered: BrowserSource[],
): BrowserSource[] {
  const merged = new Map<string, BrowserSource>();
  for (const source of discovered) {
    merged.set(browserPathKey(source.path), source);
  }
  for (const source of configured) {
    merged.set(browserPathKey(source.path), source);
  }
  return [...merged.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function printBrowserPermissionHelp(source: BrowserSource): void {
  console.log(`\nCould not access ${source.name}: ${expandHome(source.path)}`);
  if (process.platform === "darwin") {
    console.log(
      [
        "macOS may require Full Disk Access for the application running this command.",
        "Open System Settings → Privacy & Security → Full Disk Access,",
        "enable Terminal, iTerm, Codex, or your IDE, restart it, and retry.",
      ].join("\n"),
    );
  }
}

async function verifySelectedBrowser(
  initialSource: BrowserSource,
): Promise<BrowserSource | null> {
  let source = { ...initialSource, enabled: true };

  for (;;) {
    const result = await verifyBrowserSource(source);
    console.log(result.message);
    if (result.success) return source;
    if (result.code === "permission_denied") {
      printBrowserPermissionHelp(source);
    }

    const action = await select({
      message: `What should Echoes Report do with ${source.name}?`,
      choices: [
        { name: "Retry verification", value: "retry" },
        { name: "Edit its history-file path", value: "edit" },
        { name: "Skip this source", value: "skip" },
      ],
    });

    if (action === "skip") return null;
    if (action === "edit") {
      const updatedPath = await input({
        message: `${source.name} history-file path:`,
        default: source.path,
        required: true,
      });
      source = { ...source, path: expandHome(updatedPath.trim()) };
    }
  }
}

async function promptForCustomBrowser(): Promise<BrowserSource | null> {
  const name = await input({
    message: "Browser or profile name:",
    required: true,
  });
  const engine = await select<BrowserSource["engine"]>({
    message: "Browser history format:",
    choices: [
      { name: "Chromium (History)", value: "chromium" },
      { name: "Firefox (places.sqlite)", value: "firefox" },
      { name: "Safari (History.db)", value: "safari" },
      { name: "JSON export", value: "json" },
    ],
  });
  const sourcePath = await input({
    message: "History-file path:",
    required: true,
  });

  return await verifySelectedBrowser(
    createCustomBrowserSource({
      name,
      engine,
      path: expandHome(sourcePath.trim()),
    }),
  );
}

export async function setupBrowsers(config: EchoesReportConfigV1) {
  console.log("\nSearching standard browser history locations...");
  const discovered = await discoverBrowserSources();
  let sources = mergeBrowserSources(config.browsers, discovered);

  if (sources.length > 0) {
    const discoveredCount = sources.filter((source) =>
      discovered.some(
        (candidate) =>
          browserPathKey(candidate.path) === browserPathKey(source.path),
      ),
    ).length;
    console.log(
      `Found ${discoveredCount} browser profile${discoveredCount === 1 ? "" : "s"} at standard locations.`,
    );

    const selectedIds = new Set(
      await checkbox({
        message: "Select the browser profiles Echoes Report may read:",
        choices: sources.map((source) => ({
          name: `${source.name} (${source.path})`,
          value: source.id,
          checked: source.enabled,
        })),
      }),
    );

    const verifiedByPath = new Map<string, BrowserSource>();
    for (const source of sources) {
      if (!selectedIds.has(source.id)) {
        verifiedByPath.set(browserPathKey(source.path), {
          ...source,
          enabled: false,
        });
        continue;
      }

      const verified = await verifySelectedBrowser(source);
      const key = browserPathKey(verified?.path ?? source.path);
      verifiedByPath.set(
        key,
        verified ?? { ...source, enabled: false },
      );
    }
    sources = [...verifiedByPath.values()];
  } else {
    console.log("No browser history files were found at standard locations.");
  }

  while (
    await confirm({
      message: "Add another browser history file manually?",
      default: false,
    })
  ) {
    const custom = await promptForCustomBrowser();
    if (custom) {
      const key = browserPathKey(custom.path);
      sources = [
        ...sources.filter((source) => browserPathKey(source.path) !== key),
        custom,
      ];
    }
  }

  config.browsers = sources.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const enabledCount = config.browsers.filter((source) => source.enabled).length;
  console.log(
    enabledCount === 0
      ? "Continuing without browser history."
      : `Configured ${enabledCount} readable browser source${enabledCount === 1 ? "" : "s"}.`,
  );
}

export async function runSetup(paths: AppPaths) {
  console.log(
    [
      ">> Running Echoes Report setup...",
      "Session and browser files remain on this computer.",
      "Selected activity summaries are sent to DeepSeek during generation.",
      "",
    ].join("\n"),
  );

  await ensureAppDirectories(paths);
  let { exists: configExists, value: config } = await loadConfig(paths);
  let { exists: secretsExists, value: secrets } = await loadSecrets(paths);

  if (!configExists) {
    config = ConfigV1Schema.parse(
      structuredClone(CONFIG_DEFAULTS),
    );
    await saveConfig(config, paths);
  }

  if (!secretsExists) {
    secrets = SecretsV1Schema.parse(
     structuredClone(SECRETS_DEFAULTS),
   );
    await saveSecrets(secrets, paths);
  }

  await setupDeepseekApiKey(secrets!);
  await setupClaudeDir(config!);
  await setupCodexDir(config!);
  await setupBrowsers(config!);
  await setupDeepseekGeneration(config!);
  await setupServerStartup(config!);

  // save settings
  await saveConfig(config!, paths);
  await saveSecrets(secrets!, paths);

  const hasActivitySource = Boolean(
    config!.sessions.claudeProjectsDir ||
    config!.sessions.codexHome ||
    config!.browsers.some((source) => source.enabled),
  );
  if (!hasActivitySource) {
    throw new Error(
      "Setup needs at least one readable Claude, Codex, or browser history source.",
    );
  }

  console.log("\nSetup complete. Run `echoes-report` to start the app.");
}
