import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BROWSER_CATALOG,
  discoverBrowserSources,
} from "../lib/browser-catalog";
import { mergeBrowserSources } from "../cli/commands/setup";

const UPSTREAM_BROWSER_NAMES = [
  "Chromium",
  "Google Chrome",
  "Firefox",
  "LibreWolf",
  "Zen",
  "Safari",
  "Microsoft Edge",
  "Opera",
  "Opera GX",
  "Brave",
  "Vivaldi",
  "Epic Privacy Browser",
  "Arc",
];

test("ports every browser represented by upstream browsers.py", () => {
  const names = new Set(
    BROWSER_CATALOG
      .filter((browser) => browser.origin === "browser-history")
      .map((browser) => browser.name),
  );
  assert.deepEqual([...names], UPSTREAM_BROWSER_NAMES);
});

test("discovers profile and single-file browser histories at standard locations", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "echoes-catalog-"));
  try {
    const expectedFiles = [
      "Library/Application Support/Google/Chrome/Default/History",
      "Library/Application Support/Firefox/Profiles/test.default/places.sqlite",
      "Library/Application Support/Dia/User Data/Profile 1/History",
      "Library/Application Support/com.operasoftware.Opera/History",
      "Library/Safari/History.db",
    ];
    for (const relativePath of expectedFiles) {
      const filePath = path.join(home, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "");
    }

    const sources = await discoverBrowserSources({
      platform: "darwin",
      homeDirectory: home,
    });

    assert.deepEqual(
      sources.map((source) => source.name),
      [
        "Dia — Profile 1",
        "Firefox — test.default",
        "Google Chrome — Default",
        "Opera",
        "Safari",
      ],
    );
    assert.ok(sources.every((source) => source.enabled === false));
    assert.equal(new Set(sources.map((source) => source.id)).size, 5);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test("configured sources override discovered defaults for the same path", () => {
  const pathToHistory = "/tmp/browser/Default/History";
  const discovered = [{
    id: "chrome-discovered",
    name: "Google Chrome — Default",
    engine: "chromium" as const,
    path: pathToHistory,
    enabled: false,
  }];
  const configured = [{
    ...discovered[0],
    id: "saved-source",
    name: "My Chrome",
    enabled: true,
  }];

  assert.deepEqual(
    mergeBrowserSources(configured, discovered),
    configured,
  );
});
