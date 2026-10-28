import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../dist/automation/safety.js", import.meta.url), "utf8");
const context = vm.createContext({ document: { getElementById: () => null } });
vm.runInContext(source, context);
const { clickDailySave } = context.LogpilotSafety;

function fixture(overrides = {}) {
  let clicks = 0;
  const attributes = Object.entries(overrides.attributes ?? {}).map(([name, value]) => ({ name, value }));
  const button = {
    id: "lbhBtnSave",
    tagName: "BUTTON",
    type: "button",
    textContent: "Simpan",
    disabled: false,
    hidden: false,
    attributes,
    getClientRects: () => [{}],
    getAttribute: (name) => overrides.attributes?.[name] ?? null,
    click: () => { clicks += 1; },
    ...overrides.button,
  };
  const panel = {
    id: "lbhRail",
    contains: (target) => target === button,
    querySelectorAll: () => [button],
  };
  return { panel, button, clicks: () => clicks };
}

test("only the observed daily Save control can be activated", () => {
  const dom = fixture();
  clickDailySave("save-daily-entry", "#lbhRail #lbhBtnSave", dom.panel, dom.button, 1);
  assert.equal(dom.clicks(), 1);
});

test("finalization-like labels are rejected before a click", () => {
  for (const attributes of [{ title: "Selesaikan Logbook" }, { "data-action": "finalize" }, { "aria-labelledby": "finish-label" }]) {
    context.document.getElementById = () => ({ textContent: "Selesaikan Logbook" });
    const dom = fixture({ attributes });
    assert.throws(() => clickDailySave("save-daily-entry", "#lbhRail #lbhBtnSave", dom.panel, dom.button, 1));
    assert.equal(dom.clicks(), 0);
  }
  context.document.getElementById = () => null;
});

test("wrong action, selector, context, or ambiguous controls fail closed", () => {
  const dom = fixture();
  for (const args of [
    ["finalize-logbook", "#lbhRail #lbhBtnSave", dom.panel, dom.button, 1],
    ["save-daily-entry", "button", dom.panel, dom.button, 1],
    ["save-daily-entry", "#lbhRail #lbhBtnSave", { ...dom.panel, id: "other" }, dom.button, 1],
    ["save-daily-entry", "#lbhRail #lbhBtnSave", dom.panel, dom.button, 2],
  ]) {
    assert.throws(() => clickDailySave(...args));
  }
  assert.equal(dom.clicks(), 0);
});
