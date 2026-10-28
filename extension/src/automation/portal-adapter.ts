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

  export type Outcome = "success" | "already_present" | "failed" | "skipped" | "unknown" | "paused" | "stopped";
  export type Checkpoint = (step: string) => Promise<"continue" | "pause" | "stop">;
  export type Controls = { checkpoint: Checkpoint; markSaveAttempt: () => Promise<void> };
  export type Result = { outcome: Outcome; error?: string };
  class HaltError extends Error {
    constructor(readonly outcome: "paused" | "stopped") { super("Automation dihentikan pada checkpoint aman."); }
  }

  const PORTAL_ORIGIN = "https://kampusberdampak.upnvj.ac.id";
  const PORTAL_PATH = "/logbook-harian";
  const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const SELECTORS = {
    panel: "#lbhRail",
    month: "#lbhMonthLabel",
    calendar: "#lbhCalGrid",
    previousMonth: "#lbhCalPrev",
    nextMonth: "#lbhCalNext",
    add: "#lbhBtnAdd",
    start: "#fMulai",
    end: "#fSelesai",
    activity: "#fUraianField input",
    result: "#fHasil",
    obstacle: "#fKendala",
    documentation: "#fDok",
    reflection: "#fRefleksi",
    cancel: "#lbhBtnCancel",
  } as const;

  export async function run(snapshot: EntrySnapshot, controls: Controls): Promise<Result> {
    let createdForm = false;
    try {
      validateSnapshot(snapshot);
      if (location.origin !== PORTAL_ORIGIN || location.pathname !== PORTAL_PATH) return failed("Buka halaman logbook portal sebelum menjalankan batch.");
      await requireContinue(controls, "Memeriksa sesi");

      await navigateToDate(snapshot.date, controls);
      const panel = unique<HTMLElement>(SELECTORS.panel);
      assertDate(panel.textContent ?? "", snapshot.date);
      await requireContinue(controls, "Memeriksa entri");

      if (!(panel.textContent ?? "").toLocaleLowerCase("id-ID").includes("belum ada entri")) {
        if (normalize(panel.textContent ?? "").includes(normalize(snapshot.activity_text))) {
          return { outcome: "already_present" };
        }
        return { outcome: "skipped", error: "Tanggal ini sudah memiliki entri berbeda. Tidak ada perubahan yang dibuat." };
      }

      if (document.querySelector("#fMulai")) throw new Error("Form portal sudah terbuka. Tutup form tersebut sebelum menjalankan entri.");
      const add = unique<HTMLButtonElement>(SELECTORS.add);
      if (add.textContent?.trim() !== "Tambah Entri" || add.type !== "button" || add.disabled || !panel.contains(add)) {
        throw new Error("Tombol Tambah Entri tidak cocok dengan halaman yang diperiksa.");
      }
      add.click();
      createdForm = true;
      await waitFor(() => document.querySelector(SELECTORS.start) !== null);
      assertDate(unique<HTMLElement>(SELECTORS.panel).textContent ?? "", snapshot.date);

      await requireContinue(controls, "Mengisi entri");
      fill(snapshot);

      await requireContinue(controls, "Memeriksa sebelum Simpan");
      const panelBeforeSave = unique<HTMLElement>(SELECTORS.panel);
      const saveBeforeMarker = unique<HTMLElement>(LogpilotSafety.DAILY_SAVE_SELECTOR);
      assertDate(panelBeforeSave.textContent ?? "", snapshot.date);
      LogpilotSafety.assertDailySaveTarget("save-daily-entry", LogpilotSafety.DAILY_SAVE_SELECTOR, panelBeforeSave, saveBeforeMarker, document.querySelectorAll(LogpilotSafety.DAILY_SAVE_SELECTOR).length);
      await controls.markSaveAttempt();
      const currentPanel = unique<HTMLElement>(SELECTORS.panel);
      const currentSave = unique<HTMLElement>(LogpilotSafety.DAILY_SAVE_SELECTOR);
      assertDate(currentPanel.textContent ?? "", snapshot.date);
      LogpilotSafety.clickDailySave("save-daily-entry", LogpilotSafety.DAILY_SAVE_SELECTOR, currentPanel, currentSave, document.querySelectorAll(LogpilotSafety.DAILY_SAVE_SELECTOR).length);
      createdForm = false;
      await waitFor(() => {
        const latestPanel = document.querySelector<HTMLElement>(SELECTORS.panel);
        return !document.querySelector(SELECTORS.start)
          && !!latestPanel
          && normalize(latestPanel.textContent ?? "").includes(normalize(snapshot.activity_text));
      });
      const latestPanel = unique<HTMLElement>(SELECTORS.panel);
      assertDate(latestPanel.textContent ?? "", snapshot.date);
      if (occurrences(normalize(latestPanel.textContent ?? ""), normalize(snapshot.activity_text)) !== 1) {
        return { outcome: "unknown", error: "Form tertutup, tetapi entri tidak dapat diverifikasi. Periksa portal secara manual." };
      }
      return { outcome: "success" };
    } catch (error) {
      if (createdForm) cancelCreatedForm();
      if (error instanceof HaltError) return { outcome: error.outcome };
      return { outcome: "unknown", error: error instanceof Error ? error.message : "Hasil portal tidak dapat dipastikan. Periksa tanggal ini secara manual." };
    }
  }

  export function parseMonthHeading(value: string): { year: number; month: number } | null {
    const match = value.trim().match(/^([\p{L}]+)\s+(\d{4})$/u);
    if (!match) return null;
    const month = MONTHS.findIndex((name) => name.toLocaleLowerCase("id-ID") === match[1].toLocaleLowerCase("id-ID"));
    return month < 0 ? null : { year: Number(match[2]), month };
  }

  async function navigateToDate(date: string, controls: Controls) {
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

  function cancelCreatedForm() {
    const buttons = document.querySelectorAll<HTMLButtonElement>(SELECTORS.cancel);
    if (buttons.length === 1 && buttons[0].type === "button" && buttons[0].textContent?.trim() === "Batal"
      && unique<HTMLElement>(SELECTORS.panel).contains(buttons[0])) buttons[0].click();
  }

  async function requireContinue(controls: Controls, step: string) {
    const directive = await controls.checkpoint(step);
    if (directive !== "continue") throw new HaltError(directive === "stop" ? "stopped" : "paused");
  }

  function normalize(value: string) {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
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
