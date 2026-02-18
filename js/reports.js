// js/reports.js — Rapoarte admin
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  getIdToken,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ============================
   STATE
============================ */
let _period = "today";          // today | week | month | custom
let _dateFrom = null;           // Date
let _dateTo = null;             // Date
let _allOrders = [];            // toate comenzile din perioadă
let _allUsers = new Map();      // uid -> userData

/* ============================
   DOM
============================ */
const periodLabel    = document.getElementById("periodLabel");
const overviewStats  = document.getElementById("overviewStats");
const recentOrders   = document.getElementById("recentOrders");
const productsList   = document.getElementById("productsList");
const clientsList    = document.getElementById("clientsList");
const affiliatesList = document.getElementById("affiliatesList");
const customDates    = document.getElementById("customDates");
const dateFrom       = document.getElementById("dateFrom");
const dateTo         = document.getElementById("dateTo");
const btnApplyCustom = document.getElementById("btnApplyCustom");

/* ============================
   HELPERS
============================ */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtMoney(v) {
  return Number(v || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function getPeriodRange(period) {
  const now = new Date();
  let from, to;

  if (period === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (period === "week") {
    const day = now.getDay() || 7; // Luni = 1
    from = new Date(now); from.setDate(now.getDate() - day + 1); from.setHours(0,0,0,0);
    to   = new Date(now); to.setHours(23,59,59,999);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "custom") {
    from = _dateFrom ? new Date(_dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    to   = _dateTo   ? new Date(_dateTo)   : new Date();
    to.setHours(23, 59, 59, 999);
  }

  return { from, to };
}

function setPeriodLabel(period, from, to) {
  const fmt = (d) => d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
  if (period === "today") { periodLabel.textContent = "Azi — " + fmt(from); return; }
  if (period === "week")  { periodLabel.textContent = fmt(from) + " → " + fmt(to); return; }
  if (period === "month") { periodLabel.textContent = fmt(from) + " → " + fmt(to); return; }
  periodLabel.textContent = fmt(from) + " → " + fmt(to);
}

function setLoading() {
  const L = `<div class="loading">Se încarcă…</div>`;
  if (overviewStats) overviewStats.innerHTML = `<div class="loading" style="grid-column:1/-1;">Se încarcă…</div>`;
  if (recentOrders)  recentOrders.innerHTML = L;
  if (productsList)  productsList.innerHTML = L;
  if (clientsList)   clientsList.innerHTML = L;
  if (affiliatesList) affiliatesList.innerHTML = L;
}

/* ============================
   PERIOD BUTTONS
============================ */
document.querySelectorAll(".period-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".period-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    _period = btn.dataset.period;
    customDates.style.display = _period === "custom" ? "flex" : "none";
    if (_period !== "custom") loadReport();
  });
});

btnApplyCustom?.addEventListener("click", () => {
  _dateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
  _dateTo   = dateTo.value   ? new Date(dateTo.value)   : null;
  if (!_dateFrom || !_dateTo) return alert("Selectează ambele date.");
  loadReport();
});

/* ============================
   LOAD USERS (pentru afiliați)
============================ */
async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  _allUsers.clear();
  snap.forEach(d => _allUsers.set(d.id, d.data()));
}

/* ============================
   LOAD REPORT
============================ */
async function loadReport() {
  setLoading();

  const { from, to } = getPeriodRange(_period);
  setPeriodLabel(_period, from, to);

  try {
    // Query comenzi în intervalul de timp
    const q = query(
      collection(db, "orders"),
      where("createdAt", ">=", Timestamp.fromDate(from)),
      where("createdAt", "<=", Timestamp.fromDate(to)),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);
    _allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderOverview();
    renderProducts();
    renderClients();
    renderAffiliates();

  } catch (e) {
    console.error(e);
    const errHtml = `<div class="loading" style="color:#ff5d5d;">Eroare: ${escapeHtml(e?.message || "")}</div>`;
    if (overviewStats) overviewStats.innerHTML = errHtml;
  }
}

