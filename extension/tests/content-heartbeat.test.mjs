import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("the content script renews the save lease only while its entry is active", async () => {
  const messages = [];
  let listener;
  let tick;
  let releaseRun;
  let intervalCleared = false;
  const chrome = {
    runtime: {
      id: "extension-id",
      onMessage: { addListener(callback) { listener = callback; } },
      async sendMessage(message) {
        messages.push(message);
        return { ok: true, result: message.type === "SAVE_ATTEMPT" ? { allowed: true } : {} };
      },
    },
  };
  const adapter = {
    async run(_entry, controls) {
      await controls.markSaveAttempt();
      await new Promise((resolve) => { releaseRun = resolve; });
      return { outcome: "success" };
    },
  };
  const context = vm.createContext({
    chrome,
    LogpilotPortalAdapter: adapter,
    location: { origin: "https://kampusberdampak.upnvj.ac.id", pathname: "/logbook-harian" },
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() { intervalCleared = true; },
  });
  vm.runInContext(readFileSync(new URL("../dist/content/sberdampak.js", import.meta.url), "utf8"), context);
  listener({ type: "RUN_ENTRY", claim: {
    run_id: "run-1", run_entry_id: "item-1", entry_id: "source-1", entry: {},
  } }, { id: "extension-id", url: "chrome-extension://extension-id/background.js" }, () => {});
  await new Promise(setImmediate);

  assert.equal(typeof tick, "function");
  tick();
  await new Promise(setImmediate);
  assert.equal(messages.filter((message) => message.type === "SAVE_HEARTBEAT").length, 1);

  releaseRun();
  await new Promise(setImmediate);
  assert.equal(intervalCleared, true);
  assert.equal(messages.filter((message) => message.type === "ENTRY_RESULT").length, 1);
});
