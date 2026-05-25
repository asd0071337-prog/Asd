// Asd Finance — single-file vanilla JS app.
// Data is persisted in localStorage. No data leaves the browser except an optional
// stock-quote fetch to a public CSV endpoint when the user clicks "Refresh prices".

const KEY = "asd-finance:v1";
const API_KEY_STORAGE = "asd-finance:anthropic-key";
const MODEL_STORAGE = "asd-finance:ai-model";

const DEFAULT_CATEGORIES = [
  "Housing", "Groceries", "Dining", "Transport", "Utilities", "Health",
  "Entertainment", "Shopping", "Travel", "Subscriptions", "Other"
];

const DEFAULT_BUDGETS = {
  Housing: 250000, Groceries: 100000, Dining: 40000, Transport: 30000,
  Utilities: 25000, Entertainment: 20000, Subscriptions: 10000
};

const fmt = new Intl.NumberFormat("is-IS", { style: "currency", currency: "ISK", maximumFractionDigits: 0 });
const fmt0 = fmt;
const pct = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const STATE = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return {
    transactions: [],
    budgets: { ...DEFAULT_BUDGETS },
    categories: [...DEFAULT_CATEGORIES],
    goals: [],
    holdings: [],
    settings: { currency: "ISK", fxUsdIsk: 140 },
  };
}
function fxRate() {
  const v = parseFloat(STATE.settings?.fxUsdIsk);
  return isFinite(v) && v > 0 ? v : 140;
}
function save() { localStorage.setItem(KEY, JSON.stringify(STATE)); }

// ---------------- Tabs ----------------
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b === btn));
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === `tab-${tab}`));
  // Re-render charts on tab show (canvas needs visible parent)
  if (tab === "dashboard") renderDashboard();
  if (tab === "invest") renderInvest();
});

// ---------------- Transactions ----------------
const txForm = document.getElementById("tx-form");
const txDate = document.getElementById("tx-date");
const txDesc = document.getElementById("tx-desc");
const txAmt = document.getElementById("tx-amt");
const txType = document.getElementById("tx-type");
const txCat = document.getElementById("tx-cat");
const txBody = document.getElementById("tx-body");
const txEmpty = document.getElementById("tx-empty");
const txFilter = document.getElementById("tx-filter-month");

txDate.value = new Date().toISOString().slice(0, 10);

let editingTxId = null;
const txSubmitBtn = txForm.querySelector("button[type=submit]");
const txCancelBtn = document.getElementById("tx-cancel");
const txSearch = document.getElementById("tx-search");

function populateCategories() {
  txCat.innerHTML = STATE.categories.map(c => `<option>${c}</option>`).join("");
}

function resetTxForm() {
  editingTxId = null;
  txDesc.value = ""; txAmt.value = "";
  txDate.value = new Date().toISOString().slice(0, 10);
  txSubmitBtn.textContent = "Add";
  if (txCancelBtn) txCancelBtn.style.display = "none";
}

txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const fields = {
    date: txDate.value,
    type: txType.value,
    desc: txDesc.value.trim(),
    cat: txType.value === "income" ? "Income" : txCat.value,
    amt: parseFloat(txAmt.value),
  };
  if (!fields.desc || !(fields.amt > 0)) return;
  if (editingTxId) {
    const t = STATE.transactions.find(x => x.id === editingTxId);
    if (t) Object.assign(t, fields);
  } else {
    STATE.transactions.push({ id: crypto.randomUUID(), ...fields });
  }
  save();
  resetTxForm();
  renderAll();
});

if (txCancelBtn) txCancelBtn.addEventListener("click", () => { resetTxForm(); });
if (txSearch) txSearch.addEventListener("input", () => renderTransactions());

document.getElementById("tx-clear").addEventListener("click", () => {
  if (!confirm("Erase all transactions?")) return;
  STATE.transactions = [];
  save();
  renderAll();
});