/* ============================
   RENDER: OVERVIEW
============================ */
function renderOverview() {
  if (!overviewStats) return;

  const total = _allOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const count = _allOrders.length;
  const avg   = count ? total / count : 0;

  const byStatus = {};
  _allOrders.forEach(o => {
    const st = o.status || "NEW";
    byStatus[st] = (byStatus[st] || 0) + 1;
  });

  const statusColors = {
    NEW: "#4da3ff", CONFIRMED: "#35d07f", SENT: "#f5a623",
    DELIVERED: "#9fb0c3", CANCELED: "#ff5d5d"
  };

  overviewStats.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total comenzi</div>
      <div class="stat-value">${count}</div>
      <div class="stat-sub">în perioada selectată</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Valoare totală</div>
      <div class="stat-value" style="font-size:20px; color:var(--ok);">${fmtMoney(total)}</div>
      <div class="stat-sub">RON</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Valoare medie</div>
      <div class="stat-value" style="font-size:20px;">${fmtMoney(avg)}</div>
      <div class="stat-sub">RON / comandă</div>
    </div>
  `;

  // Status breakdown
  const statusDiv = document.createElement("div");
  statusDiv.style.cssText = "grid-column:1/-1; display:grid; gap:8px; margin-top:4px;";

  Object.entries(byStatus).forEach(([st, cnt]) => {
    const pct = count ? Math.round(cnt / count * 100) : 0;
    const color = statusColors[st] || "#9fb0c3";
    statusDiv.innerHTML += `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="color:${color}; font-weight:800; font-size:13px; min-width:90px;">${st}</span>
        <div class="progress-bar" style="flex:1;">
          <div class="progress-fill" style="width:${pct}%; background:${color};"></div>
        </div>
        <span style="font-size:13px; opacity:.7; min-width:50px; text-align:right;">${cnt} (${pct}%)</span>
      </div>
    `;
  });
  overviewStats.appendChild(statusDiv);

  // Ultime comenzi
  if (!recentOrders) return;
  if (!_allOrders.length) {
    recentOrders.innerHTML = `<div class="empty">Nicio comandă în această perioadă.</div>`;
    return;
  }

  recentOrders.innerHTML = "";
  _allOrders.slice(0, 10).forEach((o, i) => {
    const client = o.clientSnapshot || {};
    const name = client.fullName || client.phone || "—";
    const statusColor = statusColors[o.status] || "#9fb0c3";

    recentOrders.innerHTML += `
      <div class="report-row">
        <div class="report-row-rank">#${o.orderNumber || "—"}</div>
        <div class="report-row-info">
          <div class="report-row-name">${escapeHtml(name)}</div>
          <div class="report-row-sub">
            ${fmtDate(o.createdAt)} &nbsp;·&nbsp;
            <span style="color:${statusColor}; font-weight:700;">${o.status || "—"}</span>
          </div>
        </div>
        <div class="report-row-value">
          <div class="report-row-val-main">${fmtMoney(o.total)} RON</div>
          <div class="report-row-val-sub">${(o.items || []).length} produse</div>
        </div>
      </div>
    `;
  });
}

/* ============================
   RENDER: PRODUSE
============================ */
function renderProducts() {
  if (!productsList) return;

  // Agregare: cantitate + valoare per produs
  const prodMap = new Map(); // productId -> {name, qty, value}

  _allOrders.forEach(o => {
    if (o.status === "CANCELED") return;
    (o.items || []).forEach(item => {
      const id = item.productId || item.id || "unknown";
      const name = item.name || id;
      const qty  = Number(item.qty || 0);
      const val  = Number(item.lineTotal || (item.unitPriceFinal * qty) || 0);

      if (prodMap.has(id)) {
        prodMap.get(id).qty   += qty;
        prodMap.get(id).value += val;
      } else {
        prodMap.set(id, { name, qty, value: val });
      }
    });
  });

  const sorted = [...prodMap.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.qty - a.qty);

  if (!sorted.length) {
    productsList.innerHTML = `<div class="empty">Niciun produs în această perioadă.</div>`;
    return;
  }

  const maxQty = sorted[0].qty;
  productsList.innerHTML = "";

  sorted.forEach((p, i) => {
    const pct = maxQty ? Math.round(p.qty / maxQty * 100) : 0;
    productsList.innerHTML += `
      <div class="report-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="report-row-rank">${i + 1}</div>
          <div class="report-row-info">
            <div class="report-row-name">${escapeHtml(p.name)}</div>
            <div class="report-row-sub">Valoare totală: ${fmtMoney(p.value)} RON</div>
          </div>
          <div class="report-row-value">
            <div class="report-row-val-main">${p.qty} buc</div>
          </div>
        </div>
        <div class="progress-bar" style="margin-left:36px;">
          <div class="progress-fill" style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  });
}

