import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

class MockElement {
  constructor(id = "", textContent = "", type = "button") {
    this.id = id;
    this.textContent = textContent;
    this.type = type;
    this.tagName = id.startsWith("lbhBtn") ? "BUTTON" : "INPUT";
    this.disabled = false;
    this.hidden = false;
    this.attributes = [];
    this.labels = [];
    this.form = null;
    this._value = "";
    this.clickCount = 0;
    this.onClick = () => {};
  }
  getClientRects() { return [{}]; }
  getAttribute(name) { return Object.fromEntries(this.attributes.map(({ name: key, value }) => [key, value]))[name] ?? null; }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  contains(element) { return element === this || element.parentElement === this; }
  querySelectorAll(selector) { return selector === "#lbhBtnSave" && this.doc?.formOpen ? [this.doc.save] : []; }
  click() { this.clickCount += 1; this.onClick(); }
  dispatchEvent() { return true; }
}

class MockInput extends MockElement {}
class MockTextarea extends MockElement {}
Object.defineProperty(MockInput.prototype, "value", { get() { return this._value; }, set(value) { this._value = value; } });
Object.defineProperty(MockTextarea.prototype, "value", { get() { return this._value; }, set(value) { this._value = value; } });

const context = vm.createContext({
  Element: MockElement,
  HTMLInputElement: MockInput,
  HTMLTextAreaElement: MockTextarea,
  URL,
  Event: class {},
  MutationObserver: class {},
  location: { origin: "https://kampusberdampak.upnvj.ac.id", pathname: "/logbook-harian" },
  document: {},
});
vm.runInContext(readFileSync(new URL("../dist/automation/safety.js", import.meta.url), "utf8"), context);
vm.runInContext(readFileSync(new URL("../dist/automation/portal-adapter.js", import.meta.url), "utf8"), context);

function mockPortal(initialText = "KAMIS, 1 OKTOBER 2026 · Belum ada entri") {
  const panel = new MockElement("lbhRail", initialText);
  const heading = new MockElement("lbhMonthLabel", "Oktober 2026");
  const day = new MockElement("", "1");
  let selectedDate = "1 Oktober 2026";

  const grid = new MockElement("lbhCalGrid");
  grid.querySelectorAll = (selector) => selector === "button" ? [day] : [];
  const save = new MockElement("lbhBtnSave", "Simpan", "button");
  const finish = new MockElement("lbhBtnFinish", "Selesaikan Logbook Sekarang", "button");
  const add = new MockElement("lbhBtnAdd", "Tambah Entri", "button");
  const cancel = new MockElement("lbhBtnCancel", "Batal", "button");
  const fields = {
    "#fMulai": new MockInput("fMulai", "", "time"),
    "#fSelesai": new MockInput("fSelesai", "", "time"),
    "#fUraianField input": new MockInput("", "", "text"),
    "#fHasil": new MockTextarea("fHasil"),
    "#fKendala": new MockTextarea("fKendala"),
    "#fDok": new MockInput("fDok", "", "url"),
    "#fRefleksi": new MockTextarea("fRefleksi"),
  };
  let formOpen = false;
  const doc = {
    formOpen: false,
    save,
    getElementById: () => null,
    querySelectorAll(selector) {
      if (selector === "#lbhRail") return [panel];
      if (selector === "#lbhMonthLabel") return [heading];
      if (selector === "#lbhCalGrid") return [grid];
      if (selector === "#lbhCalPrev" || selector === "#lbhCalNext") return [new MockElement(selector.slice(1))];
      if (selector === "#lbhBtnAdd") return formOpen ? [] : [add];
      if (selector === "#lbhBtnCancel") return formOpen ? [cancel] : [];
      if (selector === "#lbhRail #lbhBtnSave") return formOpen ? [save] : [];
      return fields[selector] && formOpen ? [fields[selector]] : [];
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
  };
  panel.doc = doc;
  add.parentElement = panel;
  cancel.parentElement = panel;
  save.parentElement = panel;
  day.type = "button";
  day.disabled = false;
  add.onClick = () => { formOpen = true; doc.formOpen = true; };
  cancel.onClick = () => { formOpen = false; doc.formOpen = false; };
  save.onClick = () => {
    formOpen = false;
    doc.formOpen = false;
    panel.textContent = `KAMIS, ${selectedDate.toUpperCase()} · ${fields["#fUraianField input"].value}`;
  };
  context.document = doc;
  return { doc, panel, fields, save, finish, setDate(value) { selectedDate = value; } };
}

const snapshot = {
  date: "2026-10-01", start_time: "09:00", end_time: "17:00",
  activity_text: "Membuat halaman fasilitas.", result_text: "Halaman fasilitas tersedia.",
  obstacle_text: "", documentation_url: "https://drive.google.com/file/d/example/view", reflection_text: "",
};

test("mock portal fills the approved entry and clicks only the observed daily Save", async () => {
  const portal = mockPortal();
  let saveMarker = 0;
  const result = await context.LogpilotPortalAdapter.run(snapshot, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => { saveMarker += 1; },
  });

  assert.equal(result.outcome, "success", result.error);
  assert.equal(portal.fields["#fMulai"].value, "09:00");
  assert.equal(portal.fields["#fSelesai"].value, "17:00");
  assert.equal(portal.fields["#fHasil"].value, "Halaman fasilitas tersedia.");
  assert.equal(saveMarker, 1);
  assert.equal(portal.save.clickCount, 1);
  assert.equal(portal.finish.clickCount, 0);
});

test("same activity already present is skipped without opening or saving again", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text}`);
  let saveMarker = 0;
  const result = await context.LogpilotPortalAdapter.run(snapshot, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => { saveMarker += 1; },
  });

  assert.equal(result.outcome, "already_present", result.error);
  assert.equal(portal.doc.formOpen, false);
  assert.equal(saveMarker, 0);
  assert.equal(portal.save.clickCount, 0);
  assert.equal(portal.finish.clickCount, 0);
});

test("invalid 24-hour time stops before the save marker", async () => {
  mockPortal();
  let saveMarker = 0;
  const result = await context.LogpilotPortalAdapter.run({ ...snapshot, start_time: "9:00" }, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => { saveMarker += 1; },
  });

  assert.equal(result.outcome, "unknown");
  assert.match(result.error, /24 jam/);
  assert.equal(saveMarker, 0);
});
