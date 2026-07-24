import type {
  EchoesReportConfigV1,
  EchoesReportSecretsV1,
} from "@/lib/config/schema";
import type { AppPaths } from "./paths";

export function createServerEnvironment({
  config,
  secrets,
  paths,
  port,
}: {
  config: EchoesReportConfigV1;
  secrets: EchoesReportSecretsV1;
  paths: AppPaths;
  port: number;
}) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,

    ECHOES_REPORT_HOME: process.env.ECHOES_REPORT_HOME ?? paths.home,
    ECHOES_REPORT_CONFIG: process.env.ECHOES_REPORT_CONFIG ?? paths.config,
    DB_PATH: process.env.DB_PATH ?? paths.database,

    WINDOW_DAYS: process.env.WINDOW_DAYS ?? String(config.generation.windowDays),
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL ?? config.generation.baseUrl,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL ?? config.generation.model,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? secrets?.providers?.deepseek?.apiKey ?? "",

    CLAUDE_PROJECTS_DIR:
      process.env.CLAUDE_PROJECTS_DIR ??
      config.sessions.claudeProjectsDir ??
      "",
    CODEX_HOME:
      process.env.CODEX_HOME ??
      config.sessions.codexHome ??
      "",

    GEN_TEMPERATURE: String(process.env.GEN_TEMPERATURE ?? config.generation.generationTemperature),

    TAG_TEMPERATURE: String(process.env.TAG_TEMPERATURE ?? config.generation.tagTemperature),

    PORT: String(process.env.PORT ?? port),
  };

  if (!process.env.BROWSERS_CONFIG) {
    environment.BROWSER_SOURCES_JSON =
      process.env.BROWSER_SOURCES_JSON ?? JSON.stringify(config.browsers);
  }

  return environment;
}
