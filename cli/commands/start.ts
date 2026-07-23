import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerEnvironment } from "../runtime-env";
import type { AppPaths } from "../paths";
import type {
  EchoesReportConfigV1,
  EchoesReportSecretsV1,
} from "@/lib/config/schema";
import { validateConfiguration } from "./doctor";

const APP_ID = "com.riptideiv.echoes-report";

interface ServerState {
  appId: typeof APP_ID;
  pid: number;
  port: number;
  url: string;
  version: string;
  startedAt: string;
}

function packagedServerPath(): string {
  return fileURLToPath(new URL("../app/server.js", import.meta.url));
}

async function portAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function choosePort(preferredPort: number, fixed: boolean): Promise<number> {
  if (fixed) {
    if (!(await portAvailable(preferredPort))) {
      throw new Error(`Port ${preferredPort} is already in use.`);
    }
    return preferredPort;
  }

  for (let port = preferredPort; port < preferredPort + 20; port++) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(
    `No available port was found between ${preferredPort} and ${preferredPort + 19}.`,
  );
}

async function healthyServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.json() as { appId?: string };
    return body.appId === APP_ID;
  } catch {
    return false;
  }
}

async function existingServer(paths: AppPaths): Promise<ServerState | null> {
  try {
    const state = JSON.parse(
      await fs.readFile(paths.serverState, "utf8"),
    ) as ServerState;
    if (
      state.appId === APP_ID &&
      Number.isInteger(state.pid) &&
      Number.isInteger(state.port) &&
      await healthyServer(state.url)
    ) {
      return state;
    }
  } catch {
    // Missing, stale, or malformed runtime state is replaced below.
  }
  await fs.rm(paths.serverState, { force: true });
  return null;
}

async function waitUntilReady(
  child: ChildProcess,
  url: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Echoes Report server exited before it became ready (code ${child.exitCode}).`,
      );
    }
    if (await healthyServer(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill("SIGTERM");
  throw new Error(`Echoes Report did not become ready within ${timeoutMs / 1000} seconds.`);
}

export async function runStart({
  paths,
  config,
  secrets,
  version,
}: {
  paths: AppPaths;
  config: EchoesReportConfigV1;
  secrets: EchoesReportSecretsV1;
  version: string;
}) {
  const readiness = validateConfiguration({ config, secrets });
  if (!(readiness.configReady && readiness.secretsReady)) {
    if (!readiness.configReady) {
      console.error("[error] No activity source is configured.");
    }
    if (!readiness.secretsReady) {
      console.error("[error] A DeepSeek API key is not configured.");
    }
    throw new Error(
      "Echoes Report is not configured. Run `echoes-report setup`.",
    );
  }

  const alreadyRunning = await existingServer(paths);
  if (alreadyRunning) {
    console.log(`Echoes Report is already running.\n\nLocal URL: ${alreadyRunning.url}`);
    return;
  }

  const requestedPort = process.env.PORT
    ? Number(process.env.PORT)
    : config.server.port;
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`Invalid port: ${String(process.env.PORT ?? config.server.port)}`);
  }
  const port = await choosePort(requestedPort, process.env.PORT !== undefined);
  const url = `http://localhost:${port}`;
  const environment = createServerEnvironment({
    config,
    secrets,
    paths,
    port,
  });
  environment.HOSTNAME = "127.0.0.1";
  environment.ECHOES_REPORT_VERSION = version;

  const serverPath = packagedServerPath();
  await fs.access(serverPath);
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: environment,
    stdio: "inherit",
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    if (child.exitCode === null) child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    await waitUntilReady(child, url);
    const state: ServerState = {
      appId: APP_ID,
      pid: child.pid!,
      port,
      url,
      version,
      startedAt: new Date().toISOString(),
    };
    await fs.writeFile(paths.serverState, JSON.stringify(state, null, 2), {
      mode: 0o600,
    });

    console.log(
      `\nEchoes Report is running.\n\nLocal URL: ${url}\nPress Ctrl+C to stop.\n`,
    );

    const { code, signal } = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (code !== null && code !== 0) process.exitCode = code;
    if (signal && signal !== "SIGINT" && signal !== "SIGTERM") {
      process.exitCode = 1;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await fs.rm(paths.serverState, { force: true });
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}
