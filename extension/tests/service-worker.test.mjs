import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const portalUrl = "https://kampusberdampak.upnvj.ac.id/logbook-harian";
const snapshot = (date) => ({
  date, start_time: "09:00", end_time: "17:00", activity_text: "Membuat halaman fasilitas.",
  result_text: "Halaman fasilitas tersedia.", obstacle_text: "",
  documentation_url: "https://drive.google.com/file/d/example/view", reflection_text: "",
});

function createRunner({ paused = false, activeSave = false, deferVerification = false } = {}) {
  const storage = { extensionToken: "paired-token", runnerWorkerId: "worker-id-123" };
  const handlers = {};
  const messages = [];
  const reports = [];
  const heartbeats = [];
  let releaseVerification = () => {};
  let claimCount = paused ? 1 : 0;
  let currentRun = {
    id: "run-1", start_date: "2026-10-01", end_date: "2026-10-02", status: paused ? "paused" : activeSave ? "running" : "ready",
    runner: "extension", total_entries: 2, completed_entries: paused ? 0 : 0,
    counts: { queued: paused || activeSave ? 1 : 2, verification_needed: paused ? 1 : 0 },
    entries: [
      { id: "item-1", status: paused ? "verification_needed" : activeSave ? "processing" : "queued", save_attempted: paused || activeSave },
      { id: "item-2", status: "queued", save_attempted: false },
    ],
  };
  const claim = (id, entryId, date, saveAttempted = false) => ({
    run_id: id, run_entry_id: entryId, entry_id: "source-" + entryId,
    save_attempted: saveAttempted, entry: snapshot(date),
  });
  if (activeSave) {
    storage.runnerState = {
      worker_id: "worker-id-123",
      active: claim("run-1", "item-1", "2026-10-01", true),
      tab_id: 42,
      save_attempted: true,
    };
  }
  const event = (key) => ({ addListener(listener) { handlers[key] = listener; } });
  const chrome = {
    runtime: {
      id: "extension-id",
      onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
    },
    alarms: { create() {}, onAlarm: event("alarm") },
    tabs: {
      onUpdated: event("tabUpdated"), onRemoved: event("tabRemoved"),
      async query() { return [{ id: 42, url: portalUrl, active: true }]; },
      async sendMessage(_tabId, message) {
        messages.push(message);
        if (message.type === "LOGPILOT_INSPECT") return { portalReady: true };
        if (message.type === "VERIFY_SAVED") {
          if (!deferVerification) return { saved: true };
          return new Promise((resolve) => { releaseVerification = () => resolve({ saved: true }); });
        }
        if (message.type === "RUN_ENTRY") return { accepted: true };
        return { accepted: true };
      },
    },
    storage: { local: {
      async setAccessLevel() {},
      async get(key) { return typeof key === "string" ? { [key]: storage[key] } : { ...storage }; },
      async set(values) { Object.assign(storage, values); },
      async remove(key) { delete storage[key]; },
    } },
  };
  const api = {
    async request(path, init = {}) {
      if (path === "/health" || path === "/extension/status") return {};
      if (path === "/extension/jobs/latest") return currentRun;
      if (path === "/extension/jobs/run-1/entries/item-1") {
        return { ...claim("run-1", "item-1", "2026-10-01"), save_attempted: true };
      }
      if (path === "/extension/jobs/claim") {
        claimCount += 1;
        return claimCount === 1 ? claim("run-1", "item-1", "2026-10-01", activeSave)
          : claimCount === 2 ? claim("run-1", "item-2", "2026-10-02") : null;
      }
      if (path.endsWith("/save-attempted")) return { save_attempted: true };
      if (path.endsWith("/heartbeat")) {
        heartbeats.push(path);
        return { run_status: "running", pause_requested: false, stop_requested: false };
      }
      if (path.endsWith("/report")) {
        const body = JSON.parse(init.body);
        reports.push(body);
        if (!body.portal_verified) {
          currentRun = {
            ...currentRun, status: "paused",
            entries: [
              { id: "item-1", status: "verification_needed", save_attempted: true },
              { id: "item-2", status: "queued", save_attempted: false },
            ],
          };
          return currentRun;
        }
        currentRun = {
          ...currentRun, status: "ready", completed_entries: 1,
          counts: { queued: 1, submitted: 1, verification_needed: 0 },
          entries: [
            { id: "item-1", status: "submitted", save_attempted: true },
            { id: "item-2", status: "queued", save_attempted: false },
          ],
        };
        return currentRun;
      }
      throw new Error("Unexpected API request: " + path);
    },
  };
  const context = vm.createContext({ chrome, LogpilotApi: api, importScripts() {}, URL, crypto: globalThis.crypto });
  vm.runInContext(readFileSync(new URL("../dist/background/service-worker.js", import.meta.url), "utf8"), context);
  const send = (message, sender) => new Promise((resolve) => {
    handlers.message(message, sender, resolve);
  });
  return { send, messages, reports, heartbeats, releaseVerification: () => releaseVerification() };
}

