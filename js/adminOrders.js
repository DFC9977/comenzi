// js/adminOrders.js (FULL - status + chat + WhatsApp + PDF)

import { auth, db } from "./firebase.js";
import { exportOrderPDFA4_PRO } from "./pdf-export.js";

import {
  onAuthStateChanged,
  getIdToken
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   DOM
========================= */

const listEl = document.getElementById("ordersList");
const filterEl = document.getElementById("filterStatus");
const refreshBtn = document.getElementById("refreshBtn");

let ordersData = [];
let _unsubOrders = null;

let _unsubChat = null;
let _chatOrderId = null;

/* =========================
   Helpers
========================= */

function setTopMessage(html) {
  // afișăm mesajele de stare chiar în listă dacă există
  if (!listEl) return;
  listEl.innerHTML = `<div style="opacity:.92; padding:10px; border:1px solid rgba(255,255,255,.10); border-radius:12px; background:rgba(255,255,255,.03);">${html}</div>`;
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString("ro-RO");
}

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("ro-RO");
}

function safePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

// best-effort: remove emoji
function stripEmoji(s) {
  try {
    return String(s || "")
      .replace(/[\p{Extended_Pictographic}]/gu, "")
      .trim();
  } catch {
    return String(s || "")
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      .trim();
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusOptionsHtml(current) {
  const STATUSES = ["NEW", "CONFIRMED", "SENT", "DELIVERED", "CANCELED"];
  const cur = current || "NEW";
  return STATUSES.map(
    (s) => `<option value="${s}" ${s === cur ? "selected" : ""}>${s}</option>`
  ).join("");
}

/* =========================
   Chat sheet (admin <-> client) on orders/{orderId}/messages
========================= */

function ensureChatSheetOnce() {
  if (document.getElementById("chatSheet")) return;

  const style = document.createElement("style");
  style.id = "chatSheetCss";
  style.textContent = `
    #chatOverlay{
      position:fixed; inset:0; background:rgba(0,0,0,.55);
      display:none; z-index:9998;
    }
    #chatSheet{
      position:fixed; left:0; right:0; bottom:0;
      transform:translateY(110%);
      transition:transform .22s ease;
      z-index:9999;
      background:rgba(10,12,16,.92);
      border-top:1px solid rgba(255,255,255,.12);
      border-radius:16px 16px 0 0;
      backdrop-filter:blur(10px);
      padding:12px;
    }
    #chatSheet.open{ transform:translateY(0); }

    #chatHeader{
      display:flex; align-items:center; justify-content:space-between;
      gap:10px; margin-bottom:10px;
    }
    #chatHeader .title{ font-weight:900; font-size:14px; color:#fff; }
    #chatClose{
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.08);
      color:#fff;
      border-radius:12px;
      padding:8px 10px;
      font-weight:900;
      cursor:pointer;
      flex:0 0 auto;
    }

    #chatBody{
      max-height:55vh;
      overflow:auto;
      -webkit-overflow-scrolling:touch;
      padding-right:4px;
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .msg{
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
      border-radius:12px;
      padding:10px;
    }
    .msg.me{ border-color: rgba(120,200,255,.22); }
    .msg .meta{ font-size:11px; opacity:.75; margin-bottom:4px; color:#fff; }
    .msg .txt{ white-space:pre-wrap; word-break:break-word; color:#fff; }

    #chatComposer{
      display:flex; gap:8px; margin-top:10px;
    }
    #chatInput{
      flex:1;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.06);
      color:#fff;
      padding:10px;
      outline:none;
    }
    #chatSend{
      border-radius:12px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.10);
      color:#fff;
      font-weight:900;
      padding:10px 12px;
      cursor:pointer;
      flex:0 0 auto;
    }
    body.chat-open{ overflow:hidden; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "chatOverlay";
  overlay.addEventListener("click", closeChat);

  const sheet = document.createElement("div");
  sheet.id = "chatSheet";
  sheet.innerHTML = `
    <div id="chatHeader">
      <div class="title" id="chatTitle">Chat</div>
      <button id="chatClose" type="button">Închide</button>
    </div>
    <div id="chatBody"></div>
    <div id="chatComposer">
      <input id="chatInput" type="text" placeholder="Scrie mesaj (fără emoji)…" maxlength="500" />
      <button id="chatSend" type="button">Trimite</button>
    </div>
  `;

  sheet.querySelector("#chatClose").addEventListener("click", closeChat);
  sheet.querySelector("#chatSend").addEventListener("click", sendChatMessage);
  sheet.querySelector("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
}

function openChat(order) {
  ensureChatSheetOnce();
  closeChat();

  _chatOrderId = order?.id || null;
  if (!_chatOrderId) return;

  const overlay = document.getElementById("chatOverlay");
  const sheet = document.getElementById("chatSheet");
  const title = document.getElementById("chatTitle");
  const body = document.getElementById("chatBody");

  if (!overlay || !sheet || !title || !body) return;

  const clientName =
    order?.clientSnapshot?.fullName ||
    order?.clientSnapshot?.phone ||
    "Client";

  title.textContent = `Chat • #${order?.orderNumber || "-"} • ${clientName}`;
  body.innerHTML = "<div style='opacity:.8; color:#fff;'>Se încarcă…</div>";

  overlay.style.display = "block";
  sheet.classList.add("open");
  document.body.classList.add("chat-open");

  const q = query(
    collection(db, "orders", _chatOrderId, "messages"),
    orderBy("createdAt", "asc")
  );

  _unsubChat = onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderChatMessages(msgs);
    },
    (err) => {
      console.error("Chat onSnapshot error:", err);
      body.innerHTML = `<div style="opacity:.85; color:#fff;">Eroare chat: ${escapeHtml(err?.message || "")}</div>`;
    }
  );
}

