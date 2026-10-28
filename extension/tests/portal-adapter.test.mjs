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
  querySelectorAll(selector) {
    if (selector === "#lbhBtnSave" && this.doc?.formOpen) return [this.doc.save];
    if (selector === "button") return [this.doc.status];
    return [];
  }
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

function mockPortal(initialText = "KAMIS, 1 OKTOBER 2026 · Belum ada entri", initialValues = {}) {
  let existing = !initialText.toLowerCase().includes("belum ada entri");
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
  const edit = new MockElement("lbhBtnEdit", "✎ Ubah Entri", "button");
  const status = new MockElement("entry-status", "Menunggu Validasi", "button");
  const points = initialValues.activity_points ?? [initialValues.activity_text ?? ""];
  const activityFields = points.map((value) => {
    const field = new MockInput("", "", "text");
    field.value = value;
    return field;
  });
  const fields = {
    "#fMulai": new MockInput("fMulai", "", "time"),
    "#fSelesai": new MockInput("fSelesai", "", "time"),
    "#fHasil": new MockTextarea("fHasil"),
    "#fKendala": new MockTextarea("fKendala"),
    "#fDok": new MockInput("fDok", "", "url"),
    "#fRefleksi": new MockTextarea("fRefleksi"),
  };
  for (const [selector, field] of Object.entries(fields)) {
    if (selector === "#fMulai") field.value = initialValues.start_time ?? "";
    else if (selector === "#fSelesai") field.value = initialValues.end_time ?? "";
    else field.value = initialValues[({ "#fHasil": "result_text", "#fKendala": "obstacle_text", "#fDok": "documentation_url", "#fRefleksi": "reflection_text" })[selector]] ?? "";
  }
  if (!existing) {
    activityFields[0].value = "";
    for (const field of Object.values(fields)) field.value = "";
  }
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
      if (selector === "#lbhRail #lbhBtnEdit") return formOpen || !existing ? [] : [edit];
      if (selector === "#lbhRail #lbhBtnCancel") return formOpen ? [cancel] : [];
      if (selector === "#lbhRail #lbhBtnSave") return formOpen ? [save] : [];
      if (selector === "#fUraianField input") return formOpen ? activityFields : [];
      return fields[selector] && formOpen ? [fields[selector]] : [];
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
  };
  panel.doc = doc;
  doc.status = status;
  status.parentElement = panel;
  add.parentElement = panel;
  cancel.parentElement = panel;
  save.parentElement = panel;
  edit.parentElement = panel;
  day.type = "button";
  day.disabled = false;
  add.onClick = () => { formOpen = true; doc.formOpen = true; };
  edit.onClick = () => {
    formOpen = true;
    doc.formOpen = true;
    panel.textContent = `KAMIS, ${selectedDate.toUpperCase()} · Revisi Entri`;
  };
  cancel.onClick = () => {
    formOpen = false;
    doc.formOpen = false;
    panel.textContent = `KAMIS, ${selectedDate.toUpperCase()} · ${activityFields.map((field) => field.value).join(" ")} · Menunggu Validasi`;
  };
  save.onClick = () => {
    formOpen = false;
    doc.formOpen = false;
    existing = true;
    panel.textContent = `KAMIS, ${selectedDate.toUpperCase()} · ${activityFields.map((field) => field.value).join(" ")} · Menunggu Validasi`;
  };
  context.document = doc;
  return { doc, panel, fields, save, edit, finish, setDate(value) { selectedDate = value; } };
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

test("pending-validation entry can be verified without another save", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text} · Menunggu Validasi`, snapshot);

  const saved = await context.LogpilotPortalAdapter.verifySaved(snapshot);

  assert.equal(saved, true);
  assert.equal(portal.doc.formOpen, false);
  assert.equal(portal.edit.clickCount, 1);
  assert.equal(portal.save.clickCount, 0);
  assert.equal(portal.finish.clickCount, 0);
});

test("same entry already present is skipped without saving again", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text}`, snapshot);
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

test("an existing entry with a changed result is revised instead of duplicated", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text}`, {
    ...snapshot,
    result_text: "Hasil lama.",
  });
  let saveMarker = 0;
  const result = await context.LogpilotPortalAdapter.run(snapshot, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => { saveMarker += 1; },
  });

  assert.equal(result.outcome, "updated", result.error);
  assert.equal(portal.doc.formOpen, false);
  assert.equal(portal.fields["#fHasil"].value, snapshot.result_text);
  assert.equal(saveMarker, 1);
  assert.equal(portal.save.clickCount, 1);
  assert.equal(portal.edit.clickCount, 2);
  assert.equal(portal.finish.clickCount, 0);
});

test("an unchanged existing entry is compared field by field and not saved", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text}`, snapshot);
  const result = await context.LogpilotPortalAdapter.run(snapshot, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => assert.fail("unchanged entries must not mark a save attempt"),
  });

  assert.equal(result.outcome, "already_present", result.error);
  assert.equal(portal.doc.formOpen, false);
  assert.equal(portal.edit.clickCount, 1);
  assert.equal(portal.save.clickCount, 0);
  assert.equal(portal.finish.clickCount, 0);
});

test("existing entries with multiple activity points stop without a save", async () => {
  const portal = mockPortal(`KAMIS, 1 OKTOBER 2026 · ${snapshot.activity_text}`, {
    ...snapshot,
    activity_points: [snapshot.activity_text, "Poin kedua"],
  });
  let saveMarker = 0;
  const result = await context.LogpilotPortalAdapter.run(snapshot, {
    checkpoint: async () => "continue",
    markSaveAttempt: async () => { saveMarker += 1; },
  });

  assert.equal(result.outcome, "skipped");
  assert.equal(saveMarker, 0);
  assert.equal(portal.save.clickCount, 0);
  assert.equal(portal.doc.formOpen, false);
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
