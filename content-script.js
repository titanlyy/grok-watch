const GRPC_HEADERS = {
  "Content-Type": "application/grpc-web+proto",
  "X-Grpc-Web": "1",
  "Connect-Protocol-Version": "1"
};

const RESET_PATHS = [
  "/grok_api_v2.ConsumerUiSvc/GetRemainingResets",
  "/prod_mc_billing.ConsumerUiSvc/GetRemainingResets"
];

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
        requestKind: msg.requestKind || "DEFAULT",
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
        headers: GRPC_HEADERS,
        body: new Uint8Array(5)
      }
    );
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    return { ok: true, status: response.status, bytes };
  }

  if (msg.kind === "resets") {
    let last = { ok: false, status: 0 };
    for (const path of RESET_PATHS) {
      const response = await fetch("https://grok.com" + path, {
        method: "POST",
        credentials: "include",
        headers: GRPC_HEADERS,
        body: new Uint8Array(5)
      });
      const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      last = { ok: true, status: response.status, bytes };
      if (response.ok && bytes.length > 5) return last;
    }
    return last;
  }

  return { ok: false, error: "unknown request" };
}