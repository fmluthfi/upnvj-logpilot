type WorkerResponse<T> = { ok: true; result: T } | { ok: false; error: string };
type PopupExtensionStatus = {
  backend: "connected" | "disconnected";
  paired: boolean;
  portal: "ready" | "not-open" | "reload" | "inspect";
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

connectButton.addEventListener("click", () => { void connect(); });
unpairButton.addEventListener("click", () => { void disconnect(); });
refreshButton.addEventListener("click", () => { void refresh(); });
openPortalButton.addEventListener("click", () => { void openPortal(); });
void refresh();

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
    render({ backend: "disconnected", paired: false, portal: "not-open" });
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
  connectButton.textContent = busy ? "Memproses…" : "Hubungkan ekstensi";
}

function setFeedback(text: string, isError = false) {
  feedback.textContent = text;
  feedback.dataset.error = String(isError);
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Popup element not found: ${id}`);
  return node as T;
}
