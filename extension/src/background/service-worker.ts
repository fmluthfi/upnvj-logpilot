importScripts("../lib/api-client.js");

const TOKEN_KEY = "extensionToken";
const PORTAL_URL = "https://kampusberdampak.upnvj.ac.id/logbook-harian";
const PORTAL_ORIGIN = "https://kampusberdampak.upnvj.ac.id";

type ExtensionMessage =
  | { type: "GET_STATUS" }
  | { type: "PAIR"; code: string }
  | { type: "UNPAIR" }
  | { type: "OPEN_PORTAL" };

type BackgroundExtensionStatus = {
  backend: "connected" | "disconnected";
  paired: boolean;
  portal: "ready" | "not-open" | "reload" | "inspect";
};

const prepareStorage = () => chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
chrome.runtime.onInstalled.addListener(() => { void prepareStorage().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { void prepareStorage().catch(() => {}); });
void prepareStorage().catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return;
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Permintaan ekstensi belum dapat diproses.",
    }));
  return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  if (message.type === "PAIR") return pair(message.code);
  if (message.type === "UNPAIR") return unpair();
  if (message.type === "OPEN_PORTAL") {
    await chrome.tabs.create({ url: PORTAL_URL, active: true });
    return { opened: true };
  }
  return getStatus();
}

async function pair(code: string): Promise<{ paired: true }> {
  if (code.trim().length < 32) throw new Error("Masukkan kode pairing yang masih berlaku.");
  await prepareStorage();
  const result = await LogpilotApi.request<{ token: string }>("/extension/pair", {
    method: "POST",
    body: JSON.stringify({ code: code.trim() }),
  });
  if (typeof result.token !== "string" || result.token.length < 32) {
    throw new Error("Respons pairing tidak valid. Buat kode baru dari dashboard.");
  }
  await chrome.storage.local.set({ [TOKEN_KEY]: result.token });
  return { paired: true };
}

async function unpair(): Promise<{ paired: false }> {
  const token = await readToken();
  if (!token) return { paired: false };
  await LogpilotApi.request("/extension/pair", { method: "DELETE" }, token);
  await chrome.storage.local.remove(TOKEN_KEY);
  return { paired: false };
}

async function getStatus(): Promise<BackgroundExtensionStatus> {
  let backend: BackgroundExtensionStatus["backend"] = "disconnected";
  try {
    await LogpilotApi.request("/health");
    backend = "connected";
  } catch {
    return { backend, paired: false, portal: await inspectPortal() };
  }

  const token = await readToken();
  let paired = false;
  if (token) {
    try {
      await LogpilotApi.request("/extension/status", {}, token);
      paired = true;
    } catch (error) {
      if (error instanceof LogpilotApi.ApiError && error.status === 401) {
        await chrome.storage.local.remove(TOKEN_KEY);
      } else {
        return { backend, paired: false, portal: await inspectPortal() };
      }
    }
  }
  return { backend, paired, portal: await inspectPortal() };
}

async function inspectPortal(): Promise<BackgroundExtensionStatus["portal"]> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) return "not-open";
  let currentUrl: URL;
  try {
    currentUrl = new URL(tab.url);
  } catch {
    return "not-open";
  }
  if (currentUrl.origin !== PORTAL_ORIGIN || currentUrl.pathname !== "/logbook-harian") return "not-open";
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "LOGPILOT_INSPECT" }) as { portalReady?: boolean };
    return response?.portalReady ? "ready" : "inspect";
  } catch {
    return "reload";
  }
}

async function readToken(): Promise<string | undefined> {
  const values = await chrome.storage.local.get(TOKEN_KEY);
  const token = values[TOKEN_KEY];
  return typeof token === "string" ? token : undefined;
}

function isExtensionMessage(message: unknown): message is ExtensionMessage {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const value = message as Record<string, unknown>;
  return value.type === "GET_STATUS"
    || value.type === "UNPAIR"
    || value.type === "OPEN_PORTAL"
    || (value.type === "PAIR" && typeof value.code === "string");
}
