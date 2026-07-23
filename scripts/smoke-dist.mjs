import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(projectRoot, "dist", "cli", "echoes-report.mjs");
const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "echoes-report-dist-smoke-"),
);
const historyPath = path.join(temporaryRoot, "history.json");
const configPath = path.join(temporaryRoot, "config.json");
const secretsPath = path.join(temporaryRoot, "secrets.json");

await fs.writeFile(
  historyPath,
  JSON.stringify([{
    url: "https://example.com",
    title: "Echoes Report smoke test",
    visitTime: Date.now(),
  }]),
);
await fs.writeFile(
  configPath,
  JSON.stringify({
    schemaVersion: 1,
    sessions: {
      claudeProjectsDir: null,
      codexHome: null,
    },
    browsers: [{
      id: "smoke-json",
      name: "Smoke-test JSON history",
      engine: "json",
      path: historyPath,
      enabled: true,
    }],
    generation: {
      windowDays: 7,
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      generationTemperature: 0.8,
      tagTemperature: 0.2,
    },
    server: {
      port: 39000,
      openBrowser: false,
    },
  }),
  { mode: 0o600 },
);
await fs.writeFile(
  secretsPath,
  JSON.stringify({
    schemaVersion: 1,
    providers: {
      deepseek: {
        apiKey: "smoke-test-key-not-sent",
      },
    },
  }),
  { mode: 0o600 },
);

const child = spawn(process.execPath, [cliPath], {
  cwd: os.tmpdir(),
  env: {
    ...process.env,
    ECHOES_REPORT_HOME: temporaryRoot,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  const deadline = Date.now() + 30_000;
  let match;
  while (Date.now() < deadline) {
    match = output.match(/Local URL:\s+(http:\/\/localhost:\d+)/);
    if (match) break;
    if (child.exitCode !== null) {
      throw new Error(`CLI exited early with ${child.exitCode}:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!match) throw new Error(`CLI did not print a URL:\n${output}`);

  const url = match[1];
  const health = await fetch(`${url}/api/health`);
  const healthBody = await health.json();
  if (
    !health.ok ||
    healthBody.appId !== "com.riptideiv.echoes-report" ||
    healthBody.version !== "0.1.0"
  ) {
    throw new Error(`Unexpected health response: ${JSON.stringify(healthBody)}`);
  }

  const dashboard = await fetch(url);
  if (!dashboard.ok || !(await dashboard.text()).includes("Echoes")) {
    throw new Error("Dashboard did not return the Echoes Report app.");
  }

  console.log(`Packaged CLI smoke test passed at ${url}.`);
} finally {
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
