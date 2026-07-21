import path from "node:path";
import os from "node:os";

export function getDefaultAppHome() {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "com.riptideiv.echoes-report"
      );

    case "win32":
      return path.join(
        process.env.APPDATA,
        "Echoes Report"
      );

    default: // Linux
      return path.join(
        process.env.XDG_CONFIG_HOME ??
          path.join(os.homedir(), ".config"),
        "echoes-report"
      );
  }
}

export function getAppHome() {
  return path.resolve(
      process.env.ECHOES_REPORT_HOME ?? getDefaultAppHome()
    );
}

export function getAppPaths() {
  const home = getAppHome();

  return {
    home,
    config: path.join(home, "config.json"),
    secrets: path.join(home, "secrets.json"),
    database: path.join(home, "data.db"),
    logs: path.join(home, "logs"),
    cache: path.join(home, "cache"),
    runtime: path.join(home, "runtime"),
  };
}

export async function verifyClaudeDirectory(directory) { // mirror claude section in extract.ts
  await fs.access(directory, fs.constants.R_OK);

  const projects = await fs.readdir(directory, {
    withFileTypes: true,
  });

  // Find a project directory and representative JSONL session.
  // Open it and verify that at least one line parses as JSON.
  const projectDir = projects.find((dir) => dir.isDirectory());
  if (!projectDir) {
    throw new Error("No project directory found");
  }

  const projectPath = path.join(directory, projectDir.name);
  const sessionFiles = await fs.readdir(projectPath, {
    withFileTypes: true,
  });

  const sessionFile = sessionFiles.find((file) => file.isFile() && file.name.endsWith(".jsonl"));
  if (!sessionFile) {
    throw new Error("No JSONL session file found");
  }

  const sessionPath = path.join(projectPath, sessionFile.name);
  const sessionContent = await fs.readFile(sessionPath, "utf8");
  const sessionLines = sessionContent.split("\n");
  const firstLine = sessionLines.find((line) => line.trim() !== "");
  if (!firstLine) {
    throw new Error("No data found in session file");
  }

  try {
    const parsedLine = JSON.parse(firstLine);
    return { success: true, parsedLine: parsedLine };
  } catch (e) {
    return { success: false, parsedLine: null };
  }
}

export async function verifyCodexDirectory(directory) { // mirror codex-extract.ts
  await fs.access(directory, fs.constants.R_OK);

  // not sure how to write this

  return { success: true }
}