function renderTransactions() {
  populateCategories();
  // Build month options
  const months = new Set(STATE.transactions.map(t => t.date.slice(0, 7)));
  const cur = new Date().toISOString().slice(0, 7);
  months.add(cur);
  const sorted = [...months].sort().reverse();
  const prev = txFilter.value || cur;
  txFilter.innerHTML = `<option value="all">All months</option>` +
    sorted.map(m => `<option value="${m}" ${m === prev ? "selected" : ""}>${m}</option>`).join("");

  const filter = txFilter.value;
  const q = (txSearch?.value || "").trim().toLowerCase();
  const rows = STATE.transactions
    .filter(t => filter === "all" || t.date.startsWith(filter))
    .filter(t => !q || t.desc.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  txEmpty.style.display = rows.length ? "none" : "block";
  txBody.innerHTML = rows.map(t => {
    const sign = t.type === "income" ? "+" : "−";
    const cls = t.type === "income" ? "pos" : "";
    const editing = t.id === editingTxId ? " editing" : "";
    return `<tr class="tx-row${editing}">
      <td>${t.date}</td>
      <td>${t.type}</td>
      <td>${escapeHtml(t.desc)}</td>
      <td>${escapeHtml(t.cat)}</td>
      <td class="right ${cls}">${sign}${fmt.format(t.amt)}</td>
      <td class="row-actions">
        <button class="icon-btn edit" data-edit="${t.id}" title="Edit">✎</button>
        <button class="icon-btn del" data-id="${t.id}" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join("");
  txBody.querySelectorAll(".del").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.id === editingTxId) resetTxForm();
    STATE.transactions = STATE.transactions.filter(t => t.id !== b.dataset.id);
    save(); renderAll();
  }));
  txBody.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    const t = STATE.transactions.find(x => x.id === b.dataset.edit);
    if (!t) return;
    editingTxId = t.id;
    txDate.value = t.date;
    txType.value = t.type;
    txDesc.value = t.desc;
    txAmt.value = t.amt;
    if (t.type !== "income") txCat.value = t.cat;
    txSubmitBtn.textContent = "Update";
    if (txCancelBtn) txCancelBtn.style.display = "";
    document.getElementById("tx-form").scrollIntoView({ behavior: "smooth", block: "center" });
    renderTransactions();
  }));
}
txFilter.addEventListener("change", () => { renderTransactions(); });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

// ---------------- Budget ----------------
const budgetRows = document.getElementById("budget-rows");
document.getElementById("bcat-add").addEventListener("click", () => {
  const name = document.getElementById("bcat-name").value.trim();
  const amt = parseFloat(document.getElementById("bcat-amt").value);
  if (!name || !(amt >= 0)) return;
  STATE.budgets[name] = amt;
  if (!STATE.categories.includes(name)) STATE.categories.push(name);
  document.getElementById("bcat-name").value = "";
  document.getElementById("bcat-amt").value = "";
  save(); renderAll();
});

function renderBudget() {
  const month = new Date().toISOString().slice(0, 7);
  const spendByCat = {};
  STATE.transactions
    .filter(t => t.type === "expense" && t.date.startsWith(month))
    .forEach(t => { spendByCat[t.cat] = (spendByCat[t.cat] || 0) + t.amt; });

  const cats = Object.keys(STATE.budgets);
  if (!cats.length) {
    budgetRows.innerHTML = `<p class="muted">No budget categories yet. Add one below.</p>`;
    return;
  }
  budgetRows.innerHTML = cats.map(cat => {
    const limit = STATE.budgets[cat];
    const spent = spendByCat[cat] || 0;
    const ratio = limit > 0 ? Math.min(1.2, spent / limit) : 0;
    const over = ratio > 1;
    return `<div class="budget-row">
      <div><b>${escapeHtml(cat)}</b><div class="meta">${fmt.format(spent)} of ${fmt.format(limit)}</div></div>
      <div class="meta">${limit > 0 ? Math.round((spent / limit) * 100) + "%" : "—"}</div>
      <div class="bar ${over ? "over" : ""}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>
      <button class="del" data-cat="${escapeHtml(cat)}" title="Remove">✕</button>
    </div>`;
  }).join("");
  budgetRows.querySelectorAll(".del").forEach(b => b.addEventListener("click", () => {
    delete STATE.budgets[b.dataset.cat];
    save(); renderAll();
  }));
}

// ---------------- Goals ----------------
const goalForm = document.getElementById("goal-form");
goalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const g = {
    id: crypto.randomUUID(),
    name: document.getElementById("goal-name").value.trim(),
    target: parseFloat(document.getElementById("goal-target").value),
    current: parseFloat(document.getElementById("goal-current").value) || 0,
    date: document.getElementById("goal-date").value,
  };
  if (!g.name || !(g.target > 0)) return;
  STATE.goals.push(g); save(); goalForm.reset(); renderGoals();
});

function renderGoals() {
  const list = document.getElementById("goal-list");
  if (!STATE.goals.length) {
    list.innerHTML = `<p class="muted">No goals yet. Try "Emergency fund" — 3–6 months of expenses is a great first target.</p>`;
    return;
  }
  list.innerHTML = STATE.goals.map(g => {
    const pctDone = Math.min(100, (g.current / g.target) * 100);
    const remaining = Math.max(0, g.target - g.current);
    let suffix = "";
    if (g.date) {
      const months = Math.max(1, Math.round((new Date(g.date) - new Date()) / (1000*60*60*24*30)));
      const perMonth = remaining / months;
      suffix = ` · save ${fmt0.format(perMonth)}/mo to hit ${g.date}`;
    }
    return `<div class="goal">
      <div class="row"><h4>${escapeHtml(g.name)}</h4>
        <button class="del" data-id="${g.id}">✕</button></div>
      <div class="meta muted">${fmt.format(g.current)} / ${fmt.format(g.target)}${suffix}</div>
      <div class="bar"><span style="width:${pctDone}%"></span></div>
      <div class="row" style="margin-top:0.5rem; gap:0.5rem;">
        <input type="number" placeholder="Add savings (kr.)" step="1" min="0" data-add="${g.id}" style="flex:1; background:var(--panel); border:1px solid var(--line); color:var(--text); border-radius:8px; padding:0.4rem 0.5rem;"/>
        <button class="ghost" data-add-btn="${g.id}">Add</button>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll(".del").forEach(b => b.addEventListener("click", () => {
    STATE.goals = STATE.goals.filter(g => g.id !== b.dataset.id); save(); renderGoals();
  }));
  list.querySelectorAll("[data-add-btn]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.addBtn;
    const inp = list.querySelector(`[data-add="${id}"]`);
    const amt = parseFloat(inp.value);
    if (!(amt > 0)) return;
    const g = STATE.goals.find(x => x.id === id);
    g.current += amt; save(); renderGoals();
  }));
}

// ---------------- Investing ----------------
const holdForm = document.getElementById("hold-form");
holdForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const h = {
    id: crypto.randomUUID(),
    ticker: document.getElementById("hold-ticker").value.trim().toUpperCase(),
    shares: parseFloat(document.getElementById("hold-shares").value),
    cost: parseFloat(document.getElementById("hold-cost").value),
    klass: document.getElementById("hold-class").value,
    price: null,
  };
  if (!h.ticker || !(h.shares > 0)) return;
  h.price = h.cost; // default until refreshed
  STATE.holdings.push(h); save();
  holdForm.reset();
  renderInvest();
});

document.getElementById("refresh-prices").addEventListener("click", refreshPrices);

