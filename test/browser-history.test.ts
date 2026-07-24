import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { BrowserSource } from "../lib/config/schema";
import { verifyBrowserSource } from "../cli/paths";

const CHROMIUM_EPOCH_OFFSET_MS = 11644473600000;
const SAFARI_EPOCH_OFFSET_MS = 978307200000;

function createDatabase(filePath: string, sql: string): void {
  const database = new Database(filePath);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

test("verifies and reads every supported browser history engine", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echoes-history-"));
  try {
    const now = Date.now();
    const chromiumPath = path.join(root, "History");
    const firefoxPath = path.join(root, "places.sqlite");
    const safariPath = path.join(root, "History.db");
    const jsonPath = path.join(root, "history.json");

    createDatabase(
      chromiumPath,
      `CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
       CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER);
       INSERT INTO urls VALUES (1, 'https://chromium.example', 'Chromium');
       INSERT INTO visits VALUES (
         1,
         1,
         ${Math.trunc((now + CHROMIUM_EPOCH_OFFSET_MS) * 1000)}
       );`,
    );
    createDatabase(
      firefoxPath,
      `CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
       CREATE TABLE moz_historyvisits (
         id INTEGER PRIMARY KEY,
         place_id INTEGER,
         visit_date INTEGER
       );
       INSERT INTO moz_places VALUES (1, 'https://firefox.example', 'Firefox');
       INSERT INTO moz_historyvisits VALUES (1, 1, ${now * 1000});`,
    );
    createDatabase(
      safariPath,
      `CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT);
       CREATE TABLE history_visits (
         id INTEGER PRIMARY KEY,
         history_item INTEGER,
         title TEXT,
         visit_time REAL
       );
       INSERT INTO history_items VALUES (1, 'https://safari.example');
       INSERT INTO history_visits VALUES (
         1,
         1,
         'Safari',
         ${(now - SAFARI_EPOCH_OFFSET_MS) / 1000}
       );`,
    );
    await fs.writeFile(
      jsonPath,
      JSON.stringify([{
        url: "https://json.example",
        title: "JSON",
        visitTime: now,
      }]),
    );

    const sources: BrowserSource[] = [
      {
        id: "chromium",
        name: "Chromium",
        engine: "chromium",
        path: chromiumPath,
        enabled: true,
      },
      {
        id: "firefox",
        name: "Firefox",
        engine: "firefox",
        path: firefoxPath,
        enabled: true,
      },
      {
        id: "safari",
        name: "Safari",
        engine: "safari",
        path: safariPath,
        enabled: true,
      },
      {
        id: "json",
        name: "JSON",
        engine: "json",
        path: jsonPath,
        enabled: true,
      },
    ];

    for (const source of sources) {
      const result = await verifyBrowserSource(source);
      assert.equal(result.success, true, result.message);
    }

    process.env.BROWSER_SOURCES_JSON = JSON.stringify(sources);
    const { readAllHistory } = await import("../lib/browser-history");
    const entries = readAllHistory(24 * 60 * 60 * 1000);

    assert.deepEqual(
      new Set(entries.map((entry) => entry.url)),
      new Set([
        "https://chromium.example",
        "https://firefox.example",
        "https://safari.example",
        "https://json.example",
      ]),
    );
  } finally {
    delete process.env.BROWSER_SOURCES_JSON;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a database whose schema does not match its configured engine", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echoes-history-bad-"));
  try {
    const databasePath = path.join(root, "History");
    createDatabase(databasePath, "CREATE TABLE unrelated (id INTEGER);");
    const result = await verifyBrowserSource({
      id: "bad",
      name: "Wrong format",
      engine: "chromium",
      path: databasePath,
      enabled: true,
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "invalid_format");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
