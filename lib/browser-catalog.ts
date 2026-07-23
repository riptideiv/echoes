/**
 * Browser locations in `UPSTREAM_BROWSER_CATALOG` are adapted from
 * browser-history's `browser_history/browsers.py` at commit
 * 63a614a9b1775a8d94e81d602a5b567de0a4403e:
 * https://github.com/browser-history/browser-history/blob/63a614a9b1775a8d94e81d602a5b567de0a4403e/browser_history/browsers.py
 *
 * Copyright 2020 Samyak Sarnayak
 * Licensed under the Apache License, Version 2.0.
 *
 * This file has been changed from the original: the Python browser classes
 * were ported to a TypeScript data catalog, paths are resolved without the
 * upstream parser classes, and profile history files are discovered directly.
 * See THIRD_PARTY_NOTICES.md and LICENSES/Apache-2.0.txt.
 */

import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserSource } from "./config/schema";

export type CatalogPlatform = "darwin" | "linux" | "win32";

export interface BrowserCatalogEntry {
  id: string;
  name: string;
  engine: BrowserSource["engine"];
  historyFile: string;
  profileSupport: boolean;
  paths: Partial<Record<CatalogPlatform, readonly string[]>>;
  origin: "browser-history" | "echoes-report";
}

const UPSTREAM_BROWSER_CATALOG: readonly BrowserCatalogEntry[] = [
  {
    id: "chromium",
    name: "Chromium",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      linux: [".config/chromium"],
      win32: ["AppData/Local/chromium/User Data"],
    },
    origin: "browser-history",
  },
  {
    id: "chrome",
    name: "Google Chrome",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      linux: [".config/google-chrome"],
      win32: ["AppData/Local/Google/Chrome/User Data"],
      darwin: ["Library/Application Support/Google/Chrome"],
    },
    origin: "browser-history",
  },
  {
    id: "firefox",
    name: "Firefox",
    engine: "firefox",
    historyFile: "places.sqlite",
    profileSupport: true,
    paths: {
      linux: [".mozilla/firefox"],
      win32: ["AppData/Roaming/Mozilla/Firefox/Profiles"],
      darwin: ["Library/Application Support/Firefox/Profiles"],
    },
    origin: "browser-history",
  },
  {
    id: "librewolf",
    name: "LibreWolf",
    engine: "firefox",
    historyFile: "places.sqlite",
    profileSupport: true,
    paths: {
      linux: [".librewolf"],
    },
    origin: "browser-history",
  },
  {
    id: "zen",
    name: "Zen",
    engine: "firefox",
    historyFile: "places.sqlite",
    profileSupport: true,
    paths: {
      win32: ["AppData/Roaming/zen/Profiles"],
      darwin: ["Library/Application Support/zen/Profiles"],
    },
    origin: "browser-history",
  },
  {
    id: "safari",
    name: "Safari",
    engine: "safari",
    historyFile: "History.db",
    profileSupport: false,
    paths: {
      darwin: ["Library/Safari"],
    },
    origin: "browser-history",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      linux: [".config/microsoft-edge-dev"],
      win32: ["AppData/Local/Microsoft/Edge/User Data"],
      darwin: ["Library/Application Support/Microsoft Edge"],
    },
    origin: "browser-history",
  },
  {
    id: "opera",
    name: "Opera",
    engine: "chromium",
    historyFile: "History",
    profileSupport: false,
    paths: {
      linux: [".config/opera"],
      win32: ["AppData/Roaming/Opera Software/Opera Stable"],
      darwin: ["Library/Application Support/com.operasoftware.Opera"],
    },
    origin: "browser-history",
  },
  {
    id: "opera-gx",
    name: "Opera GX",
    engine: "chromium",
    historyFile: "History",
    profileSupport: false,
    paths: {
      win32: ["AppData/Roaming/Opera Software/Opera GX Stable"],
    },
    origin: "browser-history",
  },
  {
    id: "brave",
    name: "Brave",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      linux: [".config/BraveSoftware/Brave-Browser"],
      win32: ["AppData/Local/BraveSoftware/Brave-Browser/User Data"],
      darwin: ["Library/Application Support/BraveSoftware/Brave-Browser"],
    },
    origin: "browser-history",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      linux: [".config/vivaldi"],
      win32: ["AppData/Local/Vivaldi/User Data"],
      darwin: ["Library/Application Support/Vivaldi"],
    },
    origin: "browser-history",
  },
  {
    id: "epic",
    name: "Epic Privacy Browser",
    engine: "chromium",
    historyFile: "History",
    profileSupport: false,
    paths: {
      win32: ["AppData/Local/Epic Privacy Browser/User Data/Default"],
      darwin: ["Library/Application Support/HiddenReflex/Epic/Default"],
    },
    origin: "browser-history",
  },
  {
    id: "arc",
    name: "Arc",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      win32: [
        "AppData/Local/Packages/TheBrowserCompany.Arc_ttt1ap7aakyb4/LocalCache/Local/Arc/User Data",
      ],
      darwin: ["Library/Application Support/Arc/User Data"],
    },
    origin: "browser-history",
  },
] as const;

