import { auth, db } from "./js/firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const listEl = document.getElementById("ordersList");
const filterEl = document.getElementById("filterStatus");
const refreshBtn = document.getElementById("refreshBtn");
const noteEl = document.getElementById("note");

const overlay = document.getElementById("chatOverlay");
const sheet = document.getElementById("chatSheet");
const chatTitle = document.getElementById("chatTitle");
const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const btnClose = document.getElementById("chatClose");
const btnSend = document.getElementById("chatSend");

let ordersData = [];
let _unsubOrders = null;
let _unsubChat = null;
let _chatOrder = null;

// UID trimis din app.js prin URL (?uid=xxx) — fallback dacă Auth e lent în iframe
const _uidFromUrl = new URLSearchParams(location.search).get("uid") || "";

function formatMoney(v) { return Number(v || 0).toLocaleString("ro-RO"); }
function formatDate(ts) { if (!ts?.toDate) return ""; return ts.toDate().toLocaleString("ro-RO"); }
function escapeHtml(s) {
  return String(s || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function stripEmoji(s) {
  try { return String(s || "").replace(/[\p{Extended_Pictographic}]/gu, "").trim(); }
  catch { return String(s || "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").trim(); }
}
function setNote(msg) { if (noteEl) noteEl.textContent = msg || ""; }

// Badge listeners per comandă
const _badgeUnsubs = new Map();

function stopAllBadgeListeners() {
  _badgeUnsubs.forEach(unsub => { try { unsub(); } catch {} });
  _badgeUnsubs.clear();
}

function listenChatBadge(orderId, badgeEl) {
  if (_badgeUnsubs.has(orderId)) { try { _badgeUnsubs.get(orderId)(); } catch {} }
  const q = query(collection(db, "orders", orderId, "messages"), orderBy("createdAt", "asc"));
  const unsub = onSnapshot(q, (snap) => {
    const me = auth.currentUser?.uid || "";
    const unread = snap.docs.filter(d => {
      const data = d.data();
      return data.fromRole === "admin" && data.fromUid !== me && !data.readByClient;
    }).length;
    if (badgeEl) {
      badgeEl.textContent = String(unread);
      badgeEl.style.display = unread > 0 ? "inline-flex" : "none";
    }
  }, () => {});
  _badgeUnsubs.set(orderId, unsub);
}

function renderOrderItems(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const rows = items.map(it => {
    const name = escapeHtml(String(it.name || it.productId || "—"));
    const qty  = Number(it.qty || 0);
    const unit = Number(it.unitPriceFinal ?? it.unit ?? 0);
    const line = Number(it.lineTotal ?? (unit * qty));
    return `<div class="order-item-row">
        <span class="order-item-name">${name}</span>
        <span class="order-item-qty">${qty} buc</span>
        <span class="order-item-val">${formatMoney(line)} RON</span>
      </div>`;
  }).join("");
  return `<div class="order-items">${rows}</div>`;
}

function render() {
  stopAllBadgeListeners();
  const filter = filterEl.value;
  const items = ordersData
    .filter((o) => filter === "ALL" ? true : o.status === filter)
    .sort((a, b) => {
      const aa = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bb - aa;
    });
  listEl.innerHTML = "";
  if (!items.length) { listEl.innerHTML = "<div class='muted'>Nu există comenzi.</div>"; return; }

  const statusColors = {
    NEW: "#4da3ff", CONFIRMED: "#35d07f", SENT: "#f5a623",
    DELIVERED: "#9fb0c3", CANCELED: "#ff5d5d"
  };

  items.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";
    const canEdit = order.status === "NEW";
    const statusColor = statusColors[order.status || "NEW"] || "#4da3ff";

    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <div class="order-num">Comanda #${order.orderNumber || "—"}</div>
          <div class="order-date">${escapeHtml(formatDate(order.createdAt))}</div>
        </div>
        <span class="order-status-badge" style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55;">
          ${escapeHtml(order.status || "NEW")}
        </span>
      </div>
      ${renderOrderItems(order.items)}
      <div class="order-total">
        <span class="order-total-label">Total comandă</span>
        <span class="order-total-val">${formatMoney(order.total)} RON</span>
      </div>
      <div class="order-btns">
        <button class="btnChat order-btn" type="button" style="position:relative;overflow:visible;">
          💬 Chat
          <span class="chatBadge" style="position:absolute;top:-8px;right:-8px;background:#ff5d5d;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:900;display:none;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 0 2px #0b0f14;"></span>
        </button>
        ${canEdit
          ? `<button class="btnEdit order-btn" type="button">✏️ Modifică</button>`
          : `<button class="order-btn" disabled style="opacity:.35;cursor:not-allowed;">✏️ Modifică</button>`
        }
      </div>
    `;

    const badgeEl = card.querySelector(".chatBadge");
    listenChatBadge(order.id, badgeEl);
    card.querySelector(".btnChat").onclick = () => openChat(order);
    if (canEdit) card.querySelector(".btnEdit").onclick = () => editOrder(order);
    listEl.appendChild(card);
  });
}


function loadOrders(uid) {
  if (_unsubOrders) { try { _unsubOrders(); } catch {} }
  const q = query(collection(db, "orders"), where("clientId", "==", uid));
  _unsubOrders = onSnapshot(q,
    (snap) => {
      ordersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNote(ordersData.length ? "" : "Nu ai comenzi încă.");
      render();
    },
    (err) => { console.error(err); setNote(err?.message || "Eroare la încărcarea comenzilor."); }
  );
}

function openChat(order) {
  closeChat();
  _chatOrder = order;
  chatTitle.textContent = `Chat • #${order?.orderNumber || "-"}`;
  chatBody.innerHTML = "<div class='muted'>Se încarcă…</div>";
  overlay.style.display = "block";
  sheet.classList.add("open");
  document.body.classList.add("chat-open");
  const q = query(collection(db, "orders", order.id, "messages"), orderBy("createdAt", "asc"));
  _unsubChat = onSnapshot(q,
    (snap) => { renderChat(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))); },
    (err) => { console.error(err); chatBody.innerHTML = `<div class='muted'>Eroare: ${escapeHtml(err?.message || "")}</div>`; }
  );
}

