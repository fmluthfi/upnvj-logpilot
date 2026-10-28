chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "LOGPILOT_INSPECT") return;
  const expectedPage = location.origin === "https://kampusberdampak.upnvj.ac.id"
    && location.pathname === "/logbook-harian";
  const panels = document.querySelectorAll("#lbhRail");
  const panelVisible = panels.length === 1 && panels[0].getClientRects().length > 0;
  sendResponse({ portalReady: expectedPage && panelVisible });
});
