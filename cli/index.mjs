#!/usr/bin/env node

import { getAppPaths } from "./paths.mjs";
import {
  ensureAppDirectories,
  loadConfig,
  loadSecrets,
} from "./config-store.mjs";

const command = process.argv[2] ?? "start";
const paths = getAppPaths();

switch (command) {
  case "setup": {
    const { runSetup } =
      await import("./commands/setup.mjs");

    await runSetup(paths);
    break;
  }

  case "doctor": {
    const { runDoctor } =
      await import("./commands/doctor.mjs");

    await runDoctor(paths);
    break;
  }

  case "start": {
    await ensureAppDirectories();

    const configResult = await loadConfig();

    if (!configResult.exists) {
      const { runSetup } =
        await import("./commands/setup.mjs");

      await runSetup(paths);
    }

    const config = (await loadConfig()).value;
    const secrets = (await loadSecrets()).value;

    const { runStart } =
      await import("./commands/start.mjs");

    await runStart({ paths, config, secrets });
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
}
