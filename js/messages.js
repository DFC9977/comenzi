// js/messages.js — Chat centralizat admin
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  getIdToken,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ============================
   STATE
============================ */
let _adminUid = null;
let _conversations = [];   // [{orderId, orderNumber, clientName, clientPhone, lastMsg, lastTime, unread}]
let _activeOrderId = null;
let _unsubMessages = null;
let _unsubOrders = null;
let _searchTerm = "";

/* ============================
   DOM
============================ */
const convItems   = document.getElementById("convItems");
const convSearch  = document.getElementById("convSearch");
const totalUnread = document.getElementById("totalUnread");
const adminInfo   = document.getElementById("adminInfo");

const chatEmpty      = document.getElementById("chatEmpty");
const chatActive     = document.getElementById("chatActive");
const chatHeaderName = document.getElementById("chatHeaderName");
const chatHeaderSub  = document.getElementById("chatHeaderSub");
const chatBody       = document.getElementById("chatBody");
const chatInput      = document.getElementById("chatInput");
const chatSend       = document.getElementById("chatSend");
const btnBack        = document.getElementById("btnBack");
const convList       = document.getElementById("convList");
const chatPanel      = document.getElementById("chatPanel");

/* ============================
   HELPERS
============================ */
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

function timeAgo(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "acum";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

function formatTime(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("ro-RO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function initials(name) {
  const parts = String(name || "?").trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : String(name || "?")[0].toUpperCase();
}

/* ============================
   MOBILE: back button
============================ */
btnBack?.addEventListener("click", () => {
  convList?.classList.remove("hidden-mobile");
  chatPanel?.classList.add("hidden-mobile");
  _activeOrderId = null;
  stopMessagesListener();
});

/* ============================
   SEARCH
============================ */
convSearch?.addEventListener("input", () => {
  _searchTerm = convSearch.value.trim().toLowerCase();
  renderConvList();
});

/* ============================
   LOAD ORDERS + LISTEN
============================ */
function stopOrdersListener() {
  if (_unsubOrders) { try { _unsubOrders(); } catch {} }
  _unsubOrders = null;
}

function stopMessagesListener() {
  if (_unsubMessages) { try { _unsubMessages(); } catch {} }
  _unsubMessages = null;
}

function loadConversations() {
  stopOrdersListener();
  convItems.innerHTML = `<div class="loading">Se încarcă…</div>`;

  const q = query(collection(db, "orders"), orderBy("updatedAt", "desc"));

  _unsubOrders = onSnapshot(q, async (snap) => {
    // Pentru fiecare comandă, citim câte mesaje necitite de la client există
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Construim conversațiile cu nr. mesaje necitite
    const convPromises = orders.map(async (order) => {
      const msgsSnap = await getDocs(
        query(
          collection(db, "orders", order.id, "messages"),
          orderBy("createdAt", "desc")
        )
      );

      const msgs = msgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const unread = msgs.filter(m => m.fromRole === "client" && !m.readByAdmin).length;
      const lastMsg = msgs[0] || null;

      const client = order.clientSnapshot || {};
      const clientName = client.fullName || client.phone || "Client necunoscut";

      return {
        orderId: order.id,
        orderNumber: order.orderNumber || "—",
        orderStatus: order.status || "NEW",
        clientName,
        clientPhone: client.phone || "",
        clientUid: client.uid || order.clientId || "",
        lastMsg: lastMsg?.text || "",
        lastTime: lastMsg?.createdAt || order.updatedAt || null,
        unread,
      };
    });

    _conversations = await Promise.all(convPromises);
    renderConvList();
    updateTotalBadge();
  }, (err) => {
    console.error(err);
    convItems.innerHTML = `<div class="loading" style="color:#ff5d5d;">Eroare: ${escapeHtml(err?.message || "")}</div>`;
  });
}

/* ============================
   RENDER LISTA CONVERSATII
============================ */
function renderConvList() {
  const filtered = _conversations.filter(c => {
    if (!_searchTerm) return true;
    return (
      c.clientName.toLowerCase().includes(_searchTerm) ||
      c.clientPhone.toLowerCase().includes(_searchTerm) ||
      String(c.orderNumber).includes(_searchTerm)
    );
  });

  convItems.innerHTML = "";

  if (!filtered.length) {
    convItems.innerHTML = `<div class="loading">Nicio conversație găsită.</div>`;
    return;
  }

  filtered.forEach(conv => {
    const item = document.createElement("div");
    item.className = `conv-item${conv.orderId === _activeOrderId ? " active" : ""}${conv.unread > 0 ? " has-unread" : ""}`;

    const initStr = initials(conv.clientName);
    const statusColors = {
      NEW: "#4da3ff", CONFIRMED: "#35d07f", SENT: "#f5a623",
      DELIVERED: "#9fb0c3", CANCELED: "#ff5d5d"
    };
    const statusColor = statusColors[conv.orderStatus] || "#4da3ff";

    item.innerHTML = `
      <div class="conv-avatar">${escapeHtml(initStr)}</div>
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(conv.clientName)}</div>
        <div class="conv-sub">
          <span style="color:${statusColor}; font-weight:700;">#${conv.orderNumber}</span>
          ${conv.lastMsg ? ` · ${escapeHtml(conv.lastMsg.slice(0, 40))}${conv.lastMsg.length > 40 ? "…" : ""}` : " · Niciun mesaj"}
        </div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${timeAgo(conv.lastTime)}</span>
        ${conv.unread > 0 ? `<span class="conv-badge">${conv.unread}</span>` : ""}
      </div>
    `;

    item.addEventListener("click", () => openConversation(conv));
    convItems.appendChild(item);
  });
}

/* ============================
   BADGE TOTAL UNREAD
============================ */
function updateTotalBadge() {
  const total = _conversations.reduce((s, c) => s + c.unread, 0);
  if (totalUnread) {
    totalUnread.textContent = String(total);
    totalUnread.style.display = total > 0 ? "inline-flex" : "none";
  }

  // Trimite badge și la parent (dacă e în iframe)
  try {
    window.parent.postMessage({ action: "messagesUnread", count: total }, "*");
  } catch {}
}

/* ============================
   DESCHIDE CONVERSATIE
============================ */
function openConversation(conv) {
  _activeOrderId = conv.orderId;

  // Mobile: ascunde lista, arată chat-ul
  convList?.classList.add("hidden-mobile");
  chatPanel?.classList.remove("hidden-mobile");

  // Update header
  if (chatHeaderName) chatHeaderName.textContent = conv.clientName;
  if (chatHeaderSub) chatHeaderSub.textContent = `Comanda #${conv.orderNumber} · ${conv.clientPhone}`;

  // Show chat panel
  if (chatEmpty) chatEmpty.style.display = "none";
  if (chatActive) {
    chatActive.style.display = "flex";
    chatActive.style.flexDirection = "column";
    chatActive.style.flex = "1";
    chatActive.style.overflow = "hidden";
  }

  // Highlight conv item
  document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
  const items = document.querySelectorAll(".conv-item");
  items.forEach(el => {
    if (el.querySelector(".conv-sub span")?.textContent?.includes(`#${conv.orderNumber}`)) {
      el.classList.add("active");
    }
  });

  stopMessagesListener();
  listenMessages(conv.orderId);
}

/* ============================
   LISTEN MESSAGES
============================ */
function listenMessages(orderId) {
  if (chatBody) chatBody.innerHTML = `<div class="loading">Se încarcă mesajele…</div>`;

  const q = query(
    collection(db, "orders", orderId, "messages"),
    orderBy("createdAt", "asc")
  );

  _unsubMessages = onSnapshot(q, async (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(msgs);

    // Marchează mesajele clientului ca citite de admin
    const unreadDocs = snap.docs.filter(d => {
      const data = d.data();
      return data.fromRole === "client" && !data.readByAdmin;
    });

    if (unreadDocs.length > 0) {
      const batch = writeBatch(db);
      unreadDocs.forEach(d => {
        batch.update(doc(db, "orders", orderId, "messages", d.id), {
          readByAdmin: true
        });
      });
      try {
        await batch.commit();
      } catch (e) {
        console.warn("Batch readByAdmin failed:", e);
      }
    }
  }, (err) => {
    console.error(err);
    if (chatBody) chatBody.innerHTML = `<div class="loading" style="color:#ff5d5d;">Eroare: ${escapeHtml(err?.message || "")}</div>`;
  });
}

/* ============================
   RENDER MESAJE
============================ */
function renderMessages(msgs) {
  if (!chatBody) return;
  chatBody.innerHTML = "";

  if (!msgs.length) {
    chatBody.innerHTML = `<div class="loading">Niciun mesaj încă. Fii primul!</div>`;
    return;
  }

  msgs.forEach(m => {
    if (m.system) {
      const row = document.createElement("div");
      row.className = "msg-row";
      row.innerHTML = `<div class="msg-bubble system">${escapeHtml(String(m.text || ""))}</div>`;
      chatBody.appendChild(row);
      return;
    }

    const isAdmin = m.fromRole === "admin" || m.fromUid === _adminUid;
    const row = document.createElement("div");
    row.className = `msg-row ${isAdmin ? "mine" : "theirs"}`;

    const who = isAdmin ? "Tu (Admin)" : "Client";
    const when = formatTime(m.createdAt);

    row.innerHTML = `
      <div class="msg-bubble">${escapeHtml(String(m.text || ""))}</div>
      <div class="msg-meta">${escapeHtml(who)} · ${escapeHtml(when)}</div>
    `;
    chatBody.appendChild(row);
  });

  // Scroll la ultimul mesaj
  chatBody.scrollTop = chatBody.scrollHeight;
}

/* ============================
   TRIMITE MESAJ
============================ */
async function sendMessage() {
  if (!_activeOrderId || !chatInput) return;
  const raw = chatInput.value.trim();
  const text = stripEmoji(raw);
  if (!text) return;

  chatInput.value = "";
  chatInput.style.height = "auto";

  try {
    await addDoc(collection(db, "orders", _activeOrderId, "messages"), {
      text,
      fromUid: _adminUid,
      fromRole: "admin",
      createdAt: serverTimestamp(),
      readByAdmin: true,
    });

    // Update updatedAt pe comandă pentru sorting
    await updateDoc(doc(db, "orders", _activeOrderId), {
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    alert(e?.message || "Eroare la trimitere.");
  }
}

chatSend?.addEventListener("click", sendMessage);
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput?.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

/* ============================
   AUTH + INIT
============================ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    convItems.innerHTML = `<div class="loading" style="color:#ff5d5d;">Nu ești autentificat. Reautentifică-te din aplicație.</div>`;
    return;
  }

  try {
    await getIdToken(user, true);
  } catch (e) {
    console.warn("getIdToken failed:", e);
  }

  _adminUid = user.uid;

  // Verifică că e admin
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : null;

  if (data?.role !== "admin") {
    convItems.innerHTML = `<div class="loading" style="color:#ff5d5d;">Acces interzis. Nu ești admin.</div>`;
    return;
  }

  const phone = (user.email || "").replace("@phone.local", "");
  if (adminInfo) adminInfo.textContent = phone || user.uid;

  loadConversations();
});