function closeChat() {
  const overlay = document.getElementById("chatOverlay");
  const sheet = document.getElementById("chatSheet");
  if (overlay) overlay.style.display = "none";
  if (sheet) sheet.classList.remove("open");
  document.body.classList.remove("chat-open");

  if (_unsubChat) {
    try { _unsubChat(); } catch {}
  }
  _unsubChat = null;
  _chatOrderId = null;
}

function renderChatMessages(msgs) {
  const body = document.getElementById("chatBody");
  if (!body) return;

  body.innerHTML = "";
  if (!msgs.length) {
    body.innerHTML = "<div style='opacity:.8; color:#fff;'>Nu există mesaje încă.</div>";
    return;
  }

  const me = auth.currentUser?.uid || "";

  msgs.forEach((m) => {
    const row = document.createElement("div");
    const mine = String(m.fromUid || "") === me;
    row.className = mine ? "msg me" : "msg";

    const when = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("ro-RO") : "";
    const who = m.fromRole === "admin" ? "Admin" : "Client";

    row.innerHTML = `
      <div class="meta">${escapeHtml(who)} • ${escapeHtml(when)}</div>
      <div class="txt">${escapeHtml(String(m.text || ""))}</div>
    `;
    body.appendChild(row);
  });

  body.scrollTop = body.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input || !_chatOrderId) return;

  const raw = String(input.value || "");
  const text = stripEmoji(raw);
  if (!text) return;

  input.value = "";

  try {
    await addDoc(collection(db, "orders", _chatOrderId, "messages"), {
      text,
      fromUid: auth.currentUser?.uid || null,
      fromRole: "admin",
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.error(e);
    alert(e?.message || "Eroare la trimitere mesaj.");
  }
}

/* =========================
   Status update
========================= */

async function setOrderStatus(order, newStatus) {
  const uid = auth.currentUser?.uid || null;
  if (!uid) throw new Error("Nu ești autentificat.");

  let note = "";
  if (newStatus === "CONFIRMED") {
    note = stripEmoji(prompt("Notă confirmare (ex: Confirmat în chat / telefon).", "Confirmat în chat") || "");
  }

  await updateDoc(doc(db, "orders", order.id), {
    status: newStatus,
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({
      status: newStatus,
      at: Timestamp.now(),
      adminUid: uid,
      note: note || ""
    })
  });

  const systemMsg = note
    ? `Status actualizat: ${newStatus}. ${note}`
    : `Status actualizat: ${newStatus}.`;

  await addDoc(collection(db, "orders", order.id, "messages"), {
    text: stripEmoji(systemMsg),
    fromUid: uid,
    fromRole: "admin",
    createdAt: serverTimestamp(),
    system: true
  });
}

/* =========================
   Render orders list
========================= */

/* =========================
   Render lista produse din comandă (mobile-friendly, verticală)
========================= */

function renderOrderItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div style="opacity:.6; font-size:13px; padding:6px 0;">Fără produse salvate.</div>`;
  }

  const rows = items.map((it) => {
    const name = escapeHtml(String(it.name || it.productId || "—"));
    const qty = Number(it.qty || 0);
    const unit = Number(it.unitPriceFinal ?? it.unit ?? 0);
    const line = Number(it.lineTotal ?? (unit * qty));

    return `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:8px 0;
        border-bottom:1px solid rgba(255,255,255,.07);
        gap:8px;
      ">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          <div style="font-size:12px; opacity:.65; margin-top:2px;">${qty} buc × ${formatMoney(unit)} RON</div>
        </div>
        <div style="font-weight:900; font-size:15px; white-space:nowrap; color:#4da3ff;">${formatMoney(line)} RON</div>
      </div>
    `;
  }).join("");

  return `
    <div style="
      background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.08);
      border-radius:12px;
      padding:4px 12px;
      margin-top:10px;
    ">
      <div style="font-size:12px; font-weight:800; opacity:.5; text-transform:uppercase; letter-spacing:.5px; padding:8px 0 4px;">Produse comandă</div>
      ${rows}
    </div>
  `;
}

/* =========================
   Badge mesaje necitite per comandă
========================= */

// Stochează unsubscribe-urile pentru badge-uri
const _badgeUnsubs = new Map();

function listenOrderBadge(orderId, badgeEl) {
  // Oprește listener anterior dacă există
  if (_badgeUnsubs.has(orderId)) {
    try { _badgeUnsubs.get(orderId)(); } catch {}
  }

  const q = query(
    collection(db, "orders", orderId, "messages"),
    orderBy("createdAt", "asc")
  );

  const unsub = onSnapshot(q, (snap) => {
    // Numără mesajele de la client (necitite de admin = cele de la role "client")
    const unread = snap.docs.filter(d => {
      const data = d.data();
      return data.fromRole === "client" && !data.readByAdmin;
    }).length;

    if (badgeEl) {
      if (unread > 0) {
        badgeEl.textContent = unread;
        badgeEl.style.display = "inline-flex";
      } else {
        badgeEl.style.display = "none";
      }
    }
  }, () => {});

  _badgeUnsubs.set(orderId, unsub);
}

function render() {
  if (!listEl) return;

  // Oprește badge listeners vechi
  _badgeUnsubs.forEach(unsub => { try { unsub(); } catch {} });
  _badgeUnsubs.clear();

  const filter = filterEl?.value || "ALL";
  const items = ordersData.filter((o) => (filter === "ALL" ? true : o.status === filter));

  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = "<div style='opacity:.85; padding:10px;'>Nu există comenzi.</div>";
    return;
  }

  items.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";
    card.style.cssText = `
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.03);
      border-radius:16px;
      padding:14px;
      margin:10px 0;
    `;

    const client = order.clientSnapshot || {};
    const clientLine = `${client.fullName || "—"} • ${client.phone || "—"}`;
    const statusColor = {
      NEW: "#4da3ff",
      CONFIRMED: "#35d07f",
      SENT: "#f5a623",
      DELIVERED: "#9fb0c3",
      CANCELED: "#ff5d5d"
    }[order.status || "NEW"] || "#4da3ff";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <div style="font-weight:900; font-size:16px;">Comanda #${order.orderNumber || "-"}</div>
          <div style="opacity:.8; margin-top:3px; font-size:14px;">${escapeHtml(clientLine)}</div>
          <div style="font-size:12px; opacity:.6; margin-top:2px;">${formatDate(order.createdAt)}</div>
        </div>
        <div style="
          background:${statusColor}22;
          border:1px solid ${statusColor}55;
          color:${statusColor};
          border-radius:20px;
          padding:4px 10px;
          font-size:12px;
          font-weight:800;
          white-space:nowrap;
          flex-shrink:0;
        ">${escapeHtml(order.status || "NEW")}</div>
      </div>

      <div style="margin-top:10px; font-size:13px;">
        <label style="display:block; opacity:.6; margin-bottom:4px; font-size:12px;">Schimbă status:</label>
        <select class="statusSelect" style="
          width:100%;
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.06);
          color:#fff;
          font-size:14px;
        ">${statusOptionsHtml(order.status || "NEW")}</select>
      </div>

      ${renderOrderItems(order.items)}

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-top:12px;
        padding-top:10px;
        border-top:1px solid rgba(255,255,255,.08);
      ">
        <span style="opacity:.7; font-size:13px;">Total comandă</span>
        <span style="font-weight:900; font-size:18px; color:#35d07f;">${formatMoney(order.total)} RON</span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:12px;">
        <button class="chatBtn" type="button" style="
          position:relative;
          padding:12px 8px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.06);
          color:#fff;
          font-weight:800;
          font-size:13px;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:4px;
        ">
          💬 Chat
          <span class="chatBadge" style="
            display:none;
            background:#ff5d5d;
            color:#fff;
            border-radius:50%;
            width:18px;
            height:18px;
            font-size:10px;
            font-weight:900;
            align-items:center;
            justify-content:center;
            flex-shrink:0;
          "></span>
        </button>
        <button class="waBtn" type="button" style="
          padding:12px 8px;
          border-radius:12px;
          border:1px solid rgba(37,211,102,.35);
          background:rgba(37,211,102,.08);
          color:#25d366;
          font-weight:800;
          font-size:13px;
          cursor:pointer;
        ">📱 WA</button>
        <button class="exportBtn" type="button" style="
          padding:12px 8px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.06);
          color:#fff;
          font-weight:800;
          font-size:13px;
          cursor:pointer;
        ">📄 PDF</button>
      </div>
    `;

    // Badge mesaje necitite
    const badgeEl = card.querySelector(".chatBadge");
    listenOrderBadge(order.id, badgeEl);

    // Chat
    card.querySelector(".chatBtn").onclick = () => openChat(order);

    // WhatsApp
    card.querySelector(".waBtn").onclick = () => {
      const phone = safePhone(client.phone);
      if (!phone) {
        alert("Clientul nu are telefon salvat.");
        return;
      }
      const msg = encodeURIComponent(`Salut! Confirmăm comanda #${order.orderNumber}.`);
      window.open(`https://wa.me/${phone}?text=${msg}`);
    };

    // PDF
    card.querySelector(".exportBtn").onclick = async () => {
      try {
        await exportOrderPDFA4_PRO(order, db);
      } catch (e) {
        console.error(e);
        alert(e?.message || "Eroare export PDF.");
      }
    };

    // Status change
    const sel = card.querySelector(".statusSelect");
    sel.onchange = async () => {
      const newStatus = sel.value;
      try {
        await setOrderStatus(order, newStatus);
        order.status = newStatus;
        alert("Status actualizat.");
      } catch (e) {
        console.error(e);
        alert(e?.message || "Eroare la actualizare status.");
        sel.value = order.status || "NEW";
      }
    };

    listEl.appendChild(card);
  });
}

