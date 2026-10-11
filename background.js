// Fetches Grok usage with the signed-in grok.com session and caches it locally.
// Paid weekly pool + free Fast quota follow the same endpoints as
// Joshua Wang's Grok Usage Watch (MIT). See NOTICE.md.

const MODELS = [{ key: "grok-3", label: "Fast" }];

const F_USAGE_PERCENT = 1;
const F_PERIOD_END = 5;
const F_PRODUCT_USAGE = 7;

const PRODUCT_LABELS = {
  2: "Grok Build",
  4: "Chat",
  5: "Imagine",
  6: "Voice"
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "FETCH_USAGE") return;
  collectUsage()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, code: "error", error: String(err && err.message ? err.message : err) }));
  return true;
});

async function collectUsage() {
  const stored = await chrome.storage.local.get("usage");
  const previous = stored.usage && stored.usage.ok ? stored.usage : null;

  let tier;
  try {
    tier = await fetchActiveSubscription();
  } catch (err) {
    if (err && err.code === "unauthorized") {
      return { ok: false, code: "unauthorized" };
    }
    if (previous) return { ...previous, stale: true };
    return { ok: false, code: "unreachable" };
  }

  if (tier === null) {
    if (previous) return { ...previous, stale: true };
    return { ok: false, code: "unreachable" };
  }

  if (tier) {
    try {
      const paid = await checkPaidUsage();
      if (!paid) {
        if (previous && previous.kind === "paid") return { ...previous, stale: true };
        return { ok: false, code: "unavailable" };
      }
      const payload = {
        ok: true,
        kind: "paid",
        plan: humanizePlan(tier),
        paid,
        buckets: [],
        fetchedAt: Date.now(),
        stale: false
      };
      await chrome.storage.local.set({ usage: payload });
      return payload;
    } catch (err) {
      if (err && err.code === "unauthorized") return { ok: false, code: "unauthorized" };
      if (previous && previous.kind === "paid") return { ...previous, stale: true };
      return { ok: false, code: "unreachable" };
    }
  }

  try {
    const buckets = await checkRateLimits();
    const payload = {
      ok: true,
      kind: "free",
      plan: "Free",
      paid: null,
      buckets,
      fetchedAt: Date.now(),
      stale: false
    };
    await chrome.storage.local.set({ usage: payload });
    return payload;
  } catch (err) {
    if (err && err.code === "unauthorized") return { ok: false, code: "unauthorized" };
    if (previous && previous.kind === "free") return { ...previous, stale: true };
    return { ok: false, code: "unreachable" };
  }
}

async function fetchActiveSubscription() {
  const res = await request("subscriptions");
  if (res.status === 401 || res.status === 403) {
    const error = new Error("unauthorized");
    error.code = "unauthorized";
    throw error;
  }
  if (!res.okTransport || res.status < 200 || res.status >= 300) return null;
  const data = parseJson(res.text);
  if (!data) return null;
  const list = Array.isArray(data.subscriptions) ? data.subscriptions : [];
  return list.find((entry) => entry && entry.status === "SUBSCRIPTION_STATUS_ACTIVE") || false;
}

async function checkRateLimits() {
  const buckets = [];
  let answered = false;

  for (const model of MODELS) {
    const res = await request("rate-limits", { model: model.key });
    if (res.status === 401 || res.status === 403) {
      const error = new Error("unauthorized");
      error.code = "unauthorized";
      throw error;
    }
    if (!res.okTransport || res.status < 200 || res.status >= 300) continue;
    answered = true;
    const data = parseJson(res.text);
    if (!data) continue;

    const total = Number(data.totalQueries);
    const remaining = Number(data.remainingQueries);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) continue;

    const percent = Math.round((remaining / total) * 100);
    buckets.push({
      key: model.key,
      label: model.label,
      remaining,
      total,
      percent,
      used: 100 - percent
    });
  }

  if (!answered && buckets.length === 0) {
    const error = new Error("unreachable");
    error.code = "unreachable";
    throw error;
  }

  return buckets;
}

async function checkPaidUsage() {
  const res = await request("credits");
  if (res.status === 401 || res.status === 403) {
    const error = new Error("unauthorized");
    error.code = "unauthorized";
    throw error;
  }
  if (!res.okTransport || res.status < 200 || res.status >= 300 || !res.bytes) {
    const error = new Error("unreachable");
    error.code = "unreachable";
    throw error;
  }
  return readPaidUsage(res.bytes);
}

function readPaidUsage(bytes) {
  const frame = firstDataFrame(bytes);
  if (!frame) return null;
  const response = decodeProto(frame);
  const configBytes = first(response, 1);
  if (!configBytes) return null;

  const config = decodeProto(configBytes);

  let resetAt = null;
  const periodEnd = first(config, F_PERIOD_END);
  if (periodEnd) {
    const seconds = first(decodeProto(periodEnd), 1);
    if (Number.isFinite(seconds) && seconds > 0) resetAt = seconds * 1000;
  }

  const hasProductField = (config[F_PRODUCT_USAGE] || []).length > 0;
  const products = (config[F_PRODUCT_USAGE] || [])
    .map((entry) => {
      const parsed = decodeProto(entry);
      const id = first(parsed, 1);
      const percent = first(parsed, 2);
      return {
        id,
        label: PRODUCT_LABELS[id] || "Other",
        percent: Number.isFinite(percent) ? percent : 0
      };
    })
    .filter((product) => product.percent > 0)
    .sort((a, b) => b.percent - a.percent);

  const usedRaw = first(config, F_USAGE_PERCENT);
  if (!Number.isFinite(usedRaw) && resetAt === null && !hasProductField) return null;
  const used = Number.isFinite(usedRaw) ? Math.max(0, Math.min(100, usedRaw)) : 0;

  return {
    used: Math.round(used * 10) / 10,
    remaining: Math.round((100 - used) * 10) / 10,
    resetAt,
    products
  };
}

async function request(kind, extra) {
  const tabbed = await requestViaTab(kind, extra);
  if (tabbed) return normalize(tabbed);
  return normalize(await requestDirect(kind, extra));
}

async function requestViaTab(kind, extra) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: "https://grok.com/*" });
  } catch {
    return null;
  }
  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: "PAGE_FETCH",
        kind,
        ...(extra || {})
      });
      if (res && res.ok) return res;
    } catch {
      // Tab has no content script yet, or it navigated away.
    }
  }
  return null;
}

async function requestDirect(kind, extra) {
  try {
    if (kind === "subscriptions") {
      const response = await fetch("https://grok.com/rest/subscriptions", { credentials: "include" });
      return { ok: true, status: response.status, text: await response.text() };
    }
    if (kind === "rate-limits") {
      const response = await fetch("https://grok.com/rest/rate-limits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKind: "DEFAULT", modelName: extra.model })
      });
      return { ok: true, status: response.status, text: await response.text() };
    }
    if (kind === "credits") {
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
      return {
        ok: true,
        status: response.status,
        bytes: Array.from(new Uint8Array(await response.arrayBuffer()))
      };
    }
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message ? err.message : err) };
  }
  return { ok: false, status: 0, error: "unknown request" };
}

function normalize(res) {
  const status = res && Number.isFinite(res.status) ? res.status : 0;
  return {
    okTransport: Boolean(res && res.ok),
    status,
    text: res && typeof res.text === "string" ? res.text : "",
    bytes: res && Array.isArray(res.bytes) ? Uint8Array.from(res.bytes) : null
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeProto(bytes) {
  const out = {};
  let at = 0;
  const viewBytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);

  const varint = () => {
    let value = 0;
    let scale = 1;
    while (at < viewBytes.length) {
      const byte = viewBytes[at++];
      value += (byte & 0x7f) * scale;
      if (!(byte & 0x80)) break;
      scale *= 128;
    }
    return value;
  };

  while (at < viewBytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (!field) break;

    if (wire === 0) {
      (out[field] || (out[field] = [])).push(varint());
    } else if (wire === 2) {
      const len = varint();
      if (at + len > viewBytes.length) break;
      (out[field] || (out[field] = [])).push(viewBytes.subarray(at, at + len));
      at += len;
    } else if (wire === 5) {
      (out[field] || (out[field] = [])).push(
        new DataView(viewBytes.buffer, viewBytes.byteOffset + at, 4).getFloat32(0, true)
      );
      at += 4;
    } else if (wire === 1) {
      at += 8;
    } else {
      break;
    }
  }

  return out;
}

function first(fields, number) {
  const values = fields[number];
  return values && values.length ? values[0] : undefined;
}

function firstDataFrame(bytes) {
  let at = 0;
  while (at + 5 <= bytes.length) {
    const flag = bytes[at];
    const view = new DataView(bytes.buffer, bytes.byteOffset + at + 1, 4);
    const len = view.getUint32(0, false);
    if (at + 5 + len > bytes.length) break;
    const body = bytes.subarray(at + 5, at + 5 + len);
    at += 5 + len;
    if ((flag & 0x80) === 0) return body;
  }
  return null;
}

function humanizePlan(sub) {
  if (!sub || typeof sub !== "object") return "Paid plan";
  const keys = ["tier", "plan", "planName", "displayName", "productName", "name", "sku", "productId"];
  for (const key of keys) {
    const value = sub[key];
    if (typeof value === "string" && value.trim()) return prettyToken(value);
  }
  return "Paid plan";
}

function prettyToken(raw) {
  const cleaned = String(raw)
    .replace(/^SUBSCRIPTION_STATUS_/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const known = {
    supergrok: "SuperGrok",
    "supergrok heavy": "SuperGrok Heavy",
    "supergrok lite": "SuperGrok Lite",
    "super grok": "SuperGrok",
    "super grok heavy": "SuperGrok Heavy",
    premium: "Premium",
    "premium plus": "Premium+",
    premiumplus: "Premium+",
    heavy: "SuperGrok Heavy",
    lite: "SuperGrok Lite"
  };
  const lower = cleaned.toLowerCase();
  if (known[lower]) return known[lower];
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}