const ECHOES_REPORT_BROWSER_CATALOG: readonly BrowserCatalogEntry[] = [
  {
    id: "chromium",
    name: "Chromium",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      darwin: ["Library/Application Support/Chromium"],
    },
    origin: "echoes-report",
  },
  {
    id: "dia",
    name: "Dia",
    engine: "chromium",
    historyFile: "History",
    profileSupport: true,
    paths: {
      darwin: ["Library/Application Support/Dia/User Data"],
    },
    origin: "echoes-report",
  },
] as const;

export const BROWSER_CATALOG: readonly BrowserCatalogEntry[] = [
  ...UPSTREAM_BROWSER_CATALOG,
  ...ECHOES_REPORT_BROWSER_CATALOG,
];

function sourceId(browserId: string, sourcePath: string): string {
  const digest = createHash("sha256")
    .update(path.normalize(sourcePath))
    .digest("hex")
    .slice(0, 10);
  return `${browserId}-${digest}`;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function profileDirectories(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) {
      directories.push(candidate);
      continue;
    }
    if (entry.isSymbolicLink()) {
      try {
        if ((await fs.stat(candidate)).isDirectory()) directories.push(candidate);
      } catch {
        // Broken or inaccessible profile links are not usable sources.
      }
    }
  }
  return directories;
}

function profileName(root: string, historyPath: string): string | null {
  const relative = path.relative(root, path.dirname(historyPath));
  if (!relative || relative === ".") return null;
  return relative;
}

/**
 * Discover concrete history files for the current platform. Profile-based
 * browsers are expanded to one source per profile; single-profile browsers
 * point directly at their standard history file.
 */
export async function discoverBrowserSources(options: {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
} = {}): Promise<BrowserSource[]> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32") {
    return [];
  }

  const homeDirectory = options.homeDirectory ?? os.homedir();
  const discovered = new Map<string, BrowserSource>();

  for (const browser of BROWSER_CATALOG) {
    const roots = browser.paths[platform] ?? [];
    for (const relativeRoot of roots) {
      const root = path.resolve(homeDirectory, relativeRoot);
      const candidates = browser.profileSupport
        ? [
            path.join(root, browser.historyFile),
            ...(await profileDirectories(root)).map((profile) =>
              path.join(profile, browser.historyFile),
            ),
          ]
        : [path.join(root, browser.historyFile)];

      for (const historyPath of candidates) {
        if (!(await isFile(historyPath))) continue;
        const normalizedPath = path.normalize(historyPath);
        if (discovered.has(normalizedPath)) continue;

        const profile = profileName(root, historyPath);
        discovered.set(normalizedPath, {
          id: sourceId(browser.id, normalizedPath),
          name: profile ? `${browser.name} — ${profile}` : browser.name,
          engine: browser.engine,
          path: normalizedPath,
          enabled: false,
        });
      }
    }
  }

  return [...discovered.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function createCustomBrowserSource(input: {
  name: string;
  engine: BrowserSource["engine"];
  path: string;
  enabled?: boolean;
}): BrowserSource {
  const normalizedPath = path.normalize(input.path);
  return {
    id: sourceId("custom", normalizedPath),
    name: input.name.trim(),
    engine: input.engine,
    path: normalizedPath,
    enabled: input.enabled ?? true,
  };
}
