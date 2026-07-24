import fs from "node:fs/promises";
import {
  type EchoesReportConfigV1,
  type EchoesReportSecretsV1,
} from "@/lib/config/schema";
import {
  loadConfig,
  loadSecrets,
} from "../config-store";
import {
  type AppPaths,
  verifyBrowserSource,
  verifyClaudeDirectory,
  verifyCodexDirectory,
} from "../paths";

export interface ConfigurationReadiness {
  configReady: boolean;
  secretsReady: boolean;
  hasActivitySource: boolean;
}

export function validateConfiguration({
  config,
  secrets,
}: {
  config: EchoesReportConfigV1;
  secrets: EchoesReportSecretsV1;
}): ConfigurationReadiness {
  const hasActivitySource = Boolean(
    config.sessions.claudeProjectsDir ||
    config.sessions.codexHome ||
    config.browsers.some((source) => source.enabled),
  );
  return {
    configReady: hasActivitySource,
    secretsReady: Boolean(
      process.env.DEEPSEEK_API_KEY?.trim() ||
      secrets.providers.deepseek.apiKey.trim(),
    ),
    hasActivitySource,
  };
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}

export async function collectDoctorChecks(
  paths: AppPaths,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const configResult = await loadConfig(paths, { silent: true });
  const secretsResult = await loadSecrets(paths, { silent: true });

  if (!configResult.exists || !configResult.value) {
    return [{
      name: "Configuration",
      ok: false,
      message: `Missing ${paths.config}. Run \`echoes-report setup\`.`,
    }];
  }
  if (!secretsResult.exists || !secretsResult.value) {
    return [{
      name: "Secrets",
      ok: false,
      message: `Missing ${paths.secrets}. Run \`echoes-report setup\`.`,
    }];
  }

  const config = configResult.value;
  const secrets = secretsResult.value;
  const readiness = validateConfiguration({ config, secrets });
  checks.push({
    name: "DeepSeek API key",
    ok: readiness.secretsReady,
    message: readiness.secretsReady
      ? "Configured (value redacted)."
      : "Missing. Run `echoes-report setup` or set DEEPSEEK_API_KEY.",
  });

  try {
    await fs.access(paths.home, fs.constants.R_OK | fs.constants.W_OK);
    checks.push({
      name: "Application data",
      ok: true,
      message: `Readable and writable at ${paths.home}.`,
    });
  } catch (error) {
    checks.push({
      name: "Application data",
      ok: false,
      message: `Cannot read and write ${paths.home}: ${String(error)}`,
    });
  }

  let readableSources = 0;
  if (config.sessions.claudeProjectsDir) {
    const result = await verifyClaudeDirectory(
      config.sessions.claudeProjectsDir,
    );
    if (result.success) readableSources++;
    checks.push({
      name: "Claude sessions",
      ok: result.success,
      message: result.message,
    });
  }
  if (config.sessions.codexHome) {
    const result = await verifyCodexDirectory(config.sessions.codexHome);
    if (result.success) readableSources++;
    checks.push({
      name: "Codex sessions",
      ok: result.success,
      message: result.message,
    });
  }
  for (const source of config.browsers.filter((candidate) => candidate.enabled)) {
    const result = await verifyBrowserSource(source);
    if (result.success) readableSources++;
    checks.push({
      name: `Browser: ${source.name}`,
      ok: result.success,
      message: result.message,
    });
  }

  checks.push({
    name: "Activity sources",
    ok: readableSources > 0,
    message: readableSources > 0
      ? `${readableSources} readable source${readableSources === 1 ? "" : "s"} configured.`
      : "No configured activity source is currently readable.",
  });

  return checks;
}

export async function runDoctor(
  paths: AppPaths,
  options: { json?: boolean } = {},
): Promise<boolean> {
  const checks = await collectDoctorChecks(paths);
  const healthy = checks.every((check) => check.ok);

  if (options.json) {
    console.log(JSON.stringify({ healthy, checks }, null, 2));
  } else {
    console.log("Echoes Report doctor\n");
    for (const check of checks) {
      console.log(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`);
    }
    console.log(
      healthy
        ? "\nEverything required to run Echoes Report is ready."
        : "\nFix the failed checks or rerun `echoes-report setup`.",
    );
  }

  if (!healthy) process.exitCode = 1;
  return healthy;
}
