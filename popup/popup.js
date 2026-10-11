const CACHE_MS = 60_000;

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
  if (!ts) return "Never";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatReset(ms) {
  if (!ms) return "Reset time unavailable";
  const when = new Date(ms);
  if (Number.isNaN(when.getTime())) return "Reset time unavailable";
  if (when.getTime() <= Date.now()) return "Resets shortly";
  return "Resets " + when.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusChip(remainingRatio) {
  if (remainingRatio <= 0) return `<span class="chip low"><span class="chip-dot"></span>Exhausted</span>`;
  if (remainingRatio <= 0.25) return `<span class="chip low"><span class="chip-dot"></span>Low</span>`;
  return `<span class="chip ok"><span class="chip-dot"></span>Good</span>`;
}

function formatAmount(n) {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function renderSkeleton() {
  document.getElementById("coreGrid").innerHTML = `
    <div class="metric-card">
      <div class="metric-label"><span class="skeleton" style="width:40%;height:10px;display:block"></span></div>
      <div class="skeleton" style="width:72px;height:36px"></div>
      <div class="metric-progress-area">
        <div class="progress-track"><div class="progress-fill" style="width:40%"></div></div>
      </div>
    </div>`;
  document.getElementById("divider").hidden = true;
  document.getElementById("sourcesSection").innerHTML = "";
}

function animateBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".progress-fill[data-width]").forEach((bar) => {
      bar.style.width = bar.dataset.width + "%";
    });
  });
}

function renderPaid(paid) {
  const used = Number(paid.used) || 0;
  const remaining = Number.isFinite(paid.remaining) ? paid.remaining : Math.max(0, 100 - used);
  const ratio = remaining / 100;
  const fillClass = remaining <= 0 ? "empty" : ratio <= 0.25 ? "low" : "";
  const accent = ratio > 0.25 ? "accent" : "";
  const grid = document.getElementById("coreGrid");
  grid.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Weekly pool ${statusChip(ratio)}</div>
      <div class="metric-value-row">
        <div class="metric-value ${accent}">${esc(formatAmount(remaining))}</div>
        <div class="metric-suffix">% left</div>
      </div>
      <div class="metric-progress-area">
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" data-width="${Math.max(0, Math.min(100, used))}"></div>
        </div>
        <div class="progress-footer">
          <span>${esc(formatAmount(used))}% used</span>
          <span>${esc(formatReset(paid.resetAt))}</span>
        </div>
      </div>
    </div>`;

  const products = Array.isArray(paid.products) ? paid.products : [];
  const divider = document.getElementById("divider");
  const section = document.getElementById("sourcesSection");
  divider.hidden = false;
  if (products.length === 0) {
    section.innerHTML = `<div class="empty-note">No product usage yet this week.</div>`;
  } else {
    section.innerHTML = products.map((product) => {
      const pct = Math.round(Number(product.percent) || 0);
      return `
        <div class="source-row">
          <div class="source-name">${esc(product.label || "Other")}</div>
          <div class="source-nums">of weekly pool</div>
          <span class="chip share">${esc(pct)}%</span>
        </div>`;
    }).join("");
  }
  animateBars();
}

function renderFree(buckets) {
  const grid = document.getElementById("coreGrid");
  const divider = document.getElementById("divider");
  const section = document.getElementById("sourcesSection");
  divider.hidden = true;
  section.innerHTML = "";

  if (!buckets || buckets.length === 0) {
    grid.innerHTML = `<div class="empty-note">Signed in on the free plan, but no query quota was reported.</div>`;
    return;
  }

  grid.innerHTML = buckets.map((bucket) => {
    const remaining = Number(bucket.remaining) || 0;
    const total = Number(bucket.total) || 0;
    const ratio = total ? remaining / total : 0;
    const usedPct = total ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 0;
    const fillClass = remaining <= 0 ? "empty" : ratio <= 0.25 ? "low" : "";
    const accent = ratio > 0.25 ? "accent" : "";
    const note = remaining <= 0 ? "All used" : ratio <= 0.25 ? "Running low" : "Healthy headroom";
    return `
      <div class="metric-card">
        <div class="metric-label">${esc(bucket.label)} queries ${statusChip(ratio)}</div>
        <div class="metric-value-row">
          <div class="metric-value ${accent}">${esc(remaining)}</div>
          <div class="metric-suffix">left</div>
        </div>
        <div class="metric-progress-area">
          <div class="progress-track">
            <div class="progress-fill ${fillClass}" data-width="${usedPct}"></div>
          </div>
          <div class="progress-footer">
            <span>${esc(note)}</span>
            <span>${esc(remaining)} / ${esc(total)}</span>
          </div>
        </div>
      </div>`;
  }).join("");
  animateBars();
}

function showError(code) {
  const banner = document.getElementById("errorBanner");
  const text = document.getElementById("errorText");
  const open = document.getElementById("openGrok");
  banner.hidden = false;
  open.hidden = false;
  if (code === "unauthorized") {
    text.textContent = "Sign in to grok.com in this browser, then refresh.";
  } else if (code === "unavailable") {
    text.textContent = "Grok answered, but the usage details could not be read. Try again in a moment.";
    open.hidden = true;
  } else {
    text.textContent = "Couldn’t reach grok.com. Open it while signed in, then refresh.";
  }
  document.getElementById("fetchedAt").textContent = "Not updated";
  document.getElementById("coreGrid").innerHTML = "";
  document.getElementById("divider").hidden = true;
  document.getElementById("sourcesSection").innerHTML = "";
}

function renderAll(payload) {
  document.getElementById("errorBanner").hidden = true;
  document.getElementById("staleNote").hidden = !payload.stale;
  const plan = payload.plan ? payload.plan + " · " : "";
  document.getElementById("fetchedAt").textContent = plan + "Updated " + timeAgo(payload.fetchedAt);
  if (payload.kind === "paid" && payload.paid) renderPaid(payload.paid);
  else renderFree(payload.buckets || []);
}

async function loadData(forceRefresh = false) {
  const btn = document.getElementById("refreshBtn");
  btn.classList.add("spinning");

  if (!forceRefresh) {
    const stored = await chrome.storage.local.get("usage");
    if (stored.usage && stored.usage.ok) {
      renderAll(stored.usage);
      if (Date.now() - stored.usage.fetchedAt < CACHE_MS) {
        btn.classList.remove("spinning");
        return;
      }
    }
  }

  chrome.runtime.sendMessage({ type: "FETCH_USAGE" }, (res) => {
    btn.classList.remove("spinning");
    if (chrome.runtime.lastError || !res || !res.ok) {
      const code = res && res.code ? res.code : "unreachable";
      showError(code);
      return;
    }
    renderAll(res);
  });
}

renderSkeleton();
loadData();

document.getElementById("refreshBtn").addEventListener("click", () => loadData(true));
document.getElementById("openGrok").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://grok.com" });
});

setInterval(() => {
  chrome.storage.local.get("usage", (stored) => {
    if (stored.usage && stored.usage.ok) {
      const plan = stored.usage.plan ? stored.usage.plan + " · " : "";
      document.getElementById("fetchedAt").textContent = plan + "Updated " + timeAgo(stored.usage.fetchedAt);
    }
  });
}, 15_000);
