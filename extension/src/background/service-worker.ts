importScripts("../lib/api-client.js");

const TOKEN_KEY = "extensionToken";
const WORKER_KEY = "runnerWorkerId";
const STATE_KEY = "runnerState";
const PORTAL_URL = "https://kampusberdampak.upnvj.ac.id/logbook-harian";
const PORTAL_ORIGIN = "https://kampusberdampak.upnvj.ac.id";
const PORTAL_PATTERN = `${PORTAL_URL}*`;
const ALARM_NAME = "logpilot-runner-checkpoint";

type PortalState = "ready" | "not-open" | "reload" | "inspect";
type Claim = {
  run_id: string;
  run_entry_id: string;
  entry_id: string;
  save_attempted: boolean;
  entry: LogpilotPortalAdapter.EntrySnapshot;
};
type RunnerState = { worker_id?: string; active?: Claim; tab_id?: number; step?: string; save_attempted?: boolean; auto_continue?: boolean };
type Run = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  runner: string;
  total_entries: number;
  completed_entries: number;
  counts: Record<string, number>;
  entries?: { id: string; status: string; save_attempted: boolean }[];
  last_error?: string | null;
};

const prepareStorage = () => chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let recoveryInFlight: Promise<void> | null = null;
let portalVerification: { key: string; promise: Promise<boolean> } | null = null;
chrome.runtime.onInstalled.addListener(() => {
  void prepareStorage().catch(() => {});
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  void prepareStorage().then(recoverRunner).catch(() => {});
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void recoverRunner().catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.status === "complete") void recoverRunner().catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => { void portalTabClosed(tabId).catch(() => {}); });
void prepareStorage().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const value = message as Record<string, unknown>;
  void handleMessage(value, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Permintaan ekstensi belum dapat diproses.",
    }));
  return true;
});

async function handleMessage(message: Record<string, unknown>, sender: { id?: string; url?: string; tab?: chrome.tabs.Tab }): Promise<unknown> {
  if (sender.tab) {
    if (sender.id !== chrome.runtime.id) throw new Error("Sumber tab portal tidak dikenali.");
    return handlePortalMessage(message, sender.tab);
  }
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    throw new Error("Sumber permintaan ekstensi tidak dikenali.");
  }
  if (message.type === "PAIR" && typeof message.code === "string") return pair(message.code);
  if (message.type === "UNPAIR") return unpair();
  if (message.type === "OPEN_PORTAL") {
    await chrome.tabs.create({ url: PORTAL_URL, active: true });
    return { opened: true };
  }
  if (message.type === "START_RUN") return startRun();
  if (message.type === "CONTROL_RUN" && ["pause", "resume", "stop"].includes(String(message.action))) {
    return controlRun(message.action as "pause" | "resume" | "stop");
  }
  if (message.type === "RETRY_FAILED") return retryFailed();
  if (message.type === "GET_STATUS") return getStatus();
  throw new Error("Permintaan ekstensi tidak dikenal.");
}

