import { chmod, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = path.join(projectRoot, "dist", "cli");
const outputFile = path.join(outputDirectory, "echoes-report.mjs");
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

await mkdir(outputDirectory, { recursive: true });

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["cli/index.ts"],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  tsconfig: "tsconfig.json",
  sourcemap: true,
  treeShaking: true,
  define: {
    __ECHOES_REPORT_VERSION__: JSON.stringify(packageJson.version),
  },
  external: [
    "@inquirer/prompts",
    "better-sqlite3",
    "next",
    "next/*",
  ],
  logLevel: "info",
});

await chmod(outputFile, 0o755);

console.log(`CLI staged at ${path.relative(projectRoot, outputFile)}`);
