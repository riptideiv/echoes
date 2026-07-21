export function createServerEnvironment({
  config,
  secrets,
  paths,
  port,
}) {
  const environment = {
    ...process.env,

    ECHOES_REPORT_HOME: paths.home,
    ECHOES_REPORT_CONFIG: paths.config,
    DB_PATH: paths.database,

    WINDOW_DAYS: String(config.generation.windowDays),
    DEEPSEEK_BASE_URL: config.generation.baseUrl,
    DEEPSEEK_MODEL: config.generation.model,

    GEN_TEMPERATURE: String(
      config.generation.generationTemperature
    ),

    TAG_TEMPERATURE: String(
      config.generation.tagTemperature
    ),

    PORT: String(port),
  };

  const apiKey =
    process.env.DEEPSEEK_API_KEY ??
    secrets?.providers?.deepseek?.apiKey;

  if (apiKey) {
    environment.DEEPSEEK_API_KEY = apiKey;
  }

  const claude =
    process.env.CLAUDE_PROJECTS_DIR ??
    config.sessions.claudeProjectsDir;

  if (claude) {
    environment.CLAUDE_PROJECTS_DIR = claude;
  }

  const codex =
    process.env.CODEX_HOME ??
    config.sessions.codexHome;

  if (codex) {
    environment.CODEX_HOME = codex;
  }

  return environment;
}
