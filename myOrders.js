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
  deleteDoc,
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

function render() {
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
  items.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";
    
    const canEdit = order.status === "NEW";
    
    card.innerHTML = `
      <div><b>Comanda #${order.orderNumber || "-"}</b></div>
      <div class="muted">Status: <b>${escapeHtml(order.status || "-")}</b></div>
      <div class="muted">Data: ${escapeHtml(formatDate(order.createdAt))}</div>
      <div style="margin-top:6px;">Total: <b>${escapeHtml(formatMoney(order.total))} RON</b></div>
      <div class="btns">
        <button class="btnChat" type="button">Chat</button>
        ${canEdit ? '<button class="btnEdit" type="button">Modifică comanda</button>' : ''}
      </div>
    `;
    
    card.querySelector(".btnChat").onclick = () => openChat(order);
    
    if (canEdit) {
      card.querySelector(".btnEdit").onclick = () => editOrder(order);
    }
    
    listEl.appendChild(card);
  });
}

async function editOrder(order) {
  if (!confirm(`Vrei să modifici comanda #${order.orderNumber}?\n\nProdusele din comandă vor fi încărcate în coș și vei putea edita cantitățile.`)) {
    return;
  }

  try {
    // Load cart module dynamically
    const { clearCart, setQuantity } = await import('./js/cart.js');

    // Clear current cart
    await clearCart();

    // Load order items into cart
    const items = order.items || [];
    for (const item of items) {
      setQuantity(item.productId, item.qty);
    }

    // Delete old order (client can only delete NEW orders - enforced by Firestore rules)
    await deleteDoc(doc(db, "orders", order.id));

    // Redirect to catalog
    alert(`Comanda #${order.orderNumber} a fost ștearsă.\n\nProdusele au fost încărcate în coș. Modifică cantitățile și trimite din nou comanda.`);
    
    // Redirect to parent catalog
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: "showCatalog" }, "*");
    } else {
      window.location.href = "/";
    }
  } catch (e) {
    console.error(e);
    alert(e?.message || "Eroare la modificarea comenzii.");
  }
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