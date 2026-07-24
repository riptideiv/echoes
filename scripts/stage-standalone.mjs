import { access, cp, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const nextDirectory = path.join(projectRoot, ".next");
const standaloneDirectory = path.join(nextDirectory, "standalone");
const destination = path.join(projectRoot, "dist", "app");

async function exists(candidate) {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standaloneDirectory))) {
  throw new Error(
    "Next.js standalone output is missing. Run `npm run build:web` first.",
  );
}

await rm(destination, { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(standaloneDirectory, destination, { recursive: true });

// Output tracing can copy files that happened to exist while Next.js built.
// Never ship local configuration, credentials, databases, or a native module
// compiled for the maintainer's CPU architecture.
const excludedReleasePaths = [
  ".env",
  ".env.local",
  ".env.production",
  "config/browsers.json",
  "data.db",
  "data.db-shm",
  "data.db-wal",
  "history.json",
  "node_modules/better-sqlite3",
  "node_modules/sharp",
  "node_modules/@img",
];

await Promise.all(
  excludedReleasePaths.map((relativePath) =>
    rm(path.join(destination, relativePath), { recursive: true, force: true }),
  ),
);

const staticSource = path.join(nextDirectory, "static");
if (await exists(staticSource)) {
  await mkdir(path.join(destination, ".next"), { recursive: true });
  await cp(staticSource, path.join(destination, ".next", "static"), {
    recursive: true,
  });
}

const publicSource = path.join(projectRoot, "public");
if (await exists(publicSource)) {
  await cp(publicSource, path.join(destination, "public"), { recursive: true });
}

console.log(`Next.js standalone app staged at ${path.relative(projectRoot, destination)}`);
