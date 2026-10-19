// Optional floating panel on grok.com. Off until the popup toggle is on.
// Same usage payload as the toolbar popup. Nothing on the page is read except
// the session the existing grok.com requests already use.

const PANEL_DEFAULTS = { enabled: false, collapsed: false, top: 110, left: null };
const HOST_ID = "grok-watch-panel";

let panelSettings = { ...PANEL_DEFAULTS };
let shadowRoot = null;
let lastPayload = null;
let pollTimer = 0;

boot();

async function boot() {
  const stored = await chrome.storage.local.get("panelSettings");
  panelSettings = { ...PANEL_DEFAULTS, ...(stored.panelSettings || {}) };
  syncPanel();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.panelSettings) {
      const next = { ...PANEL_DEFAULTS, ...(changes.panelSettings.newValue || {}) };
      const changed = JSON.stringify(next) !== JSON.stringify(panelSettings);
      panelSettings = next;
      if (changed) syncPanel();
    }
    if (changes.usage && panelSettings.enabled) {
      const next = changes.usage.newValue;
      if (next && next.ok) paint(next);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && panelSettings.enabled) refreshPanel(false);
  });

  setInterval(() => {
    if (panelSettings.enabled && !document.getElementById(HOST_ID)) mountPanel();
  }, 2000);
}

function syncPanel() {
  if (!panelSettings.enabled) {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
    shadowRoot = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
    return;
  }
  mountPanel();
  refreshPanel(false);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (panelSettings.enabled && document.visibilityState === "visible") refreshPanel(false);
    }, 90000);
  }
}

function mountPanel() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;overflow:visible;";
    (document.documentElement || document.body).appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = "<style>" + PANEL_CSS + "</style><div id=\"root\"></div>";
    const root = shadowRoot.getElementById("root");
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("click", onPanelClick);
  } else if (!shadowRoot) {
    shadowRoot = host.shadowRoot;
  }
  placePanel();
  paint(lastPayload);
}

function placePanel() {
  const root = shadowRoot && shadowRoot.getElementById("root");
  if (!root) return;
  const width = panelSettings.collapsed ? 136 : panelWidth();
  let left = panelSettings.left;
  const top = Number.isFinite(panelSettings.top) ? panelSettings.top : 110;
  if (left == null) left = Math.max(8, window.innerWidth - width - 28);
  const box = clampBox(top, left, width, 36);
  root.style.top = box.top + "px";
  root.style.left = box.left + "px";
  if (panelSettings.collapsed) {
    root.style.width = "";
    root.style.height = "";
    return;
  }
  root.style.width = width + "px";
  root.style.height = panelSettings.height ? panelSettings.height + "px" : "";
}

function panelWidth() {
  const saved = Number(panelSettings.width);
  if (Number.isFinite(saved) && saved >= 260) return saved;
  return 300;
}

function clampSize(value, min, max) {
  return Math.min(Math.max(min, value), Math.max(min, max));
}

function clampBox(top, left, width, height) {
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  return {
    top: Math.min(maxTop, Math.max(8, top)),
    left: Math.min(maxLeft, Math.max(8, left))
  };
}

function savePanel(patch) {
  const wasEnabled = panelSettings.enabled;
  panelSettings = { ...panelSettings, ...patch };
  chrome.storage.local.set({ panelSettings });
  if (!panelSettings.enabled || !wasEnabled) {
    syncPanel();
    return;
  }
  paint(lastPayload);
}

async function refreshPanel(force) {
  if (!panelSettings.enabled) return;
  if (!force) {
    const stored = await chrome.storage.local.get("usage");
    if (stored.usage && stored.usage.ok && Date.now() - stored.usage.fetchedAt < 60000) {
      paint(stored.usage);
      return;
    }
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: "FETCH_USAGE" });
    paint(res);
  } catch {
    paint({ ok: false, code: "unreachable" });
  }
}

function onPanelClick(event) {
  const act = event.target.closest("[data-act]");
  if (!act) return;
  event.preventDefault();
  event.stopPropagation();
  const name = act.dataset.act;
  if (name === "collapse") savePanel({ collapsed: !panelSettings.collapsed });
  if (name === "hide") savePanel({ enabled: false });
  if (name === "refresh") refreshPanel(true);
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  if (event.target.closest("[data-act='resize']")) {
    startResize(event);
    return;
  }
  if (event.target.closest("[data-act]")) return;
  if (!event.target.closest("[data-drag]")) return;
  const root = shadowRoot.getElementById("root");
  const rect = root.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const originLeft = rect.left;
  const originTop = rect.top;
  let moved = false;
  root.setPointerCapture(event.pointerId);

  const move = (ev) => {
    if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) moved = true;
    const box = clampBox(originTop + ev.clientY - startY, originLeft + ev.clientX - startX, rect.width, 36);
    root.style.top = box.top + "px";
    root.style.left = box.left + "px";
    panelSettings.top = box.top;
    panelSettings.left = box.left;
  };
  const up = () => {
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", up);
    if (!moved && panelSettings.collapsed) {
      savePanel({ collapsed: false, top: panelSettings.top, left: panelSettings.left });
      return;
    }
    savePanel({ top: panelSettings.top, left: panelSettings.left });
  };
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
}

function startResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const root = shadowRoot.getElementById("root");
  const rect = root.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startW = rect.width;
  const startH = rect.height;
  root.classList.add("is-resized");
  root.setPointerCapture(event.pointerId);

  const move = (ev) => {
    const width = clampSize(startW + ev.clientX - startX, 260, window.innerWidth - rect.left - 8);
    const height = clampSize(startH + ev.clientY - startY, 160, window.innerHeight - rect.top - 8);
    root.style.width = width + "px";
    root.style.height = height + "px";
    panelSettings.width = Math.round(width);
    panelSettings.height = Math.round(height);
  };
  const up = () => {
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", up);
    savePanel({ width: panelSettings.width, height: panelSettings.height });
  };
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
}

function paint(payload) {
  lastPayload = payload;
  if (!shadowRoot || !panelSettings.enabled) return;
  const root = shadowRoot.getElementById("root");
  if (!root) return;
  root.className = panelSettings.collapsed ? "chip" : "card";
  root.innerHTML = panelSettings.collapsed ? collapsedHtml(payload) : expandedHtml(payload);
  placePanel();
  tickPanel();
}

function collapsedHtml(payload) {
  return `
    <button class="chip-btn" type="button" data-drag title="Drag to move. Click to expand.">
      <span class="dot"></span>
      <span class="chip-kicker">GROK</span>
      <strong>${esc(headline(payload))}</strong>
    </button>`;
}

function expandedHtml(payload) {
  return `
    <div class="head" data-drag>
      <div class="title"><span class="dot"></span>GROK WATCH</div>
      <div class="tools">
        <button type="button" data-act="collapse" title="Collapse">−</button>
        <button type="button" data-act="refresh" title="Refresh">↻</button>
        <button type="button" data-act="hide" title="Hide panel">×</button>
      </div>
    </div>
    <div class="body">${bodyHtml(payload)}</div>
    <div class="grip" data-act="resize" title="Drag to resize"></div>`;
}

function bodyHtml(payload) {
  if (!payload) return `<div class="muted">Reading grok.com…</div>`;
  if (!payload.ok) {
    if (payload.code === "unauthorized") return `<div class="muted">Sign in to grok.com, then refresh.</div>`;
    return `<div class="muted">Could not read usage.</div>`;
  }
  const bits = [];
  bits.push(`<div class="plan">${esc(payload.plan || "Grok")}${payload.stale ? " · held" : ""}</div>`);
  bits.push(botHtml(payload));
  if (payload.kind === "paid" && payload.paid) {
    const used = Number(payload.paid.used) || 0;
    const left = Number.isFinite(Number(payload.paid.remaining)) ? Number(payload.paid.remaining) : Math.max(0, 100 - used);
    bits.push(meter("Weekly left", amount(left) + "%", used, footRemain(payload.paid.resetAt)));
    for (const product of payload.paid.products || []) {
      bits.push(line(product.label, amount(product.percent) + "%", product.percent));
    }
  }
  const buckets = payload.buckets || [];
  const hero = payload.kind === "paid" ? null : (buckets.find((row) => /fast/i.test(row.label)) || buckets[0]);
  if (hero) {
    const total = Number(hero.total) || 0;
    const remaining = Number(hero.remaining) || 0;
    const used = total ? ((total - remaining) / total) * 100 : 0;
    bits.push(meter(hero.label, String(remaining) + " left", used, windowText(hero.windowSeconds) || remaining + " / " + total));
  }
  for (const bucket of buckets) {
    if (hero && bucket.key === hero.key) continue;
    const total = Number(bucket.total) || 0;
    const remaining = Number(bucket.remaining) || 0;
    const used = total ? ((total - remaining) / total) * 100 : 0;
    const extra = windowText(bucket.windowSeconds);
    bits.push(line(bucket.label, remaining + "/" + total + (extra ? " · " + extra : ""), used));
  }
  if (payload.resets && payload.resets.availableCount) {
    const count = payload.resets.availableCount;
    bits.push(line(count + " reset" + (count === 1 ? "" : "s"), "banked", 0));
  }
  if (bits.length === 1) bits.push(`<div class="muted">No quota in this response.</div>`);
  return bits.join("");
}

function botHtml(payload) {
  const bot = payload && payload.bot;
  if (bot && Number.isFinite(Number(bot.used))) {
    const used = Number(bot.used);
    const left = Number.isFinite(Number(bot.remaining)) ? Number(bot.remaining) : Math.max(0, 100 - used);
    const label = bot.plan ? "Grok Bot · " + bot.plan : "Grok Bot";
    return meter(label, amount(left) + "% left", used, footRemain(bot.resetAt));
  }
  if (payload && payload.botState === "signed-out") {
    return `<div class="muted">Open cursor.com/dashboard, leave that tab open, then refresh.</div>`;
  }
  return "";
}