function closeChat() {
  overlay.style.display = "none";
  sheet.classList.remove("open");
  document.body.classList.remove("chat-open");
  if (_unsubChat) { try { _unsubChat(); } catch {} }
  _unsubChat = null; _chatOrder = null;
}

function renderChat(msgs) {
  chatBody.innerHTML = "";
  if (!msgs.length) { chatBody.innerHTML = "<div class='muted'>Nu există mesaje. Scrie primul mesaj.</div>"; return; }
  const me = auth.currentUser?.uid || "";
  msgs.forEach((m) => {
    const row = document.createElement("div");
    row.className = String(m.fromUid || "") === me ? "msg me" : "msg";
    const when = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("ro-RO") : "";
    const who = m.fromRole === "admin" ? "Admin" : "Tu";
    row.innerHTML = `<div class="meta">${escapeHtml(who)} • ${escapeHtml(when)}</div><div class="txt">${escapeHtml(String(m.text || ""))}</div>`;
    chatBody.appendChild(row);
  });
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function editOrder(order) {
  // Clear any previous editing state first
  sessionStorage.removeItem('editingOrderId');
  sessionStorage.removeItem('editingOrderNumber');

  if (!confirm(`Vrei să modifici comanda #${order.orderNumber || ""}?\n\nProdusele din comandă vor fi încărcate în coș și vei putea edita cantitățile.`)) {
    return;
  }

  try {
    // Load cart module dynamically
    const { clearCart, setQuantity } = await import('./js/cart.js');

    // Clear current cart
    await clearCart();

    // Load order items into cart
    for (const item of order.items || []) {
      if (item.productId && item.qty > 0) {
        setQuantity(item.productId, item.qty);
      }
    }

    // Trigger cart update event manually
    window.dispatchEvent(new CustomEvent('cart:updated'));

    // Store order ID for update
    sessionStorage.setItem('editingOrderId', order.id);
    sessionStorage.setItem('editingOrderNumber', order.orderNumber || '');

    // Wait a bit to ensure localStorage is saved
    await new Promise(resolve => setTimeout(resolve, 100));

    // Navigate to catalog (parent window)
    alert(`Comanda #${order.orderNumber} a fost încărcată în coș.\n\nProdusele au fost încărcate în coș. Modifică cantitățile și trimite comanda din nou.`);
    
    // Signal parent to show catalog
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'showCatalog' }, '*');
    }
  } catch (e) {
    console.error(e);
    alert(e?.message || "Eroare la încărcarea comenzii.");
  }
}

async function sendMessage() {
  if (!_chatOrder) return;
  const text = stripEmoji(String(chatInput.value || ""));
  if (!text) return;
  chatInput.value = "";
  try {
    await addDoc(collection(db, "orders", _chatOrder.id, "messages"), {
      text, fromUid: auth.currentUser?.uid || null, fromRole: "client", createdAt: serverTimestamp()
    });
  } catch (e) { console.error(e); alert(e?.message || "Eroare."); }
}

filterEl.addEventListener("change", render);
refreshBtn.addEventListener("click", render);
overlay.addEventListener("click", closeChat);
btnClose.addEventListener("click", closeChat);
btnSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

/* =========================
   Init — UID din URL imediat + onAuthStateChanged ca backup
========================= */

let _started = false;

function startWithUid(uid) {
  if (_started) return;
  _started = true;
  loadOrders(uid);
}

// Dacă avem UID din URL, pornim imediat (nu așteptăm Auth în iframe)
if (_uidFromUrl) {
  startWithUid(_uidFromUrl);
}

// onAuthStateChanged ca backup / confirmare
onAuthStateChanged(auth, (user) => {
  if (user?.uid) {
    startWithUid(user.uid);
  } else if (!_uidFromUrl) {
    setNote("Trebuie să fii autentificat.");
    listEl.innerHTML = "";
  }
});