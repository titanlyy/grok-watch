// Runs on grok.com so usage calls use the page session and origin.
// No UI is injected — the popup is the only surface.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "PAGE_FETCH") return;
  pageFetch(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
  return true;
});

async function pageFetch(msg) {
  if (msg.kind === "subscriptions") {
    const response = await fetch("https://grok.com/rest/subscriptions", {
      credentials: "include"
    });
    return { ok: true, status: response.status, text: await response.text() };
  }

  if (msg.kind === "rate-limits") {
    const response = await fetch("https://grok.com/rest/rate-limits", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestKind: "DEFAULT",
        modelName: msg.model
      })
    });
    return { ok: true, status: response.status, text: await response.text() };
  }

  if (msg.kind === "credits") {
    const response = await fetch(
      "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/grpc-web+proto",
          "X-Grpc-Web": "1"
        },
        body: new Uint8Array(5)
      }
    );
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    return { ok: true, status: response.status, bytes };
  }

  return { ok: false, error: "unknown request" };
}