/* ============================
   RENDER: CLIENȚI
============================ */
function renderClients() {
  if (!clientsList) return;

  const clientMap = new Map(); // clientId -> {name, phone, total, count}

  _allOrders.forEach(o => {
    if (o.status === "CANCELED") return;
    const id   = o.clientId || o.clientSnapshot?.uid || "unknown";
    const snap = o.clientSnapshot || {};
    const name = snap.fullName || snap.phone || "—";
    const phone= snap.phone || "";
    const val  = Number(o.total || 0);

    if (clientMap.has(id)) {
      clientMap.get(id).total += val;
      clientMap.get(id).count += 1;
    } else {
      clientMap.set(id, { name, phone, total: val, count: 1 });
    }
  });

  const sorted = [...clientMap.values()].sort((a, b) => b.total - a.total);

  if (!sorted.length) {
    clientsList.innerHTML = `<div class="empty">Niciun client în această perioadă.</div>`;
    return;
  }

  const maxVal = sorted[0].total;
  clientsList.innerHTML = "";

  sorted.forEach((c, i) => {
    const pct = maxVal ? Math.round(c.total / maxVal * 100) : 0;
    const avg = c.count ? c.total / c.count : 0;

    clientsList.innerHTML += `
      <div class="report-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="report-row-rank">${i + 1}</div>
          <div class="report-row-info">
            <div class="report-row-name">${escapeHtml(c.name)}</div>
            <div class="report-row-sub">${escapeHtml(c.phone)} &nbsp;·&nbsp; ${c.count} comenzi &nbsp;·&nbsp; avg ${fmtMoney(avg)} RON</div>
          </div>
          <div class="report-row-value">
            <div class="report-row-val-main">${fmtMoney(c.total)} RON</div>
          </div>
        </div>
        <div class="progress-bar" style="margin-left:36px;">
          <div class="progress-fill" style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  });
}

/* ============================
   RENDER: AFILIAȚI
============================ */
function renderAffiliates() {
  if (!affiliatesList) return;

  // Construim mapa afiliat -> clienți recrutați -> comenzi/valoare
  const affMap = new Map(); // referrerUid -> {name, phone, clients: Set, total, count}

  _allOrders.forEach(o => {
    if (o.status === "CANCELED") return;
    const clientId = o.clientId || o.clientSnapshot?.uid;
    if (!clientId) return;

    const userData = _allUsers.get(clientId);
    const referrerUid = userData?.referrerUid;
    if (!referrerUid) return;

    const referrerData = _allUsers.get(referrerUid);
    const refName  = referrerData?.contact?.fullName || referrerData?.phone || referrerUid;
    const refPhone = referrerData?.phone || "";
    const val = Number(o.total || 0);

    if (affMap.has(referrerUid)) {
      const entry = affMap.get(referrerUid);
      entry.total += val;
      entry.count += 1;
      entry.clients.add(clientId);
    } else {
      affMap.set(referrerUid, {
        name: refName, phone: refPhone,
        clients: new Set([clientId]),
        total: val, count: 1
      });
    }
  });

  const sorted = [...affMap.entries()]
    .map(([uid, d]) => ({ uid, ...d, clientCount: d.clients.size }))
    .sort((a, b) => b.total - a.total);

  if (!sorted.length) {
    affiliatesList.innerHTML = `<div class="empty">Niciun afiliat cu comenzi în această perioadă.</div>`;
    return;
  }

  const maxVal = sorted[0].total;
  affiliatesList.innerHTML = "";

  sorted.forEach((a, i) => {
    const pct = maxVal ? Math.round(a.total / maxVal * 100) : 0;
    const avg = a.count ? a.total / a.count : 0;

    affiliatesList.innerHTML += `
      <div class="report-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="report-row-rank">${i + 1}</div>
          <div class="report-row-info">
            <div class="report-row-name">${escapeHtml(a.name)}</div>
            <div class="report-row-sub">
              ${escapeHtml(a.phone)} &nbsp;·&nbsp;
              ${a.clientCount} clienți recrutați &nbsp;·&nbsp;
              ${a.count} comenzi &nbsp;·&nbsp;
              avg ${fmtMoney(avg)} RON
            </div>
          </div>
          <div class="report-row-value">
            <div class="report-row-val-main">${fmtMoney(a.total)} RON</div>
            <div class="report-row-val-sub">${a.clientCount} clienți</div>
          </div>
        </div>
        <div class="progress-bar" style="margin-left:36px;">
          <div class="progress-fill" style="width:${pct}%; background: linear-gradient(90deg, var(--warn), var(--ok));"></div>
        </div>
      </div>
    `;
  });
}

/* ============================
   AUTH + INIT
============================ */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await getIdToken(user, true);
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.data()?.role !== "admin") return;

    await loadUsers();
    await loadReport();
  } catch (e) {
    console.error(e);
  }
});