async function handlePortalMessage(message: Record<string, unknown>, tab: chrome.tabs.Tab) {
  if (!isPortalTab(tab) || typeof message.run_id !== "string" || typeof message.run_entry_id !== "string") {
    throw new Error("Pesan dari tab portal tidak cocok dengan job aktif.");
  }
  const token = await requireToken();
  const state = await readState();
  const claim = state.active;
  if (!claim || claim.run_id !== message.run_id || claim.run_entry_id !== message.run_entry_id || tab.id !== state.tab_id) {
    throw new Error("Entri tidak lagi diklaim oleh tab portal ini.");
  }
  if (message.type === "RUN_CHECKPOINT" && typeof message.step === "string") {
    state.step = message.step.slice(0, 80);
    await writeState(state);
    if (state.save_attempted) return { directive: "stop" };
    const response = await LogpilotApi.request<{ pause_requested: boolean; stop_requested: boolean }>(
      `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/heartbeat`,
      { method: "POST", body: JSON.stringify({ worker_id: await workerId() }) }, token,
    );
    const directive = response.stop_requested ? "stop" : response.pause_requested ? "pause" : "continue";
    if (directive !== "continue") await sendControlToTab(tab.id!, directive);
    return { directive };
  }
  if (message.type === "SAVE_ATTEMPT") {
    if (state.save_attempted) throw new Error("Upaya Simpan sudah tercatat. Periksa portal sebelum mencoba lagi.");
    await LogpilotApi.request(
      `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/save-attempted`,
      { method: "POST", body: JSON.stringify({ worker_id: await workerId() }) }, token,
    );
    state.save_attempted = true;
    claim.save_attempted = true;
    state.step = "Menyimpan entri";
    await writeState(state);
    return { allowed: true };
  }
  if (message.type === "SAVE_HEARTBEAT") {
    if (!state.save_attempted) throw new Error("Belum ada upaya Simpan yang perlu dijaga.");
    return LogpilotApi.request(
      `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/heartbeat`,
      { method: "POST", body: JSON.stringify({ worker_id: await workerId() }) }, token,
    );
  }
  if (message.type === "ENTRY_RESULT" && typeof message.outcome === "string") {
    return recordResult(state, message.outcome, typeof message.error === "string" ? message.error : undefined, token);
  }
  throw new Error("Pesan portal tidak dikenal.");
}

async function pair(code: string): Promise<{ paired: true }> {
  if (code.trim().length < 32) throw new Error("Masukkan kode pairing yang masih berlaku.");
  await prepareStorage();
  const result = await LogpilotApi.request<{ token: string }>("/extension/pair", {
    method: "POST", body: JSON.stringify({ code: code.trim() }),
  });
  if (typeof result.token !== "string" || result.token.length < 32) throw new Error("Respons pairing tidak valid. Buat kode baru dari dashboard.");
  await chrome.storage.local.set({ [TOKEN_KEY]: result.token });
  return { paired: true };
}

async function unpair(): Promise<{ paired: false }> {
  const state = await readState();
  if (state.active) throw new Error("Hentikan batch dan tunggu hasil entri aktif sebelum memutuskan sambungan.");
  const token = await readToken();
  if (!token) return { paired: false };
  const run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
  if (run && ["ready", "running", "paused", "stopping"].includes(run.status)) {
    throw new Error("Hentikan batch aktif sebelum memutuskan sambungan.");
  }
  await LogpilotApi.request("/extension/pair", { method: "DELETE" }, token);
  await chrome.storage.local.remove(TOKEN_KEY);
  return { paired: false };
}

async function getStatus() {
  const portal = await inspectPortal();
  const token = await readToken();
  try {
    await LogpilotApi.request("/health");
  } catch {
    return { backend: "disconnected", paired: !!token, portal: portal.status, run: null, current_date: portal.currentDate, step: (await readState()).step };
  }
  if (!token) return { backend: "connected", paired: false, portal: portal.status, run: null, current_date: portal.currentDate, step: (await readState()).step };
  try {
    await LogpilotApi.request("/extension/status", {}, token);
    await recoverRunner().catch(() => {});
    const run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
    const state = await readState();
    return { backend: "connected", paired: true, portal: portal.status, run, current_date: state.active?.entry.date ?? portal.currentDate, step: state.step };
  } catch (error) {
    if (error instanceof LogpilotApi.ApiError && error.status === 401) await chrome.storage.local.remove(TOKEN_KEY);
    throw error;
  }
}

async function inspectPortal(): Promise<{ status: PortalState; tab?: chrome.tabs.Tab; currentDate?: string }> {
  const tabs = await portalTabs();
  if (!tabs.length) return { status: "not-open" };
  const active = tabs.find((tab) => tab.active) ?? tabs[0];
  if (!active.id) return { status: "inspect" };
  try {
    const response = await chrome.tabs.sendMessage(active.id, { type: "LOGPILOT_INSPECT" }) as { portalReady?: boolean; currentDate?: string };
    return { status: response?.portalReady ? "ready" : "inspect", tab: active, currentDate: response?.currentDate };
  } catch {
    return { status: "reload", tab: active };
  }
}