async function refreshPrices() {
  const btn = document.getElementById("refresh-prices");
  if (!STATE.holdings.length) return;
  btn.disabled = true; btn.textContent = "Refreshing…";
  let updated = 0, failed = 0;
  const rate = fxRate();
  for (const h of STATE.holdings) {
    if (h.klass === "Cash") { updated++; continue; }
    const usd = await fetchQuote(h.ticker);
    if (usd != null && isFinite(usd) && usd > 0) {
      // Stooq US tickers return USD; convert to ISK at the user-set rate.
      // Tickers the user marked as already ISK-priced (with .is suffix) skip conversion.
      const isIslandic = h.ticker.toLowerCase().endsWith(".is");
      h.price = isIslandic ? usd : usd * rate;
      updated++;
    } else { failed++; }
  }
  save();
  btn.disabled = false; btn.textContent = "Refresh prices";
  renderInvest();
  if (failed > 0) {
    alert(`Updated ${updated} of ${STATE.holdings.length} holdings. ${failed} ticker(s) couldn't be fetched. Existing prices kept.`);
  }
}

async function fetchQuote(ticker) {
  // Stooq publishes a CSV last-quote endpoint that's CORS-friendly.
  // Symbols: US tickers are suffixed ".us"; crypto like "btcusd"; etc.
  const sym = mapToStooq(ticker);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const txt = await r.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const header = lines[0].toLowerCase().split(",");
    const row = lines[1].split(",");
    const closeIdx = header.indexOf("close");
    if (closeIdx < 0) return null;
    const close = parseFloat(row[closeIdx]);
    return isFinite(close) ? close : null;
  } catch (e) {
    return null;
  }
}

function mapToStooq(t) {
  const x = t.toLowerCase();
  if (/^(btc|eth|sol|ada|xrp|doge|dot|ltc)$/.test(x)) return `${x}usd`;
  if (x.includes(".")) return x; // user gave their own suffix
  return `${x}.us`;
}