test("a save in progress renews its lease without another save", async () => {
  const runner = createRunner();
  const popup = { id: "extension-id", url: "chrome-extension://extension-id/popup.html" };
  const portal = { id: "extension-id", tab: { id: 42, url: portalUrl } };
  await runner.send({ type: "START_RUN" }, popup);

  const beforeSave = await runner.send({ type: "SAVE_HEARTBEAT", run_id: "run-1", run_entry_id: "item-1" }, portal);
  assert.equal(beforeSave.ok, false);
  await runner.send({ type: "SAVE_ATTEMPT", run_id: "run-1", run_entry_id: "item-1" }, portal);
  const duringSave = await runner.send({ type: "SAVE_HEARTBEAT", run_id: "run-1", run_entry_id: "item-1" }, portal);

  assert.equal(duringSave.ok, true);
  assert.deepEqual(runner.heartbeats, ["/extension/jobs/run-1/entries/item-1/heartbeat"]);
  assert.equal(runner.reports.length, 0);
  assert.equal(runner.messages.some((message) => /selesaikan logbook/i.test(JSON.stringify(message))), false);
});

test("a verified pending-validation save automatically dispatches the next date", async () => {
  const runner = createRunner();
  const popup = { id: "extension-id", url: "chrome-extension://extension-id/popup.html" };
  const portal = { id: "extension-id", tab: { id: 42, url: portalUrl } };

  const started = await runner.send({ type: "START_RUN" }, popup);
  assert.equal(started.ok, true);
  await runner.send({
    type: "SAVE_ATTEMPT", run_id: "run-1", run_entry_id: "item-1",
  }, portal);
  await runner.send({
    type: "ENTRY_RESULT", run_id: "run-1", run_entry_id: "item-1", outcome: "success",
  }, portal);

  assert.deepEqual(runner.reports.map((report) => report.portal_verified), [false, true]);
  assert.deepEqual(
    runner.messages.filter((message) => message.type === "RUN_ENTRY").map((message) => message.claim.entry.date),
    ["2026-10-01", "2026-10-02"],
  );
  assert.ok(runner.messages.some((message) => message.type === "VERIFY_SAVED"));
  assert.equal(runner.messages.some((message) => /selesaikan logbook/i.test(JSON.stringify(message))), false);
});

test("opening the popup automatically recovers an already-paused saved entry", async () => {
  const runner = createRunner({ paused: true });
  const popup = { id: "extension-id", url: "chrome-extension://extension-id/popup.html" };

  const response = await runner.send({ type: "GET_STATUS" }, popup);

  assert.equal(response.ok, true);
  assert.deepEqual(runner.reports.map((report) => report.portal_verified), [true]);
  assert.deepEqual(
    runner.messages.filter((message) => message.type === "RUN_ENTRY").map((message) => message.claim.entry.date),
    ["2026-10-02"],
  );
});

test("a pending-validation entry advances without waiting for the claim lease", async () => {
  const runner = createRunner({ activeSave: true });
  const popup = { id: "extension-id", url: "chrome-extension://extension-id/popup.html" };

  const response = await runner.send({ type: "GET_STATUS" }, popup);

  assert.equal(response.ok, true);
  assert.deepEqual(runner.reports.map((report) => report.portal_verified), [true]);
  assert.deepEqual(
    runner.messages.filter((message) => message.type === "RUN_ENTRY").map((message) => message.claim.entry.date),
    ["2026-10-02"],
  );
});

test("popup polling and an entry result share one portal verification", async () => {
  const runner = createRunner({ activeSave: true, deferVerification: true });
  const popup = { id: "extension-id", url: "chrome-extension://extension-id/popup.html" };
  const portal = { id: "extension-id", tab: { id: 42, url: portalUrl } };

  const status = runner.send({ type: "GET_STATUS" }, popup);
  await new Promise(setImmediate);
  const result = runner.send({
    type: "ENTRY_RESULT", run_id: "run-1", run_entry_id: "item-1", outcome: "success",
  }, portal);
  await new Promise(setImmediate);

  assert.equal(runner.messages.filter((message) => message.type === "VERIFY_SAVED").length, 1);
  runner.releaseVerification();
  await Promise.all([status, result]);

  assert.equal(runner.messages.filter((message) => message.type === "VERIFY_SAVED").length, 1);
  assert.deepEqual(
    runner.messages.filter((message) => message.type === "RUN_ENTRY").map((message) => message.claim.entry.date),
    ["2026-10-02"],
  );
});