async function startRun() {
  const token = await requireToken();
  const portal = await inspectPortal();
  if (portal.status !== "ready" || !portal.tab?.id) throw new Error("Buka dan muat ulang halaman logbook portal sebelum memulai.");
  const run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
  if (!run || run.runner !== "extension" || run.status !== "ready" || run.total_entries < 1) {
    throw new Error("Belum ada batch extension berstatus siap. Siapkan dan setujui entri dari dashboard.");
  }
  const state = await readState();
  if (state.active) throw new Error("Satu entri masih diproses oleh extension.");
  return claimAndDispatch(portal.tab.id, token);
}

async function claimAndDispatch(tabId: number, token?: string) {
  const auth = token ?? await requireToken();
  const worker = await workerId();
  const claim = await LogpilotApi.request<Claim | null>("/extension/jobs/claim", {
    method: "POST", body: JSON.stringify({ worker_id: worker }),
  }, auth);
  if (!claim) return { started: false, message: "Tidak ada entri siap diproses." };
  const state: RunnerState = { worker_id: worker, active: claim, tab_id: tabId, step: "Menyiapkan entri", save_attempted: claim.save_attempted };
  await writeState(state);
  if (claim.save_attempted) return { started: false, message: "Upaya Simpan sebelumnya belum terverifikasi. Periksa portal secara manual." };
  return dispatch(state);
}

async function dispatch(state: RunnerState) {
  if (!state.active || !state.tab_id) throw new Error("Klaim aktif tidak memiliki tab portal.");
  try {
    const response = await chrome.tabs.sendMessage(state.tab_id, { type: "RUN_ENTRY", claim: state.active }) as { accepted?: boolean };
    if (!response?.accepted) throw new Error("Tab portal belum menerima entri automation.");
    return { started: true, run_id: state.active.run_id, run_entry_id: state.active.run_entry_id };
  } catch (error) {
    if (state.save_attempted) await recordResult(state, "unknown", "Tab portal terputus setelah upaya Simpan.", await requireToken());
    else await recordResult(state, "failed", "Tab portal tidak dapat menerima entri. Buka ulang halaman portal sebelum mencoba lagi.", await requireToken());
    throw error;
  }
}

async function controlRun(action: "pause" | "resume" | "stop") {
  const token = await requireToken();
  const run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
  if (!run) throw new Error("Belum ada batch automation.");
  const updated = await LogpilotApi.request<Run>(`/extension/jobs/${encodeURIComponent(run.id)}/control`, {
    method: "POST", body: JSON.stringify({ action }),
  }, token);
  const state = await readState();
  if (state.active && state.tab_id) await sendControlToTab(state.tab_id, action === "resume" ? "continue" : action);
  if (action === "resume") {
    if (state.active && !state.save_attempted) return updated;
    const portal = await inspectPortal();
    if (portal.status !== "ready" || !portal.tab?.id) throw new Error("Batch dijeda lagi karena tab portal belum siap.");
    return claimAndDispatch(portal.tab.id, token);
  }
  return updated;
}

async function retryFailed() {
  const token = await requireToken();
  const run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
  if (!run) throw new Error("Belum ada batch automation.");
  await LogpilotApi.request(`/extension/jobs/${encodeURIComponent(run.id)}/retry-failed`, {
    method: "POST", body: JSON.stringify({ confirmed: true }),
  }, token);
  const portal = await inspectPortal();
  if (portal.status !== "ready" || !portal.tab?.id) throw new Error("Entri sudah disiapkan ulang. Buka halaman portal sebelum memulai.");
  return claimAndDispatch(portal.tab.id, token);
}

