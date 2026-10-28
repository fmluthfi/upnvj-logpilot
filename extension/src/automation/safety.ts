namespace LogpilotSafety {
  export const DAILY_SAVE_SELECTOR = "#lbhRail #lbhBtnSave";
  const ALLOWED_ACTIONS = new Set(["save-daily-entry", "update-daily-entry"]);
  const FINALIZATION = /selesaikan|finalisasi|finalize|finalise|complete/i;

  export function assertDailySaveTarget(
    action: string,
    selector: string,
    panel: Element | null,
    button: Element | null,
    matchingControls: number,
  ): void {
    if (!ALLOWED_ACTIONS.has(action) || selector !== DAILY_SAVE_SELECTOR) throw new Error("Aksi portal tidak diizinkan.");
    if (!panel || panel.id !== "lbhRail" || !button || button.id !== "lbhBtnSave" || !panel.contains(button)) {
      throw new Error("Konteks tombol Simpan harian tidak cocok.");
    }
    if (matchingControls !== 1 || panel.querySelectorAll("#lbhBtnSave").length !== 1) {
      throw new Error("Tombol Simpan harian harus teridentifikasi tepat satu kali.");
    }
    const revisionForm = (panel.textContent ?? "").includes("Revisi Entri");
    if ((action === "update-daily-entry") !== revisionForm) throw new Error("Mode form tidak cocok dengan aksi Simpan harian.");

    const control = button as HTMLButtonElement;
    const labelledBy = (control.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? id);
    const labels = [
      control.textContent,
      control.getAttribute("aria-label"),
      ...Array.from(control.labels ?? [], (label) => label.textContent),
      ...labelledBy,
      control.form?.getAttribute("action"),
      control.form?.getAttribute("target"),
      ...Array.from(control.attributes, (attribute) => attribute.value),
    ];
    if (control.tagName !== "BUTTON" || control.type !== "button" || control.disabled || control.hidden
      || control.getClientRects().length === 0
      || control.textContent?.trim() !== "Simpan"
      || labels.some((label) => FINALIZATION.test(label ?? ""))) {
      throw new Error("Kontrol portal bukan tombol Simpan harian yang aman.");
    }
  }

  export function clickDailySave(
    action: string,
    selector: string,
    panel: Element | null,
    button: Element | null,
    matchingControls: number,
  ): void {
    assertDailySaveTarget(action, selector, panel, button, matchingControls);
    (button as HTMLButtonElement).click();
  }
}
