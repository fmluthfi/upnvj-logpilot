namespace LogpilotPortalAdapter {
  export type EntrySnapshot = {
    date: string;
    start_time: string;
    end_time: string;
    activity_text: string;
    result_text: string;
    obstacle_text: string;
    documentation_url: string;
    reflection_text: string;
  };

  export type Outcome = "success" | "updated" | "already_present" | "failed" | "skipped" | "unknown" | "paused" | "stopped";
  export type Checkpoint = (step: string) => Promise<"continue" | "pause" | "stop">;
  export type Controls = { checkpoint: Checkpoint; markSaveAttempt: () => Promise<void> };
  export type Result = { outcome: Outcome; error?: string };
  class HaltError extends Error {
    constructor(readonly outcome: "paused" | "stopped") { super("Automation dihentikan pada checkpoint aman."); }
  }
  class UnsupportedRevisionError extends Error {}

  const PORTAL_ORIGIN = "https://kampusberdampak.upnvj.ac.id";
  const PORTAL_PATH = "/logbook-harian";
  const SAVE_CONFIRMATION_TIMEOUT_MS = 30_000;
  const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const SELECTORS = {
    panel: "#lbhRail",
    month: "#lbhMonthLabel",
    calendar: "#lbhCalGrid",
    previousMonth: "#lbhCalPrev",
    nextMonth: "#lbhCalNext",
    add: "#lbhBtnAdd",
    edit: "#lbhRail #lbhBtnEdit",
    start: "#fMulai",
    end: "#fSelesai",
    activity: "#fUraianField input",
    result: "#fHasil",
    obstacle: "#fKendala",
    documentation: "#fDok",
    reflection: "#fRefleksi",
    cancel: "#lbhRail #lbhBtnCancel",
  } as const;

  export async function run(snapshot: EntrySnapshot, controls: Controls): Promise<Result> {
    const formState = { open: false, saveInFlight: false };
    try {
      validateSnapshot(snapshot);
      if (location.origin !== PORTAL_ORIGIN || location.pathname !== PORTAL_PATH) return failed("Buka halaman logbook portal sebelum menjalankan batch.");
      await requireContinue(controls, "Memeriksa sesi");

      await navigateToDate(snapshot.date, controls);
      const panel = unique<HTMLElement>(SELECTORS.panel);
      assertDate(panel.textContent ?? "", snapshot.date);
      await requireContinue(controls, "Memeriksa entri");

      if (!normalize(panel.textContent ?? "").includes("belum ada entri")) {
        const edit = unique<HTMLButtonElement>(SELECTORS.edit);
        if (edit.id !== "lbhBtnEdit" || !normalize(edit.textContent ?? "").endsWith("ubah entri")
          || edit.type !== "button" || edit.disabled || !panel.contains(edit)) {
          throw new UnsupportedRevisionError("Tombol revisi entri tidak cocok. Tidak ada perubahan yang dibuat.");
        }
        edit.click();
        formState.open = true;
        await waitFor(() => isRevisionForm(snapshot.date));
        if (revisionMatches(snapshot, readRevisionFields())) {
          cancelOpenForm(snapshot);
          formState.open = false;
          return { outcome: "already_present" };
        }

        await requireContinue(controls, "Mengisi revisi");
        fill(snapshot);
        await saveForm(snapshot, controls, formState, "update-daily-entry");
        const revisedPanel = unique<HTMLElement>(SELECTORS.panel);
        assertDate(revisedPanel.textContent ?? "", snapshot.date);
        if (occurrences(normalize(revisedPanel.textContent ?? ""), normalize(snapshot.activity_text)) !== 1) {
          return { outcome: "unknown", error: "Form revisi tertutup, tetapi perubahan belum dapat diverifikasi. Periksa tanggal ini secara manual." };
        }

        unique<HTMLButtonElement>(SELECTORS.edit).click();
        formState.open = true;
        await waitFor(() => isRevisionForm(snapshot.date));
        const verified = revisionMatches(snapshot, readRevisionFields());
        cancelOpenForm(snapshot);
        formState.open = false;
        return verified
          ? { outcome: "updated" }
          : { outcome: "unknown", error: "Portal menutup form, tetapi beberapa field belum cocok dengan revisi. Periksa tanggal ini secara manual." };
      }

      if (document.querySelector("#fMulai")) throw new Error("Form portal sudah terbuka. Tutup form tersebut sebelum menjalankan entri.");
      const add = unique<HTMLButtonElement>(SELECTORS.add);
      if (add.textContent?.trim() !== "Tambah Entri" || add.type !== "button" || add.disabled || !panel.contains(add)) {
        throw new Error("Tombol Tambah Entri tidak cocok dengan halaman yang diperiksa.");
      }
      add.click();
      formState.open = true;
      await waitFor(() => document.querySelector(SELECTORS.start) !== null);
      assertDate(unique<HTMLElement>(SELECTORS.panel).textContent ?? "", snapshot.date);

      await requireContinue(controls, "Mengisi entri");
      fill(snapshot);

      await saveForm(snapshot, controls, formState, "save-daily-entry");
      await waitFor(() => savedSummaryMatches(snapshot), SAVE_CONFIRMATION_TIMEOUT_MS);
      return { outcome: "success" };
    } catch (error) {
      if (formState.open && !formState.saveInFlight) {
        try { cancelOpenForm(snapshot); } catch { /* Leave uncertain portal state untouched. */ }
      }
      if (error instanceof HaltError) return { outcome: error.outcome };
      if (error instanceof UnsupportedRevisionError) return { outcome: "skipped", error: error.message };
      return { outcome: "unknown", error: error instanceof Error ? error.message : "Hasil portal tidak dapat dipastikan. Periksa tanggal ini secara manual." };
    }
  }

  export async function verifySaved(snapshot: EntrySnapshot): Promise<boolean> {
    let formOpen = false;
    try {
      validateSnapshot(snapshot);
      if (location.origin !== PORTAL_ORIGIN || location.pathname !== PORTAL_PATH) return false;
      if (document.querySelector(SELECTORS.start)) return false;
      if (!savedSummaryMatches(snapshot)) await navigateToDate(snapshot.date, { checkpoint: async () => "continue" });
      await waitFor(() => savedSummaryMatches(snapshot), SAVE_CONFIRMATION_TIMEOUT_MS);
      const panel = unique<HTMLElement>(SELECTORS.panel);
      assertDate(panel.textContent ?? "", snapshot.date);

      const edit = unique<HTMLButtonElement>(SELECTORS.edit);
      if (edit.id !== "lbhBtnEdit" || !normalize(edit.textContent ?? "").endsWith("ubah entri")
        || edit.type !== "button" || edit.disabled || !panel.contains(edit)) return false;
      edit.click();
      formOpen = true;
      await waitFor(() => isRevisionForm(snapshot.date));
      const matches = revisionMatches(snapshot, readRevisionFields());
      cancelOpenForm(snapshot);
      formOpen = false;
      return matches;
    } catch {
      if (formOpen) {
        try { cancelOpenForm(snapshot); } catch { /* Leave an uncertain portal form untouched. */ }
      }
      return false;
    }
  }

  async function saveForm(snapshot: EntrySnapshot, controls: Controls, state: { open: boolean; saveInFlight: boolean }, action: "save-daily-entry" | "update-daily-entry") {
    await requireContinue(controls, action === "update-daily-entry" ? "Memeriksa revisi sebelum Simpan" : "Memeriksa sebelum Simpan");
    const panelBeforeSave = unique<HTMLElement>(SELECTORS.panel);
    const saveBeforeMarker = unique<HTMLElement>(LogpilotSafety.DAILY_SAVE_SELECTOR);
    assertDate(panelBeforeSave.textContent ?? "", snapshot.date);
    LogpilotSafety.assertDailySaveTarget(action, LogpilotSafety.DAILY_SAVE_SELECTOR, panelBeforeSave, saveBeforeMarker, document.querySelectorAll(LogpilotSafety.DAILY_SAVE_SELECTOR).length);
    await controls.markSaveAttempt();
    state.saveInFlight = true;
    const currentPanel = unique<HTMLElement>(SELECTORS.panel);
    const currentSave = unique<HTMLElement>(LogpilotSafety.DAILY_SAVE_SELECTOR);
    assertDate(currentPanel.textContent ?? "", snapshot.date);
    LogpilotSafety.clickDailySave(action, LogpilotSafety.DAILY_SAVE_SELECTOR, currentPanel, currentSave, document.querySelectorAll(LogpilotSafety.DAILY_SAVE_SELECTOR).length);
    await waitFor(() => !document.querySelector(SELECTORS.start)
      || (action === "save-daily-entry" && savedSummaryMatches(snapshot)),
    action === "save-daily-entry" ? SAVE_CONFIRMATION_TIMEOUT_MS : undefined);
    if (document.querySelector(SELECTORS.start)) {
      if (action !== "save-daily-entry" || !savedSummaryMatches(snapshot)) {
        throw new Error("Status entri tersimpan belum terlihat. Periksa portal sebelum mencoba lagi.");
      }
      cancelOpenForm(snapshot);
      await waitFor(() => !document.querySelector(SELECTORS.start));
    }
    state.open = false;
    state.saveInFlight = false;
  }

  function isRevisionForm(date: string) {
    const panel = document.querySelector<HTMLElement>(SELECTORS.panel);
    return !!panel && hasDate(panel.textContent ?? "", date)
      && normalize(panel.textContent ?? "").includes("revisi entri")
      && document.querySelector(SELECTORS.start) !== null;
  }

  function hasPendingValidation(panel: HTMLElement) {
    const statuses = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => normalize(button.textContent ?? "") === "menunggu validasi");
    return statuses.length === 1 && statuses[0].type === "button" && visible(statuses[0]);
  }

  function savedSummaryMatches(snapshot: EntrySnapshot) {
    const panel = document.querySelector<HTMLElement>(SELECTORS.panel);
    const text = panel?.textContent ?? "";
    return !!panel && hasDate(text, snapshot.date) && hasPendingValidation(panel)
      && occurrences(normalize(text), normalize(snapshot.activity_text)) === 1;
  }

  function readRevisionFields(): Omit<EntrySnapshot, "date"> {
    const activities = document.querySelectorAll<HTMLInputElement>(SELECTORS.activity);
    if (activities.length !== 1 || !visible(activities[0])) {
      throw new UnsupportedRevisionError("Entri memiliki lebih dari satu poin uraian atau field tidak terbaca. Revisi otomatis dihentikan tanpa menyimpan.");
    }
    const start = unique<HTMLInputElement>(SELECTORS.start).value;
    const end = unique<HTMLInputElement>(SELECTORS.end).value;
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(end)) {
      throw new UnsupportedRevisionError("Jam pada entri portal tidak dapat dibandingkan. Revisi otomatis dihentikan tanpa menyimpan.");
    }
    return {
      start_time: start.slice(0, 5),
      end_time: end.slice(0, 5),
      activity_text: activities[0].value,
      result_text: unique<HTMLTextAreaElement>(SELECTORS.result).value,
      obstacle_text: unique<HTMLTextAreaElement>(SELECTORS.obstacle).value,
      documentation_url: unique<HTMLInputElement>(SELECTORS.documentation).value,
      reflection_text: unique<HTMLTextAreaElement>(SELECTORS.reflection).value,
    };
  }

  function revisionMatches(snapshot: EntrySnapshot, current: Omit<EntrySnapshot, "date">) {
    return snapshot.start_time === current.start_time
      && snapshot.end_time === current.end_time
      && compareText(snapshot.activity_text) === compareText(current.activity_text)
      && compareText(snapshot.result_text) === compareText(current.result_text)
      && compareText(snapshot.obstacle_text) === compareText(current.obstacle_text)
      && snapshot.documentation_url.trim() === current.documentation_url.trim()
      && compareText(snapshot.reflection_text) === compareText(current.reflection_text);
  }

  export function parseMonthHeading(value: string): { year: number; month: number } | null {
    const match = value.trim().match(/^([\p{L}]+)\s+(\d{4})$/u);
    if (!match) return null;
    const month = MONTHS.findIndex((name) => name.toLocaleLowerCase("id-ID") === match[1].toLocaleLowerCase("id-ID"));
    return month < 0 ? null : { year: Number(match[2]), month };
  }

  async function navigateToDate(date: string, controls: Pick<Controls, "checkpoint">) {
    const target = parseDate(date);
    for (let tries = 0; tries < 120; tries += 1) {
      await requireContinue(controls, "Membuka tanggal");
      const heading = unique<HTMLElement>(SELECTORS.month);
      const current = parseMonthHeading(heading.textContent ?? "");
      if (!current) throw new Error("Bulan kalender tidak dapat dibaca.");
      const difference = (target.year - current.year) * 12 + target.month - current.month;
      if (difference === 0) {
        const grid = unique<HTMLElement>(SELECTORS.calendar);
        const dayButtons = Array.from(grid.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
          const match = (button.textContent ?? "").trim().match(/^(\d{1,2})(?:\s|$)/);
          return match?.[1] === String(target.day) && button.type === "button" && !button.disabled;
        });
        if (dayButtons.length !== 1) throw new Error("Tanggal tidak dapat dipilih secara unik pada kalender.");
        dayButtons[0].click();
        await waitFor(() => {
          const panel = document.querySelector<HTMLElement>(SELECTORS.panel);
          return !!panel && hasDate(panel.textContent ?? "", date);
        });
        return;
      }
      if (Math.abs(difference) > 120) throw new Error("Rentang navigasi kalender terlalu jauh untuk dipastikan.");
      const selector = difference < 0 ? SELECTORS.previousMonth : SELECTORS.nextMonth;
      const button = unique<HTMLButtonElement>(selector);
      if (button.type !== "button" || button.disabled) throw new Error("Kontrol navigasi kalender tidak tersedia.");
      const before = heading.textContent ?? "";
      button.click();
      await waitFor(() => (document.querySelector(SELECTORS.month)?.textContent ?? "") !== before);
    }
    throw new Error("Kalender tidak mencapai tanggal yang diminta.");
  }

  function fill(snapshot: EntrySnapshot) {
    setValue(unique<HTMLInputElement>(SELECTORS.start), snapshot.start_time);
    setValue(unique<HTMLInputElement>(SELECTORS.end), snapshot.end_time);
    setValue(unique<HTMLInputElement>(SELECTORS.activity), snapshot.activity_text);
    setValue(unique<HTMLTextAreaElement>(SELECTORS.result), snapshot.result_text);
    setValue(unique<HTMLTextAreaElement>(SELECTORS.obstacle), snapshot.obstacle_text);
    setValue(unique<HTMLInputElement>(SELECTORS.documentation), snapshot.documentation_url);
    const reflection = document.querySelectorAll<HTMLTextAreaElement>(SELECTORS.reflection);
    if (snapshot.reflection_text && reflection.length !== 1) throw new Error("Kolom refleksi Jumat tidak teridentifikasi tepat satu kali.");
    if (reflection.length === 1) setValue(reflection[0], snapshot.reflection_text);
  }

  function setValue<T extends HTMLInputElement | HTMLTextAreaElement>(element: T, value: string) {
    const type = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(type.prototype, "value")?.set;
    if (!setter) throw new Error("Kolom portal tidak mendukung pengisian yang aman.");
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function validateSnapshot(snapshot: EntrySnapshot) {
    const target = parseDate(snapshot.date);
    const start = parseTime(snapshot.start_time);
    const end = parseTime(snapshot.end_time);
    if (!snapshot.activity_text.trim() || !snapshot.result_text.trim() || !snapshot.documentation_url.trim()) {
      throw new Error("Uraian, hasil, dan dokumentasi wajib tersedia dalam snapshot yang disetujui.");
    }
    if (end <= start) throw new Error("Jam selesai harus lebih besar dari jam mulai.");
    try {
      const url = new URL(snapshot.documentation_url);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("Tautan dokumentasi harus menggunakan HTTPS.");
    }
    if (new Date(`${snapshot.date}T00:00:00`).getDay() === 5 && !snapshot.reflection_text.trim()) {
      throw new Error("Refleksi Jumat belum tersedia dalam snapshot yang disetujui.");
    }
    return target;
  }

  function parseDate(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("Tanggal snapshot tidak valid.");
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error("Tanggal snapshot tidak valid.");
    }
    return { year, month: month - 1, day };
  }

  function parseTime(value: string) {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error("Jam snapshot tidak menggunakan format 24 jam HH:MM.");
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function assertDate(text: string, isoDate: string) {
    if (!hasDate(text, isoDate)) throw new Error("Tanggal aktif pada panel portal tidak cocok dengan entri batch.");
  }

  function hasDate(text: string, isoDate: string) {
    const { year, month, day } = parseDate(isoDate);
    const expected = `${day} ${MONTHS[month]} ${year}`.toLocaleUpperCase("id-ID");
    return normalize(text).includes(normalize(expected));
  }

  function unique<T extends Element>(selector: string): T {
    const matches = document.querySelectorAll<T>(selector);
    if (matches.length !== 1) throw new Error(`Kontrol portal ${selector} tidak teridentifikasi tepat satu kali.`);
    if (!visible(matches[0])) throw new Error(`Kontrol portal ${selector} tidak terlihat.`);
    return matches[0];
  }

  function visible(element: Element) {
    return !element.hasAttribute("hidden") && element.getClientRects().length > 0;
  }

  function cancelOpenForm(snapshot: EntrySnapshot) {
    const panel = unique<HTMLElement>(SELECTORS.panel);
    const buttons = document.querySelectorAll<HTMLButtonElement>(SELECTORS.cancel);
    assertDate(panel.textContent ?? "", snapshot.date);
    if (buttons.length !== 1 || buttons[0].type !== "button" || buttons[0].textContent?.trim() !== "Batal"
      || !visible(buttons[0]) || !panel.contains(buttons[0])) throw new Error("Tombol Batal tidak dapat diidentifikasi secara aman.");
    buttons[0].click();
  }

  async function requireContinue(controls: Pick<Controls, "checkpoint">, step: string) {
    const directive = await controls.checkpoint(step);
    if (directive !== "continue") throw new HaltError(directive === "stop" ? "stopped" : "paused");
  }

  function normalize(value: string) {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
  }

  function compareText(value: string) {
    return value.normalize("NFKC").trim();
  }

  function occurrences(value: string, part: string) {
    if (!part) return 0;
    return value.split(part).length - 1;
  }

  function failed(error: string): Result {
    return { outcome: "failed", error };
  }

  function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
    if (predicate()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!predicate()) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Portal tidak menampilkan perubahan yang diharapkan. Periksa halaman dan coba lagi."));
      }, timeoutMs);
    });
  }
}