async function recordResult(state: RunnerState, outcome: string, error: string | undefined, token: string, portalVerified = false) {
  const claim = state.active;
  if (!claim) throw new Error("Tidak ada entri aktif untuk dilaporkan.");
  const allowed = ["success", "updated", "failed", "skipped", "unknown", "already_present", "paused", "stopped"];
  if (!allowed.includes(outcome)) throw new Error("Hasil entri tidak dikenali.");
  const currentWorker = await workerId();
  const report = (confirmed = portalVerified, reportedOutcome = outcome) => LogpilotApi.request<Run>(
    `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/report`,
    { method: "POST", body: JSON.stringify({
      worker_id: currentWorker,
      outcome: reportedOutcome,
      error: error?.slice(0, 1000),
      portal_verified: confirmed,
    }) }, token,
  );
  let completedOutcome = outcome;
  let run: Run;
  try {
    run = await report();
  } catch (reportError) {
    const latest = await LogpilotApi.request<Run>(`/extension/jobs/${encodeURIComponent(claim.run_id)}`, {}, token).catch(() => null);
    const recovered = latest && await confirmSavedResult(state, latest, token, outcome, error);
    if (!recovered) throw reportError;
    run = recovered;
    completedOutcome = outcome === "updated" ? "updated" : "success";
  }
  if (run.entries?.some((item) => item.id === claim.run_entry_id && item.status === "verification_needed" && item.save_attempted)) {
    const recovered = await confirmSavedResult(state, run, token, outcome, error);
    if (recovered) {
      run = recovered;
      completedOutcome = outcome === "updated" ? "updated" : "success";
    }
  }
  const needsPortalReview = run.entries?.some((item) => item.status === "verification_needed" && item.save_attempted);
  const autoContinue = needsPortalReview
    || (["success", "updated", "already_present", "failed", "skipped"].includes(completedOutcome) && run.status === "ready");
  await writeState({ worker_id: await workerId(), auto_continue: autoContinue });
  if (run.status === "ready" && autoContinue) {
    const portal = await inspectPortal();
    if (portal.status === "ready" && portal.tab?.id) return claimAndDispatch(portal.tab.id, token);
  }
  return run;
}

async function confirmSavedResult(state: RunnerState, run: Run, token: string, outcome: string, error?: string) {
  const claim = state.active;
  const item = claim && run.entries?.find((entry) => entry.id === claim.run_entry_id);
  if (!claim || !item || item.status !== "verification_needed" || !item.save_attempted) return null;
  const portal = await inspectPortal();
  const tabId = portal.status === "ready" ? portal.tab?.id : undefined;
  if (!tabId) return null;
  if (!await verifyPortalSaved(tabId, claim.entry)) return null;
  return LogpilotApi.request<Run>(
    `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/report`,
    { method: "POST", body: JSON.stringify({
      worker_id: await workerId(),
      outcome: outcome === "updated" ? "updated" : "success",
      error: error?.slice(0, 1000),
      portal_verified: true,
    }) }, token,
  );
}

async function recoverRunner() {
  if (recoveryInFlight) return recoveryInFlight;
  recoveryInFlight = recoverRunnerNow().finally(() => { recoveryInFlight = null; });
  return recoveryInFlight;
}

async function recoverRunnerNow() {
  const token = await readToken();
  if (!token) return;
  let state = await readState();
  let run: Run | null = null;
  if (!state.active) {
    run = await LogpilotApi.request<Run | null>("/extension/jobs/latest", {}, token);
    if (!run) return;
    if (run.status === "paused") {
      const uncertain = run.entries?.find((item) => item.status === "verification_needed" && item.save_attempted);
      if (uncertain && await recoverSavedEntry(run.id, uncertain.id, token)) return;
      return;
    }
    if (run.status !== "running" && !(run.status === "ready" && state.auto_continue)) return;
    state = { worker_id: await workerId() };
  }
  const worker = await workerId();
  try {
    const claim = await LogpilotApi.request<Claim | null>("/extension/jobs/claim", {
      method: "POST", body: JSON.stringify({ worker_id: worker }),
    }, token);
    if (!claim) {
      run = await LogpilotApi.request<Run>(`/extension/jobs/${encodeURIComponent(state.active?.run_id ?? run?.id ?? "")}`, {}, token).catch(() => null);
      const activeId = state.active?.run_entry_id;
      const uncertain = run?.entries?.find((item) => item.id === activeId && item.status === "verification_needed" && item.save_attempted);
      if (run && uncertain && await recoverSavedEntry(run.id, uncertain.id, token)) return;
      await writeState({ worker_id: worker, auto_continue: Boolean(uncertain) });
      return;
    }
    state.active = claim;
    state.save_attempted = claim.save_attempted;
    const tabs = await portalTabs();
    const tab = tabs.find((candidate) => candidate.id === state.tab_id) ?? tabs[0];
    if (!tab?.id) return;
    state.tab_id = tab.id;
    await writeState(state);
    if (claim.save_attempted) {
      if (await verifyPortalSaved(tab.id, claim.entry)) {
        await recordResult(state, "success", undefined, token, true);
      }
      return;
    }
    await LogpilotApi.request<{ pause_requested: boolean; stop_requested: boolean }>(
      `/extension/jobs/${encodeURIComponent(claim.run_id)}/entries/${encodeURIComponent(claim.run_entry_id)}/heartbeat`,
      { method: "POST", body: JSON.stringify({ worker_id: worker }) }, token,
    ).then(async (response) => {
      const directive = response.stop_requested ? "stop" : response.pause_requested ? "pause" : "continue";
      if (directive !== "continue") {
        await sendControlToTab(tab.id!, directive);
        return;
      }
      await dispatch(state);
    });
  } catch {
    return;
  }
}

