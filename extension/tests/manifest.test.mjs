import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("extension requests only the local storage permission and exact hosts", () => {
  assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://kampusberdampak.upnvj.ac.id/*",
    "http://127.0.0.1:8000/*",
  ]);
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
});

test("content script is limited to the inspected logbook route", () => {
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://kampusberdampak.upnvj.ac.id/logbook-harian*",
  ]);
  assert.deepEqual(manifest.content_scripts[0].js, [
    "dist/automation/safety.js",
    "dist/automation/portal-adapter.js",
    "dist/content/sberdampak.js",
  ]);
});

test("manifest points only to locally built extension files", () => {
  for (const file of [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.content_scripts[0].js[0],
    ...manifest.content_scripts[0].js,
    manifest.icons[128],
  ]) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} should exist`);
  }
  const serviceWorker = readFileSync(new URL("../src/background/service-worker.ts", import.meta.url), "utf8");
  assert.match(serviceWorker, /importScripts\("\.\.\/lib\/api-client\.js"\)/);
  assert.match(serviceWorker, /setAccessLevel\(\{ accessLevel: "TRUSTED_CONTEXTS" \}\)/);
});