/* =========================
   Firestore Listener
========================= */

function stopOrdersListener() {
  if (_unsubOrders) {
    try { _unsubOrders(); } catch {}
  }
  _unsubOrders = null;
}

function loadOrders() {
  if (!listEl) return;

  stopOrdersListener();

  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  _unsubOrders = onSnapshot(
    q,
    (snap) => {
      ordersData = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      render();
    },
    (err) => {
      console.error("Orders onSnapshot error:", err);

      const code = err?.code || "";
      const msg = err?.message || "";

      if (code === "permission-denied") {
        setTopMessage(
          `PERMISSION DENIED la /orders.<br/>
           <b>Testează în Console:</b> <code>__AUTH.currentUser</code><br/>
           Dacă e null, nu ești logat real în Firebase Auth.`
        );
        return;
      }

      setTopMessage(`Eroare încărcare comenzi: ${escapeHtml(msg)}`);
    }
  );
}

/* =========================
   Events
========================= */

if (filterEl) filterEl.addEventListener("change", render);
if (refreshBtn) refreshBtn.addEventListener("click", render);

/* =========================
   Init
========================= */

setTopMessage("Se verifică autentificarea…");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    stopOrdersListener();
    setTopMessage("Nu ești logat în Firebase Auth. Reautentifică-te.");
    return;
  }

  try {
    // forțează token fresh (important când ai schimbat config / reguli / sesiuni)
    await getIdToken(user, true);
  } catch (e) {
    console.warn("getIdToken(true) failed:", e);
  }

  loadOrders();
});