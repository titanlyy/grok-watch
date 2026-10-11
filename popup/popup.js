const CACHE_MS = 60_000;
const COLORS = ["#3dfff2", "#ff2bd6", "#d6ff4a", "#8b7bff", "#ffb020", "#5aa8ff", "#ff6b8a"];

function esc(value) {
  const amp = String.fromCharCode(38);
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === amp) return amp + "amp;";
    if (ch === "<") return amp + "lt;";
    if (ch === ">") return amp + "gt;";
    if (ch === '"') return amp + "quot;";
    return amp + "#39;";
  });
}

function timeAgo(ts) {
  if (!ts) return "never";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return secs + "s ago";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "m ago";
  return Math.floor(mins / 60) + "h ago";
}

function formatWhen(ms) {
  if (!ms) return "";
  const when = new Date(ms);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatRemain(ms) {
  if (!ms) return "";
  const secs = Math.floor((ms - Date.now()) / 1000);
  if (secs <= 0) return "resetting";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m " + String(s).padStart(2, "0") + "s";
}

function formatWindow(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds % 86400 === 0) return seconds / 86400 + "d window";
  if (seconds % 3600 === 0) return seconds / 3600 + "h window";
  if (seconds >= 3600) return Math.round(seconds / 3600) + "h window";
  if (seconds >= 60) return Math.round(seconds / 60) + "m window";
  return seconds + "s window";
}

function amount(n) {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function chip(ratio) {
  if (ratio <= 0) return '<span class="chip low">empty</span>';
  if (ratio <= 0.25) return '<span class="chip low">low</span>';
  return '<span class="chip ok">stable</span>';
}

function tickClocks() {
  document.querySelectorAll("[data-reset]").forEach((node) => {
    node.textContent = formatRemain(Number(node.dataset.reset));
  });
}

function paintBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-width]").forEach((node) => {
      node.style.width = node.dataset.width + "%";
    });
  });
}

function heroCard(label, value, suffix, usedPct, leftText, rightText, ratio) {
  const hot = ratio <= 0.25 ? "hot" : "";
  const fill = ratio <= 0 ? "empty" : ratio <= 0.25 ? "low" : "";
  return `
    <div class="hero">
      <div class="hero-top"><span>${esc(label)}</span>${chip(ratio)}</div>
      <div class="hero-value">
        <div class="num ${hot}">${esc(value)}</div>
        <div class="suffix">${esc(suffix)}</div>
      </div>
      <div class="track"><div class="fill ${fill}" data-width="${Math.max(0, Math.min(100, usedPct))}"></div></div>
      <div class="foot"><span>${leftText}</span><span>${rightText}</span></div>
    </div>`;
}

function renderPaid(paid) {
  const used = Number(paid.used) || 0;
  const remaining = Number.isFinite(Number(paid.remaining)) ? Number(paid.remaining) : Math.max(0, 100 - used);
  const ratio = remaining / 100;
  const reset = paid.resetAt
    ? `<span data-reset="${esc(paid.resetAt)}">${esc(formatRemain(paid.resetAt))}</span>`
    : "reset unknown";
  const start = formatWhen(paid.periodStart);
  const end = formatWhen(paid.resetAt);
  const windowText = start && end ? esc(start) + " → " + esc(end) : esc(amount(used)) + "% used";
  document.getElementById("hero").innerHTML = heroCard(
    "Weekly pool",
    amount(remaining),
    "% left",
    used,
    windowText,
    reset,
    ratio
  );
  renderProducts(paid.products || []);
}

function renderProducts(products) {
  const wrap = document.getElementById("spectrumWrap");
  const spectrum = document.getElementById("spectrum");
  const legend = document.getElementById("legend");
  const rows = document.getElementById("productRows");
  if (!products.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  spectrum.innerHTML = products.map((product, i) => {
    const width = Math.max(0, Math.min(100, Number(product.percent) || 0));
    return `<div class="seg" data-width="${width}" style="background:${COLORS[i % COLORS.length]}"></div>`;
  }).join("");
  legend.innerHTML = products.map((product, i) => `
    <span class="swatch"><i style="background:${COLORS[i % COLORS.length]};color:${COLORS[i % COLORS.length]}"></i>${esc(product.label)}</span>
  `).join("");
  rows.innerHTML = products.map((product, i) => `
    <div class="row" style="animation-delay:${i * 40}ms">
      <div class="row-name">${esc(product.label)}</div>
      <div class="row-meta"><span class="chip share">${esc(amount(product.percent))}%</span></div>
      <div class="track mini"><div class="fill" data-width="${Math.max(0, Math.min(100, Number(product.percent) || 0))}" style="background:${COLORS[i % COLORS.length]}"></div></div>
    </div>
  `).join("");
}

function renderBuckets(buckets, skipKey) {
  const wrap = document.getElementById("windowsWrap");
  const rows = document.getElementById("windows");
  const visible = (buckets || []).filter((bucket) => bucket.key !== skipKey);
  if (!visible.length) {
    wrap.hidden = true;
    rows.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  rows.innerHTML = visible.map((bucket, i) => {
    const remaining = Number(bucket.remaining) || 0;
    const total = Number(bucket.total) || 0;
    const ratio = total ? remaining / total : 0;
    const used = total ? ((total - remaining) / total) * 100 : 0;
    const fill = ratio <= 0 ? "empty" : ratio <= 0.25 ? "low" : "";
    const windowText = formatWindow(bucket.windowSeconds);
    return `
      <div class="row" style="animation-delay:${i * 35}ms">
        <div class="row-name">${esc(bucket.label)}</div>
        <div class="row-meta">${esc(remaining)} / ${esc(total)}${windowText ? " · " + esc(windowText) : ""}</div>
        <div class="track mini"><div class="fill ${fill}" data-width="${Math.max(0, Math.min(100, used))}"></div></div>
      </div>`;
  }).join("");
}

function renderResets(resets) {
  const wrap = document.getElementById("resetsWrap");
  const rows = document.getElementById("resets");
  if (!resets || !resets.availableCount) {
    wrap.hidden = true;
    rows.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  const count = resets.availableCount;
  const exp = resets.expiresAt
    ? `soonest expires ${esc(formatWhen(resets.expiresAt))} · <span data-reset="${esc(resets.expiresAt)}">${esc(formatRemain(resets.expiresAt))}</span>`
    : "ready to use on grok.com";
  rows.innerHTML = `
    <div class="row">
      <div class="row-name">${esc(count)} reset${count === 1 ? "" : "s"} banked</div>
      <div class="row-meta"><span class="chip ok">ready</span></div>
      <div class="foot" style="grid-column:1/-1">${exp}</div>
    </div>`;
}

function renderFree(buckets) {
  document.getElementById("spectrumWrap").hidden = true;
  const list = buckets || [];
  if (!list.length) {
    document.getElementById("hero").innerHTML = `<div class="empty-note">Signed in, but grok.com did not report a query window.</div>`;
    renderBuckets([], null);
    return;
  }
  const hero = list.find((bucket) => /fast/i.test(bucket.label)) || list[0];
  const remaining = Number(hero.remaining) || 0;
  const total = Number(hero.total) || 0;
  const ratio = total ? remaining / total : 0;
  const used = total ? ((total - remaining) / total) * 100 : 0;
  const windowText = formatWindow(hero.windowSeconds) || "query window";
  document.getElementById("hero").innerHTML = heroCard(
    hero.label,
    String(remaining),
    "left",
    used,
    esc(remaining) + " / " + esc(total),
    esc(windowText),
    ratio
  );
  renderBuckets(list, hero.key);
}

function showError(code) {
  const banner = document.getElementById("errorBanner");
  const open = document.getElementById("openGrok");
  banner.hidden = false;
  open.hidden = false;
  const text = document.getElementById("errorText");
  if (code === "unauthorized") text.textContent = "Sign in to grok.com in this browser, then refresh.";
  else if (code === "unavailable") {
    text.textContent = "Grok answered, but the usage frame could not be read.";
    open.hidden = true;
  } else text.textContent = "No uplink. Open grok.com while signed in, then refresh.";
  document.getElementById("fetchedAt").textContent = "link down";
  document.getElementById("kickerText").textContent = "UPLINK LOST";
  document.getElementById("hero").innerHTML = "";
  document.getElementById("spectrumWrap").hidden = true;
  document.getElementById("windowsWrap").hidden = true;
  document.getElementById("resetsWrap").hidden = true;
}

function renderAll(payload) {
  document.getElementById("errorBanner").hidden = true;
  document.getElementById("staleNote").hidden = !payload.stale;
  const plan = payload.plan ? payload.plan + " · " : "";
  document.getElementById("fetchedAt").textContent = plan + "updated " + timeAgo(payload.fetchedAt);
  document.getElementById("kickerText").textContent = payload.stale ? "HOLDING LAST LOCK" : "SIGNAL LOCKED";
  if (payload.kind === "paid" && payload.paid) {
    renderPaid(payload.paid);
    renderBuckets(payload.buckets || [], null);
  } else {
    renderFree(payload.buckets || []);
  }
  renderResets(payload.resets);
  paintBars();
  tickClocks();
}

function setLive(on) {
  document.body.classList.toggle("is-live", on);
  document.getElementById("refreshBtn").classList.toggle("spinning", on);
  if (on) document.getElementById("kickerText").textContent = "READING GROK";
}

async function loadData(forceRefresh = false) {
  setLive(true);
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get("usage");
    if (stored.usage && stored.usage.ok) {
      renderAll(stored.usage);
      if (Date.now() - stored.usage.fetchedAt < CACHE_MS) {
        setLive(false);
        return;
      }
    }
  }
  chrome.runtime.sendMessage({ type: "FETCH_USAGE" }, (res) => {
    setLive(false);
    if (chrome.runtime.lastError || !res || !res.ok) {
      showError(res && res.code ? res.code : "unreachable");
      return;
    }
    renderAll(res);
  });
}

loadData();
loadPanelToggle();
document.getElementById("refreshBtn").addEventListener("click", () => loadData(true));
document.getElementById("openGrok").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://grok.com" });
});
document.getElementById("panelToggle").addEventListener("change", async (event) => {
  const stored = await chrome.storage.local.get("panelSettings");
  const next = {
    collapsed: false,
    top: 110,
    left: null,
    ...(stored.panelSettings || {}),
    enabled: event.target.checked
  };
  await chrome.storage.local.set({ panelSettings: next });
});
setInterval(() => {
  tickClocks();
  chrome.storage.local.get("usage", (stored) => {
    if (!stored.usage || !stored.usage.ok || document.body.classList.contains("is-live")) return;
    const plan = stored.usage.plan ? stored.usage.plan + " · " : "";
    document.getElementById("fetchedAt").textContent = plan + "updated " + timeAgo(stored.usage.fetchedAt);
  });
}, 1000);

async function loadPanelToggle() {
  const stored = await chrome.storage.local.get("panelSettings");
  document.getElementById("panelToggle").checked = !!(stored.panelSettings && stored.panelSettings.enabled);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.panelSettings) return;
    const next = changes.panelSettings.newValue;
    document.getElementById("panelToggle").checked = !!(next && next.enabled);
  });
}