function renderInvest() {
  const body = document.getElementById("hold-body");
  const empty = document.getElementById("hold-empty");
  empty.style.display = STATE.holdings.length ? "none" : "block";
  let totalVal = 0, totalCost = 0;
  body.innerHTML = STATE.holdings.map(h => {
    const price = h.price ?? h.cost;
    const value = price * h.shares;
    const basis = h.cost * h.shares;
    const pl = value - basis;
    const plPct = basis > 0 ? (pl / basis) * 100 : 0;
    totalVal += value; totalCost += basis;
    return `<tr>
      <td><b>${escapeHtml(h.ticker)}</b></td>
      <td>${escapeHtml(h.klass)}</td>
      <td class="right">${h.shares.toLocaleString(undefined,{maximumFractionDigits:4})}</td>
      <td class="right">${fmt.format(h.cost)}</td>
      <td class="right">${fmt.format(price)}</td>
      <td class="right">${fmt.format(value)}</td>
      <td class="right ${pl>=0?"pos":"neg"}">${fmt.format(pl)} (${pct(plPct)})</td>
      <td><button class="del" data-id="${h.id}">✕</button></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".del").forEach(b => b.addEventListener("click", () => {
    STATE.holdings = STATE.holdings.filter(h => h.id !== b.dataset.id);
    save(); renderInvest(); renderDashboard();
  }));

  document.getElementById("port-value").textContent = fmt.format(totalVal);
  document.getElementById("port-cost").textContent = fmt.format(totalCost);
  const gain = totalVal - totalCost;
  const gainEl = document.getElementById("port-gain");
  gainEl.textContent = fmt.format(gain);
  gainEl.classList.toggle("pos", gain >= 0);
  gainEl.classList.toggle("neg", gain < 0);
  document.getElementById("port-gain-pct").textContent = totalCost > 0 ? pct((gain / totalCost) * 100) : "";

  // Diversification: based on class counts and Herfindahl across classes.
  const byClass = {};
  STATE.holdings.forEach(h => {
    const v = (h.price ?? h.cost) * h.shares;
    byClass[h.klass] = (byClass[h.klass] || 0) + v;
  });
  const total = Object.values(byClass).reduce((a,b)=>a+b, 0);
  let h2 = 0;
  Object.values(byClass).forEach(v => { const s = total ? v/total : 0; h2 += s*s; });
  // Effective number of asset classes (1/Herfindahl). Map to A–F grade.
  const eff = h2 ? 1/h2 : 0;
  const grade = eff >= 4 ? "A" : eff >= 3 ? "B" : eff >= 2 ? "C" : eff >= 1.4 ? "D" : eff > 0 ? "E" : "—";
  document.getElementById("port-div").textContent = grade;

  drawAlloc(byClass);
}

const CHART_PALETTE = ["#6ee7b7","#60a5fa","#c4b5fd","#fbbf24","#f87171","#f472b6","#34d399","#93c5fd","#fda4af","#fcd34d"];
const CHART_TEXT = "#eef0fa";
const CHART_MUTED = "#7e85a8";
const CHART_GRID = "rgba(255,255,255,0.06)";
const CHART_BORDER = "rgba(7,9,26,0.9)";

let allocChart;
function drawAlloc(byClass) {
  const ctx = document.getElementById("chart-alloc");
  if (!ctx || typeof Chart === "undefined") return;
  const labels = Object.keys(byClass);
  const data = Object.values(byClass);
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_PALETTE,
        borderColor: CHART_BORDER,
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      cutout: "62%",
      plugins: {
        legend: { labels: { color: CHART_TEXT, font: { family: "Inter", size: 12 }, padding: 14, usePointStyle: true } },
        tooltip: { backgroundColor: "rgba(12,16,36,0.95)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, padding: 10, titleFont: { family: "Inter" }, bodyFont: { family: "Inter" } }
      }
    }
  });
}

// ---------------- Risk profile -> allocation ----------------
document.getElementById("risk-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const age = parseInt(document.getElementById("r-age").value, 10) || 30;
  const horizon = parseInt(document.getElementById("r-horizon").value, 10);
  const risk = document.getElementById("r-risk").value;
  const stable = document.getElementById("r-income").value === "stable";

  // Base equity % from a "110 minus age" rule, then adjust for risk + horizon.
  let equity = Math.max(20, Math.min(95, 110 - age));
  if (risk === "low") equity -= 15;
  if (risk === "high") equity += 10;
  if (horizon <= 3) equity = Math.min(equity, 40);
  if (horizon >= 25) equity += 5;
  if (!stable) equity -= 5;
  equity = Math.max(20, Math.min(95, equity));

  const bonds = Math.round((100 - equity) * 0.8);
  const cash = 100 - equity - bonds; // remainder
  const usEq = Math.round(equity * 0.65);
  const intlEq = equity - usEq;

  const out = document.getElementById("risk-out");
  out.innerHTML = `
    <div class="score-card good" style="margin-top:0.75rem;">
      <div>Suggested target allocation</div>
      <div class="score-breakdown">
        <div><b>${usEq}%</b><span class="muted">US stocks (e.g. <code>VTI</code>, <code>ITOT</code>)</span></div>
        <div><b>${intlEq}%</b><span class="muted">International stocks (e.g. <code>VXUS</code>, <code>IXUS</code>)</span></div>
        <div><b>${bonds}%</b><span class="muted">Bonds (e.g. <code>BND</code>, <code>AGG</code>)</span></div>
        <div><b>${cash}%</b><span class="muted">Cash / T-bills (e.g. <code>SGOV</code>, <code>BIL</code>)</span></div>
      </div>
      <p class="muted" style="margin:0.6rem 0 0;">Rule of thumb only. Rebalance once a year. Hold an emergency fund (3–6 months of expenses) separately.</p>
    </div>`;
});

// ---------------- Screener ----------------
document.getElementById("screen-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = document.getElementById("s-ticker").value.trim().toUpperCase();
  const pe = parseFloat(document.getElementById("s-pe").value);
  const growth = parseFloat(document.getElementById("s-growth").value);
  const dividend = parseFloat(document.getElementById("s-div").value);
  const de = parseFloat(document.getElementById("s-de").value);
  const roe = parseFloat(document.getElementById("s-roe").value);
  const fcf = document.getElementById("s-fcf").value;
  const moat = document.getElementById("s-moat").value;

  // Each sub-score is 0–100; weighted to a final 0–100.
  const parts = [];
  function part(label, score, weight, note) {
    parts.push({ label, score: Math.max(0, Math.min(100, score)), weight, note });
  }

  if (isFinite(pe)) {
    let s;
    if (pe <= 0) s = 20;
    else if (pe < 10) s = 95;
    else if (pe < 18) s = 80;
    else if (pe < 25) s = 60;
    else if (pe < 35) s = 40;
    else if (pe < 60) s = 25;
    else s = 10;
    part("Value (P/E)", s, 0.18, `P/E ${pe} — ${pe < 18 ? "reasonable" : pe < 30 ? "growthy" : "expensive"}`);
  }
  if (isFinite(growth)) {
    const s = growth >= 20 ? 95 : growth >= 10 ? 80 : growth >= 5 ? 65 : growth >= 0 ? 45 : 15;
    part("Growth", s, 0.20, `${growth}%/yr earnings growth`);
  }
  if (isFinite(roe)) {
    const s = roe >= 25 ? 95 : roe >= 15 ? 80 : roe >= 10 ? 65 : roe >= 5 ? 45 : 20;
    part("Profitability (ROE)", s, 0.17, `ROE ${roe}%`);
  }
  if (isFinite(de)) {
    const s = de <= 0.3 ? 95 : de <= 0.6 ? 80 : de <= 1 ? 65 : de <= 1.5 ? 45 : de <= 2.5 ? 25 : 10;
    part("Balance sheet (D/E)", s, 0.15, `Debt/Equity ${de}`);
  }
  if (isFinite(dividend)) {
    const s = dividend === 0 ? 50 : dividend < 1 ? 55 : dividend < 3 ? 80 : dividend < 5 ? 75 : dividend < 8 ? 55 : 30;
    part("Shareholder yield", s, 0.10, `${dividend}% dividend${dividend > 8 ? " (suspiciously high)" : ""}`);
  }
  const fcfScore = fcf === "yes" ? 90 : fcf === "flat" ? 55 : 20;
  part("Cash generation", fcfScore, 0.10, `Free cash flow ${fcf === "yes" ? "growing" : fcf}`);
  const moatScore = moat === "wide" ? 95 : moat === "narrow" ? 65 : 30;
  part("Moat", moatScore, 0.10, `${moat} competitive advantage`);

  const totalW = parts.reduce((a,b)=>a+b.weight, 0) || 1;
  const final = parts.reduce((a,b)=>a + b.score * b.weight, 0) / totalW;

  const verdict = final >= 75 ? { grade: "Strong", cls: "good" }
                : final >= 55 ? { grade: "Decent", cls: "ok" }
                : { grade: "Weak", cls: "bad" };

  const out = document.getElementById("screen-out");
  out.innerHTML = `
    <div class="score-card ${verdict.cls}">
      <div class="muted">${escapeHtml(t)} composite score</div>
      <div class="big">${final.toFixed(0)} <span style="font-size:1rem; vertical-align: middle;">/ 100 · ${verdict.grade}</span></div>
      <div class="score-breakdown">
        ${parts.map(p => `<div><b>${p.label}: ${p.score.toFixed(0)}</b><span class="muted">${escapeHtml(p.note)} · weight ${(p.weight*100).toFixed(0)}%</span></div>`).join("")}
      </div>
      <p class="muted" style="margin-top:0.75rem;">
        Reminder: a high score on these heuristics is a starting point, not a buy signal. Read the latest 10-K,
        consider competitive risks, and never put more than you can hold through a 50% drawdown into a single stock.
      </p>
    </div>`;
});

// ---------------- AI lookup ----------------
const apiKeyInput = document.getElementById("api-key");
const apiKeyStatus = document.getElementById("api-key-status");
const aiModelSelect = document.getElementById("ai-model");

function loadApiKey() {
  const k = localStorage.getItem(API_KEY_STORAGE) || "";
  if (k) {
    apiKeyInput.value = k;
    apiKeyStatus.textContent = `Key saved (ends in …${k.slice(-4)}). Stored only in this browser.`;
  } else {
    apiKeyStatus.textContent = "No key saved. The AI lookup button is disabled until you add one.";
  }
  const m = localStorage.getItem(MODEL_STORAGE);
  if (m) aiModelSelect.value = m;
  refreshAiAvailability();
}

document.getElementById("api-key-save").addEventListener("click", () => {
  const k = apiKeyInput.value.trim();
  if (!k.startsWith("sk-ant-")) {
    apiKeyStatus.textContent = "That doesn't look like an Anthropic API key (should start with sk-ant-).";
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, k);
  localStorage.setItem(MODEL_STORAGE, aiModelSelect.value);
  loadApiKey();
});
document.getElementById("api-key-clear").addEventListener("click", () => {
  localStorage.removeItem(API_KEY_STORAGE);
  apiKeyInput.value = "";
  loadApiKey();
});
aiModelSelect.addEventListener("change", () => {
  localStorage.setItem(MODEL_STORAGE, aiModelSelect.value);
});

function refreshAiAvailability() {
  const has = !!localStorage.getItem(API_KEY_STORAGE);
  document.getElementById("ai-lookup").disabled = !has;
  document.getElementById("ai-hint").textContent = has
    ? `Using ${localStorage.getItem(MODEL_STORAGE) || "claude-opus-4-7"} with web search. Each lookup typically costs a few cents and takes 15–40s.`
    : "Needs an Anthropic API key — add yours in Settings. Each lookup uses web search and typically costs a few cents.";
}

const SCREEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "company_name","industry","pe_ratio","earnings_growth_5y",
    "dividend_yield_pct","debt_to_equity","roe_pct",
    "fcf_trend","moat","as_of_date","analysis","risks","sources"
  ],
  properties: {
    company_name: { type: "string" },
    industry: { type: "string" },
    pe_ratio: { anyOf: [{ type: "number" }, { type: "null" }] },
    earnings_growth_5y: { anyOf: [{ type: "number" }, { type: "null" }] },
    dividend_yield_pct: { anyOf: [{ type: "number" }, { type: "null" }] },
    debt_to_equity: { anyOf: [{ type: "number" }, { type: "null" }] },
    roe_pct: { anyOf: [{ type: "number" }, { type: "null" }] },
    fcf_trend: { type: "string", enum: ["yes","flat","no","unknown"] },
    moat: { type: "string", enum: ["wide","narrow","none","unknown"] },
    as_of_date: { type: "string" },
    analysis: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } }
  }
};

const SCREEN_SYSTEM = `You are a financial research assistant inside a personal finance app. The user gives you a stock or ETF ticker. Use web search to find the most recent publicly reported figures (trailing twelve months where applicable), then return JSON matching the schema with:
- pe_ratio: trailing P/E (null if not meaningful, e.g. negative earnings)
- earnings_growth_5y: annualized EPS growth over the trailing 5 years (percent)
- dividend_yield_pct: forward dividend yield (percent)
- debt_to_equity: most recent total debt / total equity ratio
- roe_pct: trailing return on equity (percent)
- fcf_trend: "yes" if free cash flow has been growing over the last 3 years, "flat", "no" if declining, "unknown" if you cannot tell
- moat: your judgement of competitive advantage — "wide", "narrow", "none", or "unknown"
- as_of_date: ISO date of the most recent reporting period the metrics reflect
- analysis: 3–5 sentences of plain-English assessment — what the business does, what the numbers say, and whether it looks attractive at current levels. Be honest and balanced.
- risks: 2–4 short bullet phrases for the biggest risks an investor should weigh
- sources: 2–5 URLs you actually consulted

Rules:
- Never invent a number. If a metric isn't available from a credible source, return null and say so in the analysis.
- For ETFs, use ETF-appropriate proxies (e.g. weighted-average P/E, distribution yield) and explain in the analysis.
- This is education, not personalized advice. Do not recommend buying or selling — describe and assess.`;

document.getElementById("ai-lookup").addEventListener("click", async () => {
  const ticker = document.getElementById("ai-ticker").value.trim().toUpperCase();
  if (!ticker) { alert("Enter a ticker first."); return; }
  const key = localStorage.getItem(API_KEY_STORAGE);
  if (!key) { alert("Add your Anthropic API key in Settings first."); return; }
  const model = localStorage.getItem(MODEL_STORAGE) || "claude-opus-4-7";

  const btn = document.getElementById("ai-lookup");
  const status = document.getElementById("ai-status");
  const analysisDiv = document.getElementById("ai-analysis");
  btn.disabled = true;
  status.innerHTML = `<span class="spinner"></span> Looking up ${escapeHtml(ticker)}… (web search can take 20–40s)`;
  analysisDiv.innerHTML = "";

  try {
    const data = await lookupCompany({ ticker, model, key });
    fillScreenerForm(ticker, data);
    renderAiAnalysis(data);
    // Trigger the score with the freshly-filled fields
    document.getElementById("screen-form").requestSubmit();
    status.textContent = `Done — figures are as of ${data.as_of_date || "the date shown below"}.`;
  } catch (err) {
    console.error(err);
    status.innerHTML = `<span style="color: var(--danger)">${escapeHtml(err.message || "Lookup failed.")}</span>`;
  } finally {
    btn.disabled = false;
  }
});

async function lookupCompany({ ticker, model, key }) {
  const body = {
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SCREEN_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    output_config: { format: { type: "json_schema", schema: SCREEN_SCHEMA } },
    messages: [{ role: "user", content: `Look up ticker ${ticker} and return the JSON analysis.` }],
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.json())?.error?.message || ""; } catch (_) {}
    if (resp.status === 401) throw new Error("Invalid API key. Check Settings.");
    if (resp.status === 429) throw new Error("Rate limited. Try again in a moment.");
    throw new Error(`API error ${resp.status}${detail ? ": " + detail : ""}`);
  }

  const data = await resp.json();
  if (data.stop_reason === "refusal") {
    throw new Error("Claude declined to analyze this ticker. Try a different one.");
  }
  const textBlock = (data.content || []).find(b => b.type === "text");
  if (!textBlock?.text) throw new Error("No analysis returned. Try again.");
  try {
    return JSON.parse(textBlock.text);
  } catch (e) {
    throw new Error("Couldn't parse the response. Try again.");
  }
}

function fillScreenerForm(ticker, d) {
  document.getElementById("s-ticker").value = ticker;
  const set = (id, v) => { document.getElementById(id).value = (v ?? "") === "" ? "" : String(v); };
  set("s-pe", d.pe_ratio);
  set("s-growth", d.earnings_growth_5y);
  set("s-div", d.dividend_yield_pct);
  set("s-de", d.debt_to_equity);
  set("s-roe", d.roe_pct);
  document.getElementById("s-fcf").value = ["yes","flat","no"].includes(d.fcf_trend) ? d.fcf_trend : "flat";
  document.getElementById("s-moat").value = ["wide","narrow","none"].includes(d.moat) ? d.moat : "narrow";
}

function renderAiAnalysis(d) {
  const sourceLinks = (d.sources || [])
    .filter(u => /^https?:\/\//i.test(u))
    .map(u => `<a href="${escapeAttr(u)}" target="_blank" rel="noopener">${escapeHtml(shortUrl(u))}</a>`)
    .join(" · ");
  const risks = (d.risks || []).map(r => `<li>${escapeHtml(r)}</li>`).join("");
  document.getElementById("ai-analysis").innerHTML = `
    <div class="ai-analysis">
      <h4>${escapeHtml(d.company_name || "Analysis")} <span class="muted" style="font-weight:400;">${escapeHtml(d.industry || "")}</span></h4>
      <div class="meta">As of ${escapeHtml(d.as_of_date || "—")} · AI-generated, verify before acting on it</div>
      <p>${escapeHtml(d.analysis || "")}</p>
      ${risks ? `<div><b>Key risks</b><ul>${risks}</ul></div>` : ""}
      ${sourceLinks ? `<div class="sources">Sources: ${sourceLinks}</div>` : ""}
    </div>`;
}

function shortUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); }
  catch (_) { return u.length > 50 ? u.slice(0, 50) + "…" : u; }
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function renderWatchlist() {
  const groups = [
    {
      title: "Build a simple long-term core",
      desc: "Two or three of these cover most of the global market at very low cost.",
      items: [
        ["VTI / ITOT", "Total US stock market"],
        ["VXUS / IXUS", "Total international stocks"],
        ["BND / AGG", "Total US bond market"],
        ["SGOV / BIL", "Ultra-short T-bills (cash-like)"],
      ]
    },
    {
      title: "Targeted equity exposure",
      desc: "Tilts you might add once you have a core.",
      items: [
        ["VOO / SPY", "S&P 500 (large US companies)"],
        ["AVUV", "US small-cap value tilt"],
        ["QQQM", "Nasdaq-100 (tech-heavy growth)"],
        ["SCHD", "US dividend growers"],
        ["VWO", "Emerging markets stocks"],
      ]
    },
    {
      title: "Defensive & diversifiers",
      desc: "Useful when you want lower volatility or different return drivers.",
      items: [
        ["TLT", "Long US Treasuries"],
        ["TIP", "Inflation-protected Treasuries"],
        ["GLD / IAU", "Gold"],
        ["VNQ", "US real estate (REITs)"],
      ]
    }
  ];
  const root = document.getElementById("watchlist");
  root.innerHTML = `<div class="watch-grid">` + groups.map(g => `
    <div class="watch">
      <h4>${g.title}</h4>
      <div class="muted">${g.desc}</div>
      <ul>${g.items.map(([t, n]) => `<li><code>${t}</code> — ${n}</li>`).join("")}</ul>
    </div>
  `).join("") + `</div>`;
}

// ---------------- Dashboard ----------------
let cashflowChart, catChart;
function renderDashboard() {
  // Net worth = cash (income - expense) + portfolio
  const totalIncome = sum(STATE.transactions.filter(t => t.type === "income").map(t => t.amt));
  const totalSpend = sum(STATE.transactions.filter(t => t.type === "expense").map(t => t.amt));
  const portfolio = sum(STATE.holdings.map(h => (h.price ?? h.cost) * h.shares));
  const networth = totalIncome - totalSpend + portfolio;
  document.getElementById("kpi-networth").textContent = fmt.format(networth);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const mi = sum(STATE.transactions.filter(t => t.type === "income" && t.date.startsWith(thisMonth)).map(t => t.amt));
  const me = sum(STATE.transactions.filter(t => t.type === "expense" && t.date.startsWith(thisMonth)).map(t => t.amt));
  document.getElementById("kpi-income").textContent = fmt.format(mi);
  document.getElementById("kpi-spend").textContent = fmt.format(me);
  const rate = mi > 0 ? ((mi - me) / mi) * 100 : 0;
  document.getElementById("kpi-rate").textContent = mi > 0 ? rate.toFixed(0) + "%" : "—";

  // Previous-month delta
  const prev = previousMonth(thisMonth);
  const piMi = sum(STATE.transactions.filter(t => t.type === "income" && t.date.startsWith(prev)).map(t => t.amt));
  const piMe = sum(STATE.transactions.filter(t => t.type === "expense" && t.date.startsWith(prev)).map(t => t.amt));
  const delta = (mi - me) - (piMi - piMe);
  const deltaEl = document.getElementById("kpi-networth-delta");
  if (piMi || piMe) {
    deltaEl.textContent = (delta >= 0 ? "▲ " : "▼ ") + fmt.format(Math.abs(delta)) + " vs last month's net savings";
    deltaEl.style.color = delta >= 0 ? "var(--accent)" : "var(--danger)";
  } else { deltaEl.textContent = ""; }

  // Charts
  const months = lastNMonths(6);
  const incomeByMonth = months.map(m => sum(STATE.transactions.filter(t => t.type==="income" && t.date.startsWith(m)).map(t => t.amt)));
  const spendByMonth = months.map(m => sum(STATE.transactions.filter(t => t.type==="expense" && t.date.startsWith(m)).map(t => t.amt)));

  if (typeof Chart !== "undefined") {
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = CHART_TEXT;

    const ctx1 = document.getElementById("chart-cashflow");
    if (cashflowChart) cashflowChart.destroy();
    cashflowChart = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: months,
        datasets: [
          { label: "Income", data: incomeByMonth, backgroundColor: "#6ee7b7", borderRadius: 6, borderSkipped: false },
          { label: "Spend",  data: spendByMonth,  backgroundColor: "#f87171", borderRadius: 6, borderSkipped: false },
        ]
      },
      options: {
        scales: {
          x: { ticks: { color: CHART_MUTED }, grid: { color: "transparent" }, border: { color: CHART_GRID } },
          y: { ticks: { color: CHART_MUTED }, grid: { color: CHART_GRID }, border: { color: "transparent" } }
        },
        plugins: {
          legend: { labels: { color: CHART_TEXT, usePointStyle: true, padding: 14 } },
          tooltip: { backgroundColor: "rgba(12,16,36,0.95)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, padding: 10 }
        }
      }
    });

    const catSpend = {};
    STATE.transactions
      .filter(t => t.type === "expense" && t.date.startsWith(thisMonth))
      .forEach(t => { catSpend[t.cat] = (catSpend[t.cat] || 0) + t.amt; });
    const ctx2 = document.getElementById("chart-categories");
    if (catChart) catChart.destroy();
    catChart = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: Object.keys(catSpend),
        datasets: [{
          data: Object.values(catSpend),
          backgroundColor: CHART_PALETTE,
          borderColor: CHART_BORDER,
          borderWidth: 2,
          hoverOffset: 8,
        }]
      },
      options: {
        cutout: "62%",
        plugins: {
          legend: { labels: { color: CHART_TEXT, usePointStyle: true, padding: 14 } },
          tooltip: { backgroundColor: "rgba(12,16,36,0.95)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, padding: 10 }
        }
      }
    });
  }

  renderInsights({ mi, me, rate, networth, portfolio });
}

function renderInsights({ mi, me, rate, networth, portfolio }) {
  const list = document.getElementById("insights");
  const tips = [];

  if (STATE.transactions.length === 0) {
    tips.push({ k: "warn", t: "Add a few transactions so the app can spot patterns. Try seeding demo data from Settings to see what the dashboard looks like." });
  }
  if (mi > 0) {
    if (rate < 0) tips.push({ k: "bad", t: `You're spending more than you earn this month. Look at your top 2 categories — even a 20% trim brings you back to neutral.` });
    else if (rate < 10) tips.push({ k: "warn", t: `Savings rate is ${rate.toFixed(0)}%. The classic target is 20%+; even +5% compounds enormously over a decade.` });
    else if (rate >= 20) tips.push({ k: "good", t: `Nice — ${rate.toFixed(0)}% savings rate is strong. Make sure the surplus is being invested, not just sitting in checking.` });
  }
  // Emergency fund check
  const emergencyGoal = STATE.goals.find(g => /emergency/i.test(g.name));
  const monthsExpense = me;
  if (monthsExpense > 0 && !emergencyGoal) {
    const target = monthsExpense * 4;
    tips.push({ k: "warn", t: `No emergency fund goal yet. Aim for ~${fmt0.format(target)} (about 4 months of your spending) before adding risk in investments.` });
  }
  // Subscription hint
  const subs = STATE.transactions.filter(t => t.type === "expense" && t.cat === "Subscriptions" && t.date.startsWith(new Date().toISOString().slice(0,7)));
  if (subs.length >= 5) tips.push({ k: "warn", t: `You have ${subs.length} subscriptions this month. Cancelling the bottom one or two often saves more than the next pay-raise gives you.` });
  // Concentration risk
  if (STATE.holdings.length) {
    const byClass = {};
    let total = 0;
    STATE.holdings.forEach(h => { const v = (h.price ?? h.cost)*h.shares; byClass[h.klass] = (byClass[h.klass]||0)+v; total += v; });
    const max = Math.max(...Object.values(byClass));
    if (total > 0 && max/total > 0.85) tips.push({ k: "warn", t: `Over 85% of your portfolio sits in one asset class. Adding a second class (e.g. bonds or international) cuts portfolio swings without giving up much long-run return.` });
    // Single-name concentration
    const byName = {};
    STATE.holdings.forEach(h => { const v=(h.price??h.cost)*h.shares; byName[h.ticker]=(byName[h.ticker]||0)+v; });
    const maxName = Object.entries(byName).sort((a,b)=>b[1]-a[1])[0];
    if (maxName && total > 0 && maxName[1]/total > 0.25) {
      tips.push({ k: "warn", t: `${maxName[0]} is ${Math.round(maxName[1]/total*100)}% of your portfolio. A single stock above ~10% is concentration risk worth understanding.` });
    }
    // Idle cash
    const cashShare = (byClass["Cash"] || 0) / total;
    if (total > 0 && cashShare > 0.30) tips.push({ k: "warn", t: `${Math.round(cashShare*100)}% of your portfolio is cash. Cash above an emergency fund tends to lose to inflation over time.` });
  }
  if (tips.length === 0) tips.push({ k: "good", t: "Looking good. Keep logging, keep investing, and check back monthly." });

  list.innerHTML = tips.map(x => `<li class="${x.k === "good" ? "" : x.k}">${escapeHtml(x.t)}</li>`).join("");
}

function sum(arr) { return arr.reduce((a,b)=>a+b, 0); }
function previousMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7);
}
function lastNMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// ---------------- Settings ----------------
// FX rate setting
const fxInput = document.getElementById("fx-rate");
if (fxInput) {
  fxInput.value = fxRate();
  fxInput.addEventListener("change", () => {
    const v = parseFloat(fxInput.value);
    if (v > 0) {
      STATE.settings = STATE.settings || {};
      STATE.settings.fxUsdIsk = v;
      save();
      renderInvest(); renderDashboard();
    }
  });
}

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `asd-finance-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const txt = await f.text();
    const data = JSON.parse(txt);
    if (!data.transactions || !data.holdings) throw new Error("Not an Asd Finance backup.");
    Object.assign(STATE, data); save(); renderAll();
    alert("Imported.");
  } catch (err) { alert("Import failed: " + err.message); }
  e.target.value = "";
});

document.getElementById("wipe-btn").addEventListener("click", () => {
  if (!confirm("Erase ALL data? This can't be undone.")) return;
  localStorage.removeItem(KEY);
  location.reload();
});

document.getElementById("seed-btn").addEventListener("click", () => {
  if (STATE.transactions.length && !confirm("Replace existing data with demo data?")) return;
  Object.assign(STATE, demoData());
  save(); renderAll();
});

function demoData() {
  const today = new Date();
  const tx = [];
  const r = (n) => Math.round(n / 100) * 100;
  for (let i = 0; i < 5; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = d.toISOString().slice(0, 7);
    tx.push({ id: crypto.randomUUID(), date: ym + "-01", type: "income",  desc: "Laun",         cat: "Income",        amt: 720000 });
    tx.push({ id: crypto.randomUUID(), date: ym + "-02", type: "expense", desc: "Leiga",        cat: "Housing",       amt: 230000 });
    tx.push({ id: crypto.randomUUID(), date: ym + "-05", type: "expense", desc: "Bónus / Krónan", cat: "Groceries",   amt: r(85000 + Math.random()*15000) });
    tx.push({ id: crypto.randomUUID(), date: ym + "-09", type: "expense", desc: "Veitingar",    cat: "Dining",        amt: r(28000 + Math.random()*15000) });
    tx.push({ id: crypto.randomUUID(), date: ym + "-12", type: "expense", desc: "Hiti og rafmagn", cat: "Utilities",  amt: 16500 });
    tx.push({ id: crypto.randomUUID(), date: ym + "-15", type: "expense", desc: "Strætó-kort",  cat: "Transport",     amt: 12500 });
    tx.push({ id: crypto.randomUUID(), date: ym + "-18", type: "expense", desc: "Netflix + Spotify", cat: "Subscriptions", amt: 4500 });
    tx.push({ id: crypto.randomUUID(), date: ym + "-22", type: "expense", desc: "Bensín",       cat: "Transport",     amt: r(18000 + Math.random()*5000) });
    tx.push({ id: crypto.randomUUID(), date: ym + "-25", type: "expense", desc: "Sundkort",     cat: "Health",        amt: 9500 });
  }
  const rate = 140;
  return {
    transactions: tx,
    budgets: { ...DEFAULT_BUDGETS },
    categories: [...DEFAULT_CATEGORIES],
    goals: [
      { id: crypto.randomUUID(), name: "Varasjóður", target: 1500000, current: 600000, date: "" },
      { id: crypto.randomUUID(), name: "Sumarfrí",   target: 500000,  current: 120000, date: new Date(today.getFullYear(), today.getMonth()+8, 1).toISOString().slice(0,10) },
    ],
    holdings: [
      { id: crypto.randomUUID(), ticker: "VTI",  klass: "US Stocks",   shares: 12, cost: 230 * rate, price: 245 * rate },
      { id: crypto.randomUUID(), ticker: "VXUS", klass: "Intl Stocks", shares: 25, cost: 56  * rate, price: 60  * rate },
      { id: crypto.randomUUID(), ticker: "BND",  klass: "Bonds",       shares: 30, cost: 72  * rate, price: 71  * rate },
      { id: crypto.randomUUID(), ticker: "SGOV", klass: "Cash",        shares: 20, cost: 100 * rate, price: 100 * rate },
    ],
    settings: { currency: "ISK", fxUsdIsk: rate },
  };
}

// ---------------- Initial render ----------------
function renderAll() {
  renderTransactions();
  renderBudget();
  renderGoals();
  renderInvest();
  renderDashboard();
}
populateCategories();
renderWatchlist();
loadApiKey();
renderAll();
