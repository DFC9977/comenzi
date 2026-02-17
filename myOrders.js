import { auth, db } from "./firebase.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
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

/* =========================
   Helpers
========================= */

function formatMoney(v) {
  return Number(v || 0).toLocaleString("ro-RO");
}

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("ro-RO");
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripEmoji(s) {
  try {
    return String(s || "").replace(/[\p{Extended_Pictographic}]/gu, "").trim();
  } catch {
    return String(s || "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").trim();
  }
}

function setNote(msg) {
  if (!noteEl) return;
  noteEl.textContent = msg || "";
}

/* =========================
   Orders
========================= */

function render() {
  const filter = filterEl.value;
  const items = ordersData
    .filter((o) => (filter === "ALL" ? true : o.status === filter))
    .sort((a, b) => {
      const aa = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bb - aa;
    });

  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = "<div class='muted'>Nu există comenzi.</div>";
    return;
  }

  items.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";

    card.innerHTML = `
      <div><b>Comanda #${order.orderNumber || "-"}</b></div>
      <div class="muted">Status: <b>${escapeHtml(order.status || "-")}</b></div>
      <div class="muted">Data: ${escapeHtml(formatDate(order.createdAt))}</div>
      <div style="margin-top:6px;">Total: <b>${escapeHtml(formatMoney(order.total))} RON</b></div>
      <div class="btns">
        <button class="btnChat" type="button">Chat</button>
      </div>
    `;

    card.querySelector(".btnChat").onclick = () => openChat(order);

    listEl.appendChild(card);
  });
}

function loadOrders(uid) {
  if (_unsubOrders) {
    try { _unsubOrders(); } catch {}
  }

  // Avoid composite index requirements: no orderBy in query; we sort in UI
  const q = query(collection(db, "orders"), where("clientId", "==", uid));

  _unsubOrders = onSnapshot(
    q,
    (snap) => {
      ordersData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNote(ordersData.length ? "" : "Nu ai comenzi încă.");
      render();
    },
    (err) => {
      console.error(err);
      setNote(err?.message || "Eroare la încărcarea comenzilor.");
    }
  );
}

/* =========================
   Chat
========================= */

function openChat(order) {
  closeChat();

  _chatOrder = order;
  chatTitle.textContent = `Chat • #${order?.orderNumber || "-"}`;
  chatBody.innerHTML = "<div class='muted'>Se încarcă…</div>";

  overlay.style.display = "block";
  sheet.classList.add("open");
  document.body.classList.add("chat-open");

  const q = query(
    collection(db, "orders", order.id, "messages"),
    orderBy("createdAt", "asc")
  );

  _unsubChat = onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderChat(msgs);
    },
    (err) => {
      console.error(err);
      chatBody.innerHTML = `<div class='muted'>Eroare: ${escapeHtml(err?.message || "unknown")}</div>`;
    }
  );
}

function closeChat() {
  overlay.style.display = "none";
  sheet.classList.remove("open");
  document.body.classList.remove("chat-open");

  if (_unsubChat) {
    try { _unsubChat(); } catch {}
  }
  _unsubChat = null;
  _chatOrder = null;
}

function renderChat(msgs) {
  chatBody.innerHTML = "";
  if (!msgs.length) {
    chatBody.innerHTML = "<div class='muted'>Nu există mesaje încă. Scrie primul mesaj.</div>";
    return;
  }

  const me = auth.currentUser?.uid || "";

  msgs.forEach((m) => {
    const row = document.createElement("div");
    const mine = String(m.fromUid || "") === me;
    row.className = mine ? "msg me" : "msg";

    const when = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("ro-RO") : "";
    const who = m.fromRole === "admin" ? "Admin" : "Tu";

    row.innerHTML = `
      <div class="meta">${escapeHtml(who)} • ${escapeHtml(when)}</div>
      <div class="txt">${escapeHtml(String(m.text || ""))}</div>
    `;

    chatBody.appendChild(row);
  });

  chatBody.scrollTop = chatBody.scrollHeight;
}

async function sendMessage() {
  if (!_chatOrder) return;
  const raw = String(chatInput.value || "");
  const text = stripEmoji(raw);
  if (!text) return;

  chatInput.value = "";

  await addDoc(collection(db, "orders", _chatOrder.id, "messages"), {
    text,
    fromUid: auth.currentUser?.uid || null,
    fromRole: "client",
    createdAt: serverTimestamp()
  });
}

/* =========================
   Events
========================= */

filterEl.addEventListener("change", render);
refreshBtn.addEventListener("click", render);

overlay.addEventListener("click", closeChat);
btnClose.addEventListener("click", closeChat);
btnSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

/* =========================
   Init
========================= */

function boot() {
  const user = auth.currentUser;
  if (!user) {
    setNote("Trebuie să fii autentificat.");
    listEl.innerHTML = "";
    return;
  }
  loadOrders(user.uid);
}

// firebase-auth already initialized in firebase.js; auth.currentUser may be delayed.
// Simple polling (safe) – avoids importing onAuthStateChanged here.
let tries = 0;
const t = setInterval(() => {
  tries++;
  if (auth.currentUser) {
    clearInterval(t);
    boot();
  }
  if (tries > 50) {
    clearInterval(t);
    boot();
  }
}, 100);
