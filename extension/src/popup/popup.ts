type WorkerResponse<T> = { ok: true; result: T } | { ok: false; error: string };
type PopupExtensionStatus = {
  backend: "connected" | "disconnected";
  paired: boolean;
  portal: "ready" | "not-open" | "reload" | "inspect";
  run: PopupRun | null;
  current_date?: string;
  step?: string;
};
type PopupRun = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  total_entries: number;
  completed_entries: number;
  counts: Record<string, number>;
};

const feedback = element<HTMLElement>("feedback");
const backendBadge = element<HTMLElement>("backend-status");
const portalBadge = element<HTMLElement>("portal-status");
const portalCopy = element<HTMLElement>("portal-copy");
const connectSection = element<HTMLElement>("connect-section");
const pairedSection = element<HTMLElement>("paired-section");
const pairingCode = element<HTMLInputElement>("pairing-code");
const connectButton = element<HTMLButtonElement>("connect-button");
const unpairButton = element<HTMLButtonElement>("unpair-button");
const refreshButton = element<HTMLButtonElement>("refresh-button");
const openPortalButton = element<HTMLButtonElement>("open-portal-button");
const runStatus = element<HTMLElement>("run-status");
const runRange = element<HTMLElement>("run-range");
const runProgress = element<HTMLProgressElement>("run-progress");
const runSummary = element<HTMLElement>("run-summary");
const runCurrent = element<HTMLElement>("run-current");
const startButton = element<HTMLButtonElement>("start-button");
const pauseButton = element<HTMLButtonElement>("pause-button");
const resumeButton = element<HTMLButtonElement>("resume-button");
const stopButton = element<HTMLButtonElement>("stop-button");
const retryButton = element<HTMLButtonElement>("retry-button");

connectButton.addEventListener("click", () => { void connect(); });
unpairButton.addEventListener("click", () => { void disconnect(); });
refreshButton.addEventListener("click", () => { void refresh(); });
openPortalButton.addEventListener("click", () => { void openPortal(); });
startButton.addEventListener("click", () => { void runAction({ type: "START_RUN" }, "Automation dimulai."); });
pauseButton.addEventListener("click", () => { void runAction({ type: "CONTROL_RUN", action: "pause" }, "Batch dijeda pada checkpoint aman."); });
resumeButton.addEventListener("click", () => { void runAction({ type: "CONTROL_RUN", action: "resume" }, "Batch dilanjutkan."); });
stopButton.addEventListener("click", () => { void runAction({ type: "CONTROL_RUN", action: "stop" }, "Batch dihentikan."); });
retryButton.addEventListener("click", () => { void runAction({ type: "RETRY_FAILED" }, "Entri yang aman dicoba ulang sudah disiapkan."); });
void refresh();
window.setInterval(() => { if (!document.hidden) void refresh(); }, 8000);

async function connect() {
  const code = pairingCode.value.trim();
  if (!code) {
    setFeedback("Masukkan kode pairing dari dashboard.", true);
    pairingCode.focus();
    return;
  }
  setBusy(true);
  try {
    await send({ type: "PAIR", code });
    pairingCode.value = "";
    setFeedback("Ekstensi berhasil dihubungkan.");
    await refresh();
  } catch (error) {
    setFeedback(message(error, "Ekstensi belum dapat dihubungkan."), true);
  } finally {
    setBusy(false);
  }
}

async function disconnect() {
  setBusy(true);
  try {
    await send({ type: "UNPAIR" });
    setFeedback("Ekstensi sudah diputuskan dari backend.");
    await refresh();
  } catch (error) {
    setFeedback(message(error, "Sambungan belum dapat diputuskan."), true);
  } finally {
    setBusy(false);
  }
}

async function refresh() {
  setBusy(true);
  try {
    const status = await send<PopupExtensionStatus>({ type: "GET_STATUS" });
    render(status);
  } catch (error) {
    render({ backend: "disconnected", paired: false, portal: "not-open", run: null });
    setFeedback(message(error, "Status ekstensi belum dapat dimuat."), true);
  } finally {
    setBusy(false);
  }
}

async function openPortal() {
  try {
    await send({ type: "OPEN_PORTAL" });
  } catch (error) {
    setFeedback(message(error, "Halaman portal belum dapat dibuka."), true);
  }
}

async function runAction(requestMessage: Record<string, unknown>, success: string) {
  setBusy(true);
  try {
    const result = await send<{ message?: string }>(requestMessage);
    setFeedback(result?.message || success);
    await refresh();
  } catch (error) {
    setFeedback(message(error, "Automation belum dapat dijalankan."), true);
    await refresh();
  } finally {
    setBusy(false);
  }
}