async function recoverSavedEntry(runId: string, runEntryId: string, token: string) {
  const portal = await inspectPortal();
  const tabId = portal.status === "ready" ? portal.tab?.id : undefined;
  if (!tabId) return false;
  const claim = await LogpilotApi.request<Claim>(
    `/extension/jobs/${encodeURIComponent(runId)}/entries/${encodeURIComponent(runEntryId)}`, {}, token,
  );
  if (!await verifyPortalSaved(tabId, claim.entry)) return false;
  await recordResult({ worker_id: await workerId(), active: claim, tab_id: tabId, save_attempted: true }, "success", undefined, token, true);
  return true;
}

async function verifyPortalSaved(tabId: number, entry: Claim["entry"]) {
  const key = `${tabId}:${entry.date}`;
  if (portalVerification) return portalVerification.key === key ? portalVerification.promise : false;
  const promise = chrome.tabs.sendMessage(tabId, { type: "VERIFY_SAVED", entry })
    .then((result) => (result as { saved?: boolean })?.saved === true)
    .catch(() => false);
  portalVerification = { key, promise };
  void promise.then(() => { if (portalVerification?.promise === promise) portalVerification = null; });
  return promise;
}

async function portalTabClosed(tabId: number) {
  const state = await readState();
  if (!state.active || state.tab_id !== tabId) return;
  const token = await readToken();
  if (!token) return;
  await recordResult(
    state,
    state.save_attempted ? "unknown" : "failed",
    state.save_attempted ? "Tab ditutup setelah upaya Simpan. Periksa portal secara manual." : "Tab portal ditutup sebelum Simpan.",
    token,
  ).catch(() => {});
}

async function sendControlToTab(tabId: number, directive: "continue" | "pause" | "stop") {
  await chrome.tabs.sendMessage(tabId, { type: "RUN_CONTROL", directive }).catch(() => {});
}

async function portalTabs() {
  const tabs = await chrome.tabs.query({ url: PORTAL_PATTERN });
  return tabs.filter(isPortalTab);
}

function isPortalTab(tab: chrome.tabs.Tab) {
  if (!tab.url) return false;
  try {
    const url = new URL(tab.url);
    return url.origin === PORTAL_ORIGIN && url.pathname === "/logbook-harian";
  } catch {
    return false;
  }
}

async function readToken() {
  const values = await chrome.storage.local.get(TOKEN_KEY);
  return typeof values[TOKEN_KEY] === "string" ? values[TOKEN_KEY] as string : undefined;
}

async function requireToken() {
  const token = await readToken();
  if (!token) throw new Error("Hubungkan extension ke dashboard sebelum menjalankan automation.");
  return token;
}

async function workerId() {
  const values = await chrome.storage.local.get(WORKER_KEY);
  if (typeof values[WORKER_KEY] === "string") return values[WORKER_KEY] as string;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await chrome.storage.local.set({ [WORKER_KEY]: value });
  return value;
}

async function readState(): Promise<RunnerState> {
  const values = await chrome.storage.local.get(STATE_KEY);
  return values[STATE_KEY] && typeof values[STATE_KEY] === "object" ? values[STATE_KEY] as RunnerState : {};
}

async function writeState(state: RunnerState) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}
