type ClaimedEntry = {
  run_id: string;
  run_entry_id: string;
  entry_id: string;
  entry: LogpilotPortalAdapter.EntrySnapshot;
};

let activeRunEntryId: string | null = null;
let pendingDirective: "continue" | "pause" | "stop" = "continue";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const value = message as Record<string, unknown>;
  if (value.type === "LOGPILOT_INSPECT") {
    const pageMatches = location.origin === "https://kampusberdampak.upnvj.ac.id" && location.pathname === "/logbook-harian";
    const panels = document.querySelectorAll("#lbhRail");
    const ready = pageMatches && panels.length === 1 && panels[0].getClientRects().length > 0;
    sendResponse({ portalReady: ready, automationReady: ready });
    return;
  }
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
  if (value.type === "RUN_CONTROL" && (value.directive === "continue" || value.directive === "pause" || value.directive === "stop")) {
    pendingDirective = value.directive;
    sendResponse({ accepted: true });
    return;
  }
  if (value.type === "VERIFY_SAVED" && value.entry && typeof value.entry === "object") {
    if (activeRunEntryId) {
      sendResponse({ saved: false });
      return;
    }
    void LogpilotPortalAdapter.verifySaved(value.entry as LogpilotPortalAdapter.EntrySnapshot)
      .then((saved) => sendResponse({ saved }))
      .catch(() => sendResponse({ saved: false }));
    return true;
  }
  if (value.type !== "RUN_ENTRY" || !isClaim(value.claim)) return;
  const claim = value.claim;
  if (activeRunEntryId) {
    sendResponse({ accepted: activeRunEntryId === claim.run_entry_id });
    return;
  }
  activeRunEntryId = claim.run_entry_id;
  pendingDirective = "continue";
  sendResponse({ accepted: true });
  void runClaim(claim);
});

async function runClaim(claim: ClaimedEntry) {
  try {
    const result = await LogpilotPortalAdapter.run(claim.entry, {
      checkpoint: async (step) => {
        if (pendingDirective !== "continue") return pendingDirective;
        const response = await sendToWorker<{ directive: "continue" | "pause" | "stop" }>({
          type: "RUN_CHECKPOINT",
          run_id: claim.run_id,
          run_entry_id: claim.run_entry_id,
          step,
        });
        pendingDirective = response.directive;
        return response.directive;
      },
      markSaveAttempt: async () => {
        const response = await sendToWorker<{ allowed: boolean }>({
          type: "SAVE_ATTEMPT",
          run_id: claim.run_id,
          run_entry_id: claim.run_entry_id,
        });
        if (!response.allowed) throw new Error("Backend belum mengizinkan tombol Simpan.");
      },
    });
    activeRunEntryId = null;
    await sendToWorker({
      type: "ENTRY_RESULT",
      run_id: claim.run_id,
      run_entry_id: claim.run_entry_id,
      outcome: result.outcome,
      error: result.error,
    });
  } catch (error) {
    activeRunEntryId = null;
    await sendToWorker({
      type: "ENTRY_RESULT",
      run_id: claim.run_id,
      run_entry_id: claim.run_entry_id,
      outcome: "unknown",
      error: error instanceof Error ? error.message : "Hasil halaman tidak dapat dipastikan. Periksa portal secara manual.",
    }).catch(() => {});
  } finally {
    activeRunEntryId = null;
    pendingDirective = "continue";
  }
}

async function sendToWorker<T = unknown>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as { ok?: boolean; result?: T; error?: string };
  if (!response?.ok) throw new Error(response?.error || "Service worker tidak merespons.");
  return response.result as T;
}

function isClaim(value: unknown): value is ClaimedEntry {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  return typeof claim.run_id === "string"
    && typeof claim.run_entry_id === "string"
    && typeof claim.entry_id === "string"
    && !!claim.entry && typeof claim.entry === "object";
}