function render(status: PopupExtensionStatus) {
  backendBadge.textContent = status.backend === "connected" ? "Backend terhubung" : "Backend terputus";
  backendBadge.className = `status-badge ${status.backend === "connected" ? "is-good" : "is-warning"}`;
  connectSection.hidden = status.paired;
  pairedSection.hidden = !status.paired;
  connectButton.disabled = status.backend !== "connected";
  unpairButton.disabled = status.backend !== "connected";

  const portalLabels: Record<PopupExtensionStatus["portal"], [string, string]> = {
    ready: ["Panel terdeteksi", "Halaman logbook terbuka dan panel entri terdeteksi."],
    "not-open": ["Belum dibuka", "Buka halaman logbook Kampus Berdampak untuk memeriksa sesi."],
    reload: ["Muat ulang halaman", "Muat ulang tab logbook setelah memasang atau memperbarui ekstensi."],
    inspect: ["Periksa sesi", "Panel logbook belum terdeteksi. Pastikan kamu sudah masuk ke portal."],
  };
  const [label, copy] = portalLabels[status.portal];
  portalBadge.textContent = label;
  portalCopy.textContent = copy;
  renderRun(status);
}

function renderRun(status: PopupExtensionStatus) {
  const run = status.run;
  if (!run) {
    runStatus.textContent = "Belum ada batch";
    runStatus.className = "status-badge";
    runRange.textContent = "Siapkan batch dari dashboard Logpilot.";
    runProgress.value = 0;
    runSummary.textContent = "Belum ada entri untuk diproses.";
    runCurrent.hidden = true;
    for (const button of [startButton, pauseButton, resumeButton, stopButton, retryButton]) button.hidden = true;
    return;
  }

  const labels: Record<string, string> = {
    ready: "Siap", running: "Berjalan", paused: "Dijeda", stopping: "Menghentikan",
    stopped: "Dihentikan", completed: "Selesai", failed: "Perlu ditinjau",
  };
  runStatus.textContent = labels[run.status] ?? "Perlu diperiksa";
  runStatus.className = `status-badge ${["running", "completed"].includes(run.status) ? "is-good" : ["ready", "paused", "stopping"].includes(run.status) ? "is-warning" : ""}`;
  runRange.textContent = `${formatDate(run.start_date)} — ${formatDate(run.end_date)}`;
  const submitted = run.completed_entries;
  const updated = run.counts.updated ?? 0;
  const queued = run.counts.queued ?? 0;
  const processing = run.counts.processing ?? 0;
  const failed = run.counts.failed ?? 0;
  const skipped = run.counts.skipped ?? 0;
  const review = run.counts.verification_needed ?? 0;
  runProgress.value = run.total_entries ? Math.round((submitted / run.total_entries) * 100) : 0;
  runSummary.textContent = `${submitted} dari ${run.total_entries} tersimpan${updated ? ` · ${updated} diperbarui` : ""} · ${queued + processing} menunggu · ${failed} gagal · ${skipped} dilewati`;
  runCurrent.hidden = !(status.current_date || status.step || review);
  runCurrent.textContent = review
    ? "Ada upaya Simpan yang perlu diperiksa di portal sebelum batch dilanjutkan."
    : [status.current_date ? formatDate(status.current_date) : "", status.step || ""].filter(Boolean).join(" · ");

  const available = status.backend === "connected" && status.paired;
  startButton.hidden = !(available && status.portal === "ready" && run.status === "ready");
  pauseButton.hidden = !(available && run.status === "running");
  resumeButton.hidden = !(available && status.portal === "ready" && run.status === "paused" && review === 0);
  stopButton.hidden = !(available && ["ready", "running", "paused", "stopping"].includes(run.status));
  retryButton.hidden = !(available && status.portal === "ready" && (failed > 0 || run.counts.stopped > 0) && review === 0);
}

async function send<T = unknown>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResponse<T>;
  if (!response?.ok) throw new Error("error" in (response ?? {}) ? response.error : "Ekstensi tidak merespons.");
  return response.result;
}

function setBusy(busy: boolean) {
  connectButton.disabled = busy || backendBadge.textContent !== "Backend terhubung";
  unpairButton.disabled = busy;
  refreshButton.disabled = busy;
  openPortalButton.disabled = busy;
  for (const button of [startButton, pauseButton, resumeButton, stopButton, retryButton]) button.disabled = busy;
  connectButton.textContent = busy ? "Memproses…" : "Hubungkan ekstensi";
}

function setFeedback(text: string, isError = false) {
  feedback.textContent = text;
  feedback.dataset.error = String(isError);
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Popup element not found: ${id}`);
  return node as T;
}