function meter(label, value, usedPct, detail) {
  const width = Math.max(0, Math.min(100, Number(usedPct) || 0));
  return `
    <div class="meter">
      <div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>
      <div class="track"><div class="fill" style="width:${width}%"></div></div>
      <div class="detail">${detail}</div>
    </div>`;
}

function line(label, value, usedPct) {
  const width = Math.max(0, Math.min(100, Number(usedPct) || 0));
  return `
    <div class="line">
      <div class="row">
        <span class="name" title="${esc(label)}">${esc(label)}</span>
        <span class="val">${esc(value)}</span>
      </div>
      <div class="track thin"><div class="fill" style="width:${width}%"></div></div>
    </div>`;
}

function footRemain(ms) {
  if (!ms) return "reset unknown";
  return `<span data-reset="${esc(ms)}">${esc(remain(ms))}</span>`;
}

function tickPanel() {
  if (!shadowRoot) return;
  shadowRoot.querySelectorAll("[data-reset]").forEach((node) => {
    node.textContent = remain(Number(node.dataset.reset));
  });
}

setInterval(tickPanel, 1000);

function headline(payload) {
  if (!payload || !payload.ok) return "—";
  if (payload.kind === "paid" && payload.paid) return amount(payload.paid.remaining) + "%";
  const bucket = (payload.buckets || []).find((row) => /fast/i.test(row.label)) || (payload.buckets || [])[0];
  if (!bucket) return "—";
  return String(bucket.remaining);
}

function amount(n) {
  if (!Number.isFinite(Number(n))) return "—";
  const rounded = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function remain(ms) {
  const secs = Math.floor((ms - Date.now()) / 1000);
  if (secs <= 0) return "resetting";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

function windowText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds % 86400 === 0) return seconds / 86400 + "d";
  if (seconds % 3600 === 0) return seconds / 3600 + "h";
  if (seconds >= 3600) return Math.round(seconds / 3600) + "h";
  return Math.round(seconds / 60) + "m";
}

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

const PANEL_CSS = `
  :host { all: initial; }
  #root { position: fixed; z-index: 2147483646; font-family: "Segoe UI", system-ui, sans-serif; color: #e9fff8; }
  .card, .chip-btn {
    background: rgba(6, 10, 20, 0.94);
    border: 1px solid rgba(61, 255, 242, 0.45);
    box-shadow: 0 0 0 1px rgba(255, 43, 214, 0.18), 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 24px rgba(61, 255, 242, 0.12);
  }
  .chip-btn { clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px); }
  .card {
    width: 300px;
    min-width: 260px;
    min-height: 160px;
    max-height: calc(100vh - 16px);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  .head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 10px 9px 12px; cursor: grab; user-select: none;
    border-bottom: 1px solid rgba(61, 255, 242, 0.18);
  }
  .head:active { cursor: grabbing; }
  .title {
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 14px; letter-spacing: 0.12em; font-weight: 800;
    display: flex; align-items: center; gap: 6px;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #3dfff2; box-shadow: 0 0 8px #3dfff2; display: inline-block; }
  .tools { display: flex; gap: 4px; }
  .tools button, .chip-btn {
    font: inherit; color: #e9fff8; cursor: pointer;
  }
  .tools button {
    width: 28px; height: 28px; border-radius: 6px;
    border: 1px solid rgba(61, 255, 242, 0.35);
    background: rgba(61, 255, 242, 0.08);
    font-size: 16px;
    line-height: 1;
  }
  .tools button:hover { border-color: #ff2bd6; color: #fff; }
  .body { padding: 10px 12px 18px; overflow: auto; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .plan, .muted, .detail, .row span {
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 13px; color: #c5d4e4; line-height: 1.35;
  }
  .plan { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { padding: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 10px; align-items: center; min-width: 0; }
  .row .name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .row .val, .row strong { flex: 0 0 auto; white-space: nowrap; }
  .row strong { font-family: ui-monospace, "SF Mono", monospace; font-size: 18px; color: #fff; text-shadow: 0 0 10px rgba(61, 255, 242, 0.45); }
  .grip {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    z-index: 2;
    background:
      linear-gradient(135deg, transparent 0 45%, rgba(61, 255, 242, 0.95) 45% 58%, transparent 58% 68%, rgba(61, 255, 242, 0.95) 68% 80%, transparent 80%);
  }
  .track { height: 6px; border-radius: 99px; background: rgba(255,255,255,0.06); overflow: hidden; margin-top: 5px; }
  .track.thin { height: 4px; }
  .fill { height: 100%; background: linear-gradient(90deg, #ff2bd6, #3dfff2 60%, #d6ff4a); box-shadow: 0 0 8px rgba(61, 255, 242, 0.7); }
  .chip-btn {
    width: 136px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 10px 12px; cursor: grab; text-align: left;
  }
  .chip-btn strong { font-family: ui-monospace, "SF Mono", monospace; font-size: 22px; color: #fff; }
  .chip-kicker { font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; letter-spacing: 0.14em; color: #ff2bd6; }
`;
