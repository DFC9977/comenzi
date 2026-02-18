// js/clientPromos.js — Promoții client (citite per cont în Firestore)
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
  updateDoc,
  arrayUnion,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const promosList  = document.getElementById("promosList");
const promoBadge  = document.getElementById("promoBadge");

let _uid = null;
let _seenPromos = [];   // array de promo IDs văzute de user
let _allPromos  = [];   // toate promoțiile active

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString("ro-RO", {
    day: "numeric", month: "long", year: "numeric"
  });
}

async function loadPromos() {
  if (!_uid) return;

  try {
    // Citim promoțiile active
    const snap = await getDocs(
      query(
        collection(db, "promotions"),
        where("active", "==", true),
        orderBy("createdAt", "desc")
      )
    );
    _allPromos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Citim ce a văzut deja userul
    const userSnap = await getDoc(doc(db, "users", _uid));
    _seenPromos = userSnap.data()?.seenPromotions || [];

    renderPromos();
    updateBadge();
  } catch (e) {
    console.error("clientPromos loadPromos:", e);
    if (promosList) promosList.innerHTML = `<div class="muted">Eroare la încărcare promoții.</div>`;
  }
}

function renderPromos() {
  if (!promosList) return;

  if (!_allPromos.length) {
    promosList.innerHTML = `
      <div style="text-align:center; padding:40px 20px; opacity:.5;">
        <div style="font-size:40px; margin-bottom:10px;">📣</div>
        <div style="font-size:15px;">Nicio promoție activă momentan.</div>
      </div>
    `;
    return;
  }

  promosList.innerHTML = "";

  _allPromos.forEach(p => {
    const isUnread = !_seenPromos.includes(p.id);
    const card = document.createElement("div");
    card.className = `promo-card${isUnread ? " unread" : ""}`;
    card.innerHTML = `
      <div class="promo-text">
        ${escapeHtml(p.text)}
        ${isUnread ? `<span class="promo-new-badge">NOU</span>` : ""}
      </div>
      <div class="promo-meta">📅 ${formatDate(p.createdAt)}</div>
    `;
    promosList.appendChild(card);
  });
}

function updateBadge() {
  const unread = _allPromos.filter(p => !_seenPromos.includes(p.id)).length;
  if (promoBadge) {
    promoBadge.textContent = String(unread);
    promoBadge.classList.toggle("show", unread > 0);
  }
}

// Marchează toate promoțiile curente ca văzute în Firestore
async function markPromosRead() {
  if (!_uid || !_allPromos.length) return;

  const newSeen = _allPromos.map(p => p.id).filter(id => !_seenPromos.includes(id));
  if (!newSeen.length) return;

  try {
    await updateDoc(doc(db, "users", _uid), {
      seenPromotions: arrayUnion(...newSeen)
    });
    _seenPromos = [..._seenPromos, ...newSeen];
    renderPromos();
    updateBadge();
    // Notifică parent să ascundă badge-ul
    window.parent?.postMessage({ action: "promosRead" }, "*");
  } catch (e) {
    console.error("markPromosRead:", e);
  }
}

// Expunem funcția pentru HTML (apelată când userul deschide tabul Promoții)
window.__markPromosRead = markPromosRead;

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  _uid = user.uid;
  try { await getIdToken(user, true); } catch {}
  await new Promise(r => setTimeout(r, 200));
  await loadPromos();

  // Notifică parent că promoțiile au fost citite când tab-ul e deschis
  window.parent?.postMessage({ action: "promosRead" }, "*");
});