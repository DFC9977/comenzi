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
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPlainTextToHtml(text) {
  const safe = escapeHtml(text || "");
  return safe.replace(/\r\n|\r|\n/g, "<br>");
}

/** Sanitize HTML for promo display. Allowed: p, br, strong, em, u, a[href], ol, ul, li, span. Safe href only. */
function sanitizePromoHtml(html, fallbackText) {
  if (!html || typeof html !== "string") return escapeHtml(fallbackText || "");
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ol", "ul", "li", "span"]);
    const safeHref = (href) => {
      if (!href || typeof href !== "string") return false;
      const t = href.trim().toLowerCase();
      return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("mailto:");
    };
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }
      const tag = node.tagName.toLowerCase();
      if (tag === "script" || tag === "style") { node.remove(); return; }
      if (!allowedTags.has(tag)) {
        while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
        node.remove();
        return;
      }
      const attrs = node.getAttributeNames();
      for (const a of attrs) {
        if (a.startsWith("on") || a === "style") { node.removeAttribute(a); continue; }
        if (tag === "a" && a === "href") { if (!safeHref(node.getAttribute(a))) node.removeAttribute(a); continue; }
        if (a !== "href") node.removeAttribute(a);
      }
      for (let i = node.childNodes.length - 1; i >= 0; i--) walk(node.childNodes[i]);
    };
    walk(doc.body);
    return doc.body.innerHTML;
  } catch (e) {
    return escapeHtml(fallbackText || html || "");
  }
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
    // Citim promoțiile active (filtru suplimentar pe date se face pe client)
    const snap = await getDocs(
      query(
        collection(db, "promotions"),
        where("active", "==", true),
        orderBy("createdAt", "desc")
      )
    );

    const now = new Date();
    _allPromos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        // Dacă are startDate și nu am ajuns încă la ea → ascundem
        if (p.startDate?.toDate && p.startDate.toDate() > now) return false;
        // Dacă are endDate și a trecut → ascundem
        if (p.endDate?.toDate && p.endDate.toDate() < now) return false;
        return true;
      });

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
    const hasRich = !!(p.contentHtml && p.contentHtml.trim());
    const fallbackText = p.contentText || p.text || "";

    const card = document.createElement("div");
    card.className = `promo-card${isUnread ? " unread" : ""}`;

    if (hasRich) {
      const safeHtml = sanitizePromoHtml(p.contentHtml, fallbackText);
      card.innerHTML = `
      <div class="promo-header">
        <span class="promo-title">Promoție</span>
        ${isUnread ? `<span class="promo-new-badge">NOU</span>` : ""}
      </div>
      <div class="promo-text promo-text-html" style="min-width:0;">${safeHtml}</div>
      <div class="promo-meta">📅 ${formatDate(p.createdAt)}</div>
    `;
    } else {
      const lines = String(p.text || "").split(/\n/).map(s => s.trim()).filter(Boolean);
      const title = lines[0] || "Promoție";
      const bodyLines = lines.slice(1);
      const chipMatches = (p.text || "").match(/\d+\+\d+/g) || [];
      const chips = [...new Set(chipMatches)];
      let bodyDisplay = bodyLines.join("\n").trim();
      if (chips.length && bodyDisplay) {
        bodyDisplay = bodyDisplay.replace(/\d+\+\d+/g, " ").replace(/[ \t]+/g, " ").trim() || bodyDisplay;
      }
      card.innerHTML = `
      <div class="promo-header">
        <span class="promo-title">${escapeHtml(title)}</span>
        ${isUnread ? `<span class="promo-new-badge">NOU</span>` : ""}
      </div>
      ${chips.length ? `<div class="promo-chips">${chips.map(c => `<span class="promo-chip">${escapeHtml(c)}</span>`).join("")}</div>` : ""}
      ${bodyDisplay ? `<div class="promo-text" style="min-width:0;">${formatPlainTextToHtml(bodyDisplay)}</div>` : ""}
      <div class="promo-meta">📅 ${formatDate(p.createdAt)}</div>
    `;
    }
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