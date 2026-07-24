#!/usr/bin/env node

import {
  ensureAppDirectories,
  loadConfig,
  loadSecrets,
} from "./config-store";
import { getAppPaths } from "./paths";

declare const __ECHOES_REPORT_VERSION__: string;

const VERSION = typeof __ECHOES_REPORT_VERSION__ === "string"
  ? __ECHOES_REPORT_VERSION__
  : "0.0.0-dev";

function printHelp(): void {
  console.log(`Echoes Report ${VERSION}

Usage:
  echoes-report [start] [--port <number>]
  echoes-report setup
  echoes-report doctor [--json]
  echoes-report --help
  echoes-report --version

Commands:
  start    Start the local web app (default)
  setup    Configure the API key, sessions, and browser history
  doctor   Verify configuration and file access
`);
}

function startPort(args: string[]): number | null {
  const index = args.indexOf("--port");
  if (index === -1) return null;
  const raw = args[index + 1];
  const port = Number(raw);
  if (!raw || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port requires an integer between 1 and 65535.");
  }
  return port;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }

  const command = args[0]?.startsWith("-") ? "start" : (args[0] ?? "start");
  const commandArgs = args[0] === command ? args.slice(1) : args;
  const paths = getAppPaths();

  switch (command) {
    case "setup": {
      const { runSetup } = await import("./commands/setup");
      await runSetup(paths);
      return;
    }
    case "doctor": {
      const unknown = commandArgs.filter((arg) => arg !== "--json");
      if (unknown.length > 0) {
        throw new Error(`Unknown doctor option: ${unknown[0]}`);
      }
      const { runDoctor } = await import("./commands/doctor");
      await runDoctor(paths, { json: commandArgs.includes("--json") });
      return;
    }
    case "start": {
      const port = startPort(commandArgs);
      const unknown = commandArgs.filter((arg, index) =>
        arg !== "--port" && commandArgs[index - 1] !== "--port"
      );
      if (unknown.length > 0) {
        throw new Error(`Unknown start option: ${unknown[0]}`);
      }
      if (port !== null) process.env.PORT = String(port);

      await ensureAppDirectories(paths);
      let configResult = await loadConfig(paths);
      let secretsResult = await loadSecrets(paths);
      const { validateConfiguration } = await import("./commands/doctor");
      const readiness = configResult.value && secretsResult.value
        ? validateConfiguration({
          config: configResult.value,
          secrets: secretsResult.value,
        })
        : null;
      const structurallyReady = Boolean(
        readiness?.configReady && readiness.secretsReady,
      );
      if (!configResult.exists || !secretsResult.exists || !structurallyReady) {
        const { runSetup } = await import("./commands/setup");
        await runSetup(paths);
        configResult = await loadConfig(paths);
        secretsResult = await loadSecrets(paths);
      }

      const { runStart } = await import("./commands/start");
      await runStart({
        paths,
        config: configResult.value!,
        secrets: secretsResult.value!,
        version: VERSION,
      });
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}. Run \`echoes-report --help\`.`);
  }
}

try {
  await main();
} catch (error) {
  if ((error as { name?: string }).name === "ExitPromptError") {
    console.error("\nSetup cancelled.");
  } else {
    console.error(
      `\n[error] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  process.exitCode = 1;
}
