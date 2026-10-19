chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "PAGE_FETCH" || msg.kind !== "bot") return;
  fetch("https://cursor.com/api/dashboard/get-sand-usage-status", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: "{}"
  })
    .then(async (response) => {
      sendResponse({ ok: true, status: response.status, text: await response.text() });
    })
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
  return true;
});
