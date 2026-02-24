// admin.js (ROOT, lângă admin.html)
import { auth, db, functions } from "./js/firebase.js";
import { normalizePhone, phoneToEmail } from "./js/auth.js";
import { COUNTY_CITIES } from "./js/localities.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let ALL_CATEGORIES = [];
let ALL_USERS = [];
let ALL_CLIENTS = []; // { uid, phone, email, fullName, status } for list + search
let ALL_PRODUCTS = [];
let ALL_COUNTIES = [];

const COUNTIES_LIST = [
  "Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brăila","Brașov","București",
  "Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu",
  "Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț",
  "Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"
];

// -------------------- HELPERS --------------------

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Sanitize HTML for promo display (Quill output). Does NOT strip p, br, ul, ol, li. Allowed: p, br, strong, em, u, a[href], ol, ul, li, span. Safe href only. */
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

function formatPlainTextToHtml(text) {
  const safe = escapeHtml(text || "");
  return safe.replace(/\r\n|\r|\n/g, "<br>");
}

/** Returns HTML for promo card (use with innerHTML only). Preserves p, br, ul, ol, li from contentHtml. */
function getPromoContentForDisplay(p) {
  if (p.contentHtml && p.contentHtml.trim()) {
    return sanitizePromoHtml(p.contentHtml, p.contentText || p.text || "");
  }
  return formatPlainTextToHtml(p.contentText || p.text || "");
}

function showMsg(text, isErr = false) {
  const el = $("err");
  if (!el) return;
  el.textContent = text;
  el.style.color = isErr ? "#ff5d5d" : "#35d07f";
}

function calcDeliveryDates(startDate, intervalDays, count = 3) {
  if (!startDate || !intervalDays) return [];
  const dates = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i * intervalDays);
    dates.push(d);
  }
  return dates;
}

function formatDateRO(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function makeSectionCard(title) {
  const card = document.createElement("div");
  card.style.cssText = `border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);border-radius:14px;padding:14px;margin-bottom:12px;`;
  card.innerHTML = `<div style="font-size:12px;font-weight:800;opacity:.5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">${escapeHtml(title)}</div>`;
  return card;
}

function makeBtn(label, bg, color) {
  const btn = document.createElement("button");
  btn.style.cssText = `width:100%;padding:16px;border-radius:14px;border:none;background:${bg};color:${color};font-weight:900;font-size:16px;cursor:pointer;margin-bottom:8px;`;
  btn.textContent = label;
  return btn;
}

function renderCatList(container, categoriesObj) {
  const list = container.querySelector(".catList");
  if (!list) return;
  const entries = Object.entries(categoriesObj || {});
  if (!entries.length) {
    list.innerHTML = `<div style="font-size:12px;opacity:.5;padding:4px 0;">(fără override pe categorii)</div>`;
    return;
  }
  const nameById = Object.fromEntries(ALL_CATEGORIES.map(c => [c.id, c.name]));
  list.innerHTML = entries.sort((a, b) => a[0].localeCompare(b[0])).map(([id, v]) => {
    return `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);">
      <b>${escapeHtml(nameById[id] || id)}</b>: <span style="color:#4da3ff;">${Number(v)}%</span></div>`;
  }).join("");
}

function renderProdList(container, productsObj) {
  const list = container.querySelector(".prodList");
  if (!list) return;
  const entries = Object.entries(productsObj || {});
  if (!entries.length) {
    list.innerHTML = `<div style="font-size:12px;opacity:.5;padding:4px 0;">(fără override per produs)</div>`;
    return;
  }
  const nameById = Object.fromEntries(ALL_PRODUCTS.map(p => [p.id, p.name]));
  list.innerHTML = entries.sort((a, b) => a[0].localeCompare(b[0])).map(([id, v]) => {
    return `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);">
      <b>${escapeHtml(nameById[id] || id)}</b>: <span style="color:#35d07f;">${Number(v)}%</span></div>`;
  }).join("");
}

// -------------------- AUTH --------------------

$("btnLogin").onclick = async () => {
  showMsg("");
  const phone = normalizePhone($("phone").value);
  const pass = $("pass").value;
  if (!phone || phone.length < 9) return showMsg("Telefon invalid.", true);
  if (!pass || pass.length < 6) return showMsg("Parola minim 6 caractere.", true);
  try {
    await signInWithEmailAndPassword(auth, phoneToEmail(phone), pass);
  } catch (e) {
    showMsg(e?.message || "Eroare login", true);
  }
};

$("btnLogout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (u) => {
  const el = (id) => document.getElementById(id);
  showMsg("");

  const authCard = el("authCard");

  if (!u) {
    if (authCard) authCard.style.display = "block";
    document.querySelectorAll(".admin-section:not(.tab-panel)").forEach(s => s.style.display = "none");
    const meEl = el("me"); if (meEl) meEl.textContent = "";
    return;
  }

  // Sesiune activă: ascunde login, arată secțiunile (NU tab-panel-urile — controlate de .active)
  if (authCard) authCard.style.display = "none";
  document.querySelectorAll(".admin-section:not(.tab-panel)").forEach(s => s.style.display = "block");
  const meEl = el("me"); if (meEl) meEl.textContent = "";

  try {
    // Forțăm refresh token — critic în iframe unde auth poate fi lent
    await getIdToken(u, true);

    // Mică pauză pentru ca Firestore să accepte token-ul nou
    await new Promise(r => setTimeout(r, 300));

    const meSnap = await getDoc(doc(db, "users", u.uid));
    const me = meSnap.exists() ? meSnap.data() : null;
    if (meEl) meEl.innerHTML = `<small style="opacity:.6">UID: ${u.uid}</small> | <b>role:</b> ${me?.role || "—"}`;

    if (me?.role !== "admin") {
      showMsg("Nu ești admin. Setează: users/{uid}.role = 'admin'.", true);
      if (authCard) authCard.style.display = "block";
      document.querySelectorAll(".admin-section:not(.tab-panel)").forEach(s => s.style.display = "none");
      return;
    }

    await Promise.all([loadCategories(), loadProducts(), loadCounties()]);
    await loadUsers();
    if (!window._clientsTabInitialized) {
      window._clientsTabInitialized = true;
      initClientsTab();
    }
    await loadPromotions();
    initNotificationsSection();
    loadPasswordResetRequests();
  } catch (e) {
    console.error("admin init error:", e);
    showMsg(e?.message || String(e), true);
  }
});

// -------------------- LOAD DATA --------------------

async function loadCategories() {
  const snap = await getDocs(collection(db, "categories"));
  const cats = [];
  snap.forEach(d => {
    const data = d.data() || {};
    if (data.active === false) return;
    cats.push({ id: d.id, name: String(data.name || d.id), sortOrder: Number(data.sortOrder ?? 999999) });
  });
  ALL_CATEGORIES = cats.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }));
}

async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  ALL_PRODUCTS = [];
  snap.forEach(d => {
    const data = d.data() || {};
    ALL_PRODUCTS.push({ id: d.id, name: String(data.name || d.id) });
  });
  ALL_PRODUCTS.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadCounties() {
  const snap = await getDocs(collection(db, "counties"));
  ALL_COUNTIES = [];
  snap.forEach(d => {
    const data = d.data() || {};
    ALL_COUNTIES.push({ id: d.id, name: String(data.name || d.id), deliveryDay: data.deliveryDay || "" });
  });
  ALL_COUNTIES.sort((a, b) => a.name.localeCompare(b.name));
  renderCountiesSection();
}

const CLIENTS_SEARCH_DEBOUNCE_MS = 300;
const CLIENTS_STORAGE_KEY = "adminClientsSearch";

function renderClientsListSkeletons(container) {
  if (!container) return;
  let html = "";
  for (let i = 0; i < 6; i++) {
    html += `<div class="client-row-skeleton"><div class="line" style="width:70%;"></div><div class="line"></div></div>`;
  }
  container.innerHTML = html;
}

function matchClientSearch(c, q) {
  if (!q || !q.trim()) return true;
  const s = q.trim().toLowerCase();
  const name = (c.fullName || "").toLowerCase();
  const phone = (c.phone || "").replace(/\s/g, "");
  const email = (c.email || "").toLowerCase();
  const phoneNorm = s.replace(/\s/g, "");
  return name.includes(s) || phone.includes(phoneNorm) || email.includes(s);
}

function renderClientsList() {
  const container = $("clientsListContainer");
  const searchInput = $("clientsSearchInput");
  if (!container) return;
  const q = (searchInput && searchInput.value.trim()) || "";
  const filtered = ALL_CLIENTS.filter(c => matchClientSearch(c, q));
  if (filtered.length === 0) {
    container.innerHTML = `<div class="clients-empty">${q ? "Niciun client găsit." : "Niciun client."}</div>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.forEach(c => {
    const name = c.fullName?.trim() || "(fără nume)";
    const meta = [c.phone, c.email].filter(Boolean).join(" · ") || "—";
    const row = document.createElement("a");
    row.href = `admin.html#client/${encodeURIComponent(c.uid)}`;
    row.className = "client-row";
    row.setAttribute("data-uid", c.uid);
    row.innerHTML = `
      <div class="client-row-main">
        <div class="client-row-name">${escapeHtml(name)}</div>
        <div class="client-row-meta">${escapeHtml(meta)}</div>
      </div>
      <span class="client-row-chevron">›</span>`;
    row.addEventListener("click", (e) => {
      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        location.hash = `client/${encodeURIComponent(c.uid)}`;
      }
    });
    fragment.appendChild(row);
  });
  container.innerHTML = "";
  container.appendChild(fragment);
}

function setupClientsSearch() {
  const searchInput = $("clientsSearchInput");
  const clearBtn = $("clientsSearchClear");
  const container = $("clientsListContainer");
  if (!searchInput || !container) return;
  let debounceTimer = null;
  function applySearch() {
    const q = searchInput.value.trim();
    try { sessionStorage.setItem(CLIENTS_STORAGE_KEY, q); } catch (_) {}
    if (clearBtn) {
      clearBtn.classList.toggle("has-value", q.length > 0);
    }
    renderClientsList();
  }
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applySearch, CLIENTS_SEARCH_DEBOUNCE_MS);
  });
  searchInput.addEventListener("search", () => { applySearch(); });
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      try { sessionStorage.removeItem(CLIENTS_STORAGE_KEY); } catch (_) {}
      clearBtn.classList.remove("has-value");
      searchInput.focus();
      renderClientsList();
    });
  }
  try {
    const saved = sessionStorage.getItem(CLIENTS_STORAGE_KEY);
    if (saved != null && saved !== "") {
      searchInput.value = saved;
      if (clearBtn) clearBtn.classList.add("has-value");
    }
  } catch (_) {}
}

async function loadUsers() {
  const container = $("clientsListContainer");
  if (container) renderClientsListSkeletons(container);
  try {
    const allSnap = await getDocs(collection(db, "users"));
    ALL_USERS = [];
    ALL_CLIENTS = [];
    allSnap.forEach(s => {
      const d = s.data() || {};
      const uid = s.id;
      const role = d.role || "";
      const name = d.contact?.fullName || "";
      ALL_USERS.push({ uid, phone: d.phone || "", name });
      if (role === "admin") return;
      ALL_CLIENTS.push({
        uid,
        phone: d.phone || "",
        email: d.email || "",
        fullName: name,
        status: d.status || "pending",
      });
    });
    ALL_CLIENTS.sort((a, b) => (a.fullName || a.phone || "").localeCompare(b.fullName || b.phone || ""));
    if (container) renderClientsList();
    const h = (location.hash || "").replace("#", "");
    if (h.startsWith("client/")) {
      const detailUid = decodeURIComponent(h.slice(7));
      loadClientDetail(detailUid);
    }
  } catch (e) {
    console.error(e);
    showMsg(e?.message || String(e), true);
    if (container) container.innerHTML = `<div class="clients-empty">Eroare la încărcare.</div>`;
  }
}

function initClientsTab() {
  setupClientsSearch();
  window.addEventListener("admin-show-client-detail", (e) => {
    const uid = e.detail?.uid;
    if (!uid) return;
    loadClientDetail(uid);
  });
  const backBtn = $("clientDetailBack");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = "clients";
    });
  }
}

async function loadClientDetail(uid) {
  const content = $("clientDetailContent");
  if (!content) return;
  content.innerHTML = "<div class=\"clients-empty\">Se încarcă…</div>";
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      content.innerHTML = "<div class=\"clients-empty\">Client negăsit.</div>";
      return;
    }
    const data = snap.data();
    const isPending = (data.status || "") === "pending";
    content.innerHTML = "";
    content.appendChild(renderUserCard(uid, data, isPending));
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="clients-empty">Eroare: ${escapeHtml(e?.message || String(e))}</div>`;
  }
}

// -------------------- COUNTIES SECTION --------------------

function renderCountiesSection() {
  const container = $("countiesContainer");
  if (!container) return;
  const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri"];

  // Județele deja configurate (pentru a le exclude din select)
  const existingNames = new Set(ALL_COUNTIES.map(c => c.name.toLowerCase()));
  const availableCounties = COUNTIES_LIST.filter(c => !existingNames.has(c.toLowerCase()));

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:14px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Județ</label>
        <select id="newCountyName" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
          <option value="">— alege județul —</option>
          ${availableCounties.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Zi livrare</label>
        <select id="newCountyDay" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
          <option value="">— alege —</option>
          ${DAYS.map(d => `<option value="${d}">${d}</option>`).join("")}
        </select>
      </div>
      <button id="btnAddCounty" style="padding:12px 16px;border-radius:12px;border:none;background:#4da3ff;color:#07111d;font-weight:900;font-size:14px;cursor:pointer;white-space:nowrap;">+ Adaugă</button>
    </div>
    <div id="countiesList"></div>
  `;

  $("btnAddCounty").onclick = async () => {
    const name = $("newCountyName").value;
    const day = $("newCountyDay").value;
    if (!name) return alert("Selectează județul.");
    if (!day) return alert("Selectează ziua.");
    await setDoc(doc(db, "counties", name), { name, deliveryDay: day, updatedAt: serverTimestamp() }, { merge: true });
    $("newCountyName").value = "";
    $("newCountyDay").value = "";
    await loadCounties();
  };

  const listEl = $("countiesList");
  if (!ALL_COUNTIES.length) {
    listEl.innerHTML = `<div style="opacity:.6;font-size:14px;">Nu există județe configurate.</div>`;
    return;
  }

  ALL_COUNTIES.forEach(county => {
    const row = document.createElement("div");
    row.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);margin-bottom:8px;`;
    row.innerHTML = `<span style="font-weight:700;flex:1;">${escapeHtml(county.name)}</span>`;

    const sel = document.createElement("select");
    sel.style.cssText = "padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;";
    DAYS.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d; opt.textContent = d;
      if (d === county.deliveryDay) opt.selected = true;
      sel.appendChild(opt);
    });

    const btnSave = document.createElement("button");
    btnSave.textContent = "Salvează";
    btnSave.style.cssText = "padding:8px 14px;border-radius:10px;border:none;background:#35d07f;color:#07111d;font-weight:800;cursor:pointer;";
    btnSave.onclick = async () => {
      await setDoc(doc(db, "counties", county.id), { deliveryDay: sel.value, updatedAt: serverTimestamp() }, { merge: true });
      await loadCounties();
    };

    row.appendChild(sel);
    row.appendChild(btnSave);
    listEl.appendChild(row);
  });
}

// -------------------- USER CARD --------------------

function renderUserCard(uid, u, isPending) {
  const div = document.createElement("div");
  div.style.cssText = `border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:16px;margin-bottom:14px;`;

  const categoriesObj = u?.priceRules?.categories || {};
  const productsObj   = u?.priceRules?.products || {};
  const globalMarkup  = Number(u?.priceRules?.globalMarkup ?? 0);
  const fontColor     = u?.fontColor || "#e8eef6";
  const deliveryFreq  = u?.deliveryFrequency || 1;
  const deliveryInt   = u?.deliveryIntervalDays || 7;
  const deliveryStart = u?.deliveryStartDate || "";

  // Header
  div.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <div>
        <div style="font-weight:900;font-size:17px;color:${escapeHtml(fontColor)};" class="clientNameDisplay">
          ${escapeHtml(u?.contact?.fullName || "(fără nume)")}
          ${u?.contact?.kennel ? `<span style="font-weight:400;opacity:.7;font-size:14px;"> — ${escapeHtml(u.contact.kennel)}</span>` : ""}
        </div>
        <div style="font-size:14px;opacity:.7;margin-top:2px;">${escapeHtml(u.phone || uid)}</div>
        <div style="font-size:12px;opacity:.5;margin-top:2px;">
          ${u.status || "—"} | ${u.clientType || "—"} | ${u.channel || "—"}
          ${u.referrerPhone ? ` | ref: ${escapeHtml(u.referrerPhone)}` : ""}
        </div>
      </div>
      <span style="background:${isPending ? "rgba(245,166,35,.15)" : "rgba(53,208,127,.15)"};color:${isPending ? "#f5a623" : "#35d07f"};border:1px solid ${isPending ? "rgba(245,166,35,.3)" : "rgba(53,208,127,.3)"};border-radius:20px;padding:4px 12px;font-size:12px;font-weight:800;white-space:nowrap;">
        ${isPending ? "PENDING" : "ACTIV"}
      </span>
    </div>
  `;

  // ===== SECȚIUNEA: Date contact =====
  const secContact = makeSectionCard("Date contact");
  secContact.innerHTML += `
    <div style="display:grid;gap:10px;margin-top:4px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Telefon</label>
        <input type="tel" value="${escapeHtml(u.phone || '')}" readonly
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);color:#9fb0c3;font-size:15px;box-sizing:border-box;opacity:.7;" />
        <div style="font-size:11px;opacity:.4;margin-top:3px;">Telefonul este ID-ul de autentificare și nu poate fi modificat.</div>
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Nume complet</label>
        <input type="text" class="contactFullName" value="${escapeHtml(u.contact?.fullName || '')}"
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Canisă / Felisă (opțional)</label>
        <input type="text" class="contactKennel" value="${escapeHtml(u.contact?.kennel || '')}"
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Adresă completă</label>
        <textarea class="contactAddress" rows="3"
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;resize:vertical;">${escapeHtml(u.contact?.address || '')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Județ</label>
          <select class="contactCounty"
            style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
            <option value="">— selectează —</option>
            ${COUNTIES_LIST.map(c => `<option value="${escapeHtml(c)}"${u.contact?.county === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Localitate</label>
          <input type="text" class="contactCity" list="cityDL-${escapeHtml(uid)}" value="${escapeHtml(u.contact?.city || '')}"
            style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
          <datalist id="cityDL-${escapeHtml(uid)}"></datalist>
        </div>
      </div>
    </div>
  `;
  div.appendChild(secContact);

  // Live update header when name changes
  secContact.querySelector(".contactFullName").addEventListener("input", (e) => {
    const nameDisplay = div.querySelector(".clientNameDisplay");
    if (nameDisplay) nameDisplay.firstChild.textContent = e.target.value || "(fără nume)";
  });

  // Populate city datalist on county change
  const countySelect = secContact.querySelector(".contactCounty");
  const cityDatalist = secContact.querySelector(`#cityDL-${uid}`);
  function refreshCityDatalist(county) {
    if (!cityDatalist) return;
    cityDatalist.innerHTML = "";
    for (const city of (COUNTY_CITIES[county] || [])) {
      const opt = document.createElement("option");
      opt.value = city;
      cityDatalist.appendChild(opt);
    }
  }
  refreshCityDatalist(countySelect.value);
  countySelect.addEventListener("change", (e) => {
    secContact.querySelector(".contactCity").value = "";
    refreshCityDatalist(e.target.value);
  });

  // ===== SECȚIUNEA: Date generale =====
  const secGeneral = makeSectionCard("Date generale");
  secGeneral.innerHTML += `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Tip client</label>
        <select class="clientType" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
          <option value="tip1">Tip 1</option><option value="tip2">Tip 2</option><option value="tip3">Tip 3</option>
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Canal</label>
        <select class="channel" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
          <option value="internet">Internet</option>
          <option value="gasit_de_mine">Găsit de mine</option>
          <option value="recomandare_crescator">Recomandare</option>
          <option value="alt_crescator">Alt crescător</option>
        </select>
      </div>
    </div>
    <div style="margin-top:10px;">
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Recomandat de</label>
      <select class="referrer" disabled style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;"></select>
    </div>
    <div style="margin-top:10px;">
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Culoare font (vizibil în listă)</label>
      <div style="display:flex;align-items:center;gap:12px;">
        <input class="fontColorPicker" type="color" value="${escapeHtml(fontColor)}"
          style="width:52px;height:52px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:transparent;cursor:pointer;padding:2px;" />
        <span class="fontColorPreview" style="font-weight:700;font-size:16px;color:${escapeHtml(fontColor)};">
          ${escapeHtml(u?.contact?.fullName || "Previzualizare")}
        </span>
      </div>
    </div>
  `;
  div.appendChild(secGeneral);

  secGeneral.querySelector(".clientType").value = u?.clientType || "tip1";
  secGeneral.querySelector(".channel").value = u?.channel || "internet";

  const channelSel = secGeneral.querySelector(".channel");
  const refSel = secGeneral.querySelector(".referrer");

  const optNone = document.createElement("option");
  optNone.value = ""; optNone.textContent = "(fără)";
  refSel.appendChild(optNone);
  ALL_USERS.filter(x => x.uid !== uid)
    .sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone))
    .forEach(x => {
      const opt = document.createElement("option");
      opt.value = x.uid;
      opt.textContent = `${x.name || "(fără nume)"} — ${x.phone}`;
      refSel.appendChild(opt);
    });
  refSel.value = u?.referrerUid || "";

  function syncRef() {
    refSel.disabled = channelSel.value !== "recomandare_crescator";
    if (refSel.disabled) refSel.value = "";
  }
  channelSel.addEventListener("change", syncRef);
  syncRef();

  // Color picker live preview
  const colorPicker = secGeneral.querySelector(".fontColorPicker");
  const colorPreview = secGeneral.querySelector(".fontColorPreview");
  colorPicker.addEventListener("input", () => {
    colorPreview.style.color = colorPicker.value;
    div.querySelector(".clientNameDisplay").style.color = colorPicker.value;
  });

  // ===== SECȚIUNEA: Prețuri =====
  const secPrice = makeSectionCard("Prețuri & Adaos");
  secPrice.innerHTML += `
    <div style="margin-top:4px;">
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Adaos global (%)</label>
      <input class="globalMarkup" type="number" step="0.01" value="${globalMarkup}"
        style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
      <div style="font-size:11px;opacity:.45;margin-top:3px;">Se aplică tuturor produselor fără override.</div>
    </div>

    <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);">
      <div style="font-size:12px;font-weight:800;opacity:.6;margin-bottom:8px;">OVERRIDE PER CATEGORIE</div>
      <div style="display:grid;grid-template-columns:1fr 80px auto auto;gap:8px;align-items:center;">
        <select class="catSelect" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;"></select>
        <input class="catMarkup" type="text" inputmode="decimal" pattern="-?\d+([.,]\d+)?" placeholder="-10" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:center;" />
        <button class="setCat" style="padding:10px 12px;border-radius:10px;border:none;background:#4da3ff;color:#07111d;font-weight:800;cursor:pointer;">Set</button>
        <button class="delCat" style="padding:10px 12px;border-radius:10px;border:none;background:rgba(255,93,93,.2);color:#ff5d5d;font-weight:800;cursor:pointer;">Del</button>
      </div>
      <div class="catList" style="margin-top:8px;"></div>
    </div>

    <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);">
      <div style="font-size:12px;font-weight:800;opacity:.6;margin-bottom:8px;">OVERRIDE PER PRODUS <span style="font-weight:400;opacity:.7">(înlocuiește adaosul global)</span></div>

      <!-- Filtrare categorie + căutare text -->
      <div style="display:grid;gap:8px;margin-bottom:10px;">
        <select class="prodCatFilter" style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:14px;">
          <option value="">— Toate categoriile —</option>
        </select>
        <input class="prodSearch" type="search" placeholder="🔍 Caută produs după nume..."
          style="width:100%;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:14px;box-sizing:border-box;" />
      </div>

      <!-- Select produs filtrat + procent -->
      <div style="display:grid;grid-template-columns:1fr 80px auto auto;gap:8px;align-items:center;margin-bottom:8px;">
        <select class="prodSelect" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:14px;"></select>
        <input class="prodMarkup" type="text" inputmode="decimal" pattern="-?\d+([.,]\d+)?" placeholder="-10" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:center;" />
        <button class="setProd" style="padding:10px 12px;border-radius:10px;border:none;background:#4da3ff;color:#07111d;font-weight:800;cursor:pointer;">Set</button>
        <button class="delProd" style="padding:10px 12px;border-radius:10px;border:none;background:rgba(255,93,93,.2);color:#ff5d5d;font-weight:800;cursor:pointer;">Del</button>
      </div>

      <div class="prodList" style="margin-top:8px;"></div>
    </div>
  `;
  div.appendChild(secPrice);

  // Populate category select (override categorie)
  const catSelect = secPrice.querySelector(".catSelect");
  ALL_CATEGORIES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = c.name;
    catSelect.appendChild(opt);
  });
  renderCatList(secPrice, categoriesObj);

  // Populate product category filter dropdown
  const prodCatFilter = secPrice.querySelector(".prodCatFilter");
  ALL_CATEGORIES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = c.name;
    prodCatFilter.appendChild(opt);
  });

  // Funcție care re-populează prodSelect pe baza filtrului + search
  const prodSelect = secPrice.querySelector(".prodSelect");
  const prodSearch = secPrice.querySelector(".prodSearch");

  function refreshProdSelect() {
    const catFilter = prodCatFilter.value;
    const search = prodSearch.value.trim().toLowerCase();
    const prev = prodSelect.value;

    prodSelect.innerHTML = "";

    const filtered = ALL_PRODUCTS.filter(p => {
      const matchCat = !catFilter || p.category === catFilter;
      const matchSearch = !search || p.name.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });

    if (!filtered.length) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "(niciun produs găsit)";
      prodSelect.appendChild(opt);
    } else {
      filtered.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id; opt.textContent = p.name;
        if (p.id === prev) opt.selected = true;
        prodSelect.appendChild(opt);
      });
    }
  }

  refreshProdSelect();
  prodCatFilter.addEventListener("change", refreshProdSelect);
  prodSearch.addEventListener("input", refreshProdSelect);

  renderProdList(secPrice, productsObj);

  // ===== SECȚIUNEA: Livrare =====
  const deliveryDates = calcDeliveryDates(deliveryStart, deliveryInt);
  const datesPreview = deliveryDates.length ? deliveryDates.map(d => formatDateRO(d)).join(" → ") : "(setează data start)";

  const secDelivery = makeSectionCard("Livrare");
  secDelivery.innerHTML += `
    <div style="margin-top:4px;display:grid;gap:10px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Zi livrare (din județul clientului — automat)</label>
        <input class="deliveryDay" type="text" value="${escapeHtml(u?.deliveryDay || "")}" readonly
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);color:#e8eef6;font-size:15px;opacity:.7;box-sizing:border-box;" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Frecvență livrare</label>
          <select class="deliveryFreq" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
            ${[1,2,3,4,5,6].map(n => `<option value="${n}"${n == deliveryFreq ? " selected" : ""}>${n}x</option>`).join("")}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Interval (zile)</label>
          <select class="deliveryInt" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
            ${Array.from({length:30},(_,i)=>i+1).map(n => `<option value="${n}"${n == deliveryInt ? " selected" : ""}>${n} zile</option>`).join("")}
          </select>
        </div>
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Data de start livrare</label>
        <input class="deliveryStart" type="date" value="${deliveryStart ? deliveryStart.split("T")[0] : ""}"
          style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
      </div>
      <div class="deliveryPreview" style="background:rgba(77,163,255,.08);border:1px solid rgba(77,163,255,.2);border-radius:12px;padding:12px;font-size:14px;">
        📅 Următoarele livrări: <b>${datesPreview}</b>
      </div>
    </div>
  `;
  div.appendChild(secDelivery);

  function updateDeliveryPreview() {
    const start = secDelivery.querySelector(".deliveryStart").value;
    const interval = Number(secDelivery.querySelector(".deliveryInt").value);
    const dates = calcDeliveryDates(start, interval);
    const preview = secDelivery.querySelector(".deliveryPreview");
    preview.innerHTML = `📅 Următoarele livrări: <b>${dates.length ? dates.map(d => formatDateRO(d)).join(" → ") : "(selectează data start)"}</b>`;
  }
  secDelivery.querySelector(".deliveryStart").addEventListener("change", updateDeliveryPreview);
  secDelivery.querySelector(".deliveryInt").addEventListener("change", updateDeliveryPreview);

  // ===== BUTOANE =====
  const actDiv = document.createElement("div");
  actDiv.style.marginTop = "14px";

  if (isPending) {
    const btnApprove = makeBtn("✅ Aprobă & Activează", "#35d07f", "#07111d");
    actDiv.appendChild(btnApprove);
    btnApprove.onclick = () => saveUser(uid, u, secGeneral, secPrice, secDelivery, secContact, categoriesObj, productsObj, true);
  } else {
    const btnSave = makeBtn("💾 Salvează modificările", "#4da3ff", "#07111d");
    const btnDeactivate = makeBtn("⏸ Trece în pending", "rgba(255,93,93,.12)", "#ff5d5d");
    actDiv.appendChild(btnSave);
    actDiv.appendChild(btnDeactivate);
    btnSave.onclick = () => saveUser(uid, u, secGeneral, secPrice, secDelivery, secContact, categoriesObj, productsObj, false);
    btnDeactivate.onclick = async () => {
      if (!confirm("Sigur?")) return;
      await updateDoc(doc(db, "users", uid), { status: "pending", updatedAt: serverTimestamp() });
      await loadUsers();
    };
  }
  div.appendChild(actDiv);

  // ===== HANDLERS CATEGORII & PRODUSE =====
  secPrice.querySelector(".setCat").onclick = async () => {
    const catId = secPrice.querySelector(".catSelect").value;
    const value = secPrice.querySelector(".catMarkup").value;
    const raw = value.trim().replace(",", ".");
    const parsed = raw === "" ? 0 : Number(raw);
    if (!catId) return alert("Selectează categoria.");
    if (!Number.isFinite(parsed)) return alert("Procent invalid.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.categories.${catId}`]: parsed, updatedAt: serverTimestamp() });
    await loadUsers();
  };
  secPrice.querySelector(".delCat").onclick = async () => {
    const catId = secPrice.querySelector(".catSelect").value;
    if (!catId) return alert("Selectează categoria.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.categories.${catId}`]: deleteField(), updatedAt: serverTimestamp() });
    await loadUsers();
  };
  secPrice.querySelector(".setProd").onclick = async () => {
    const prodId = secPrice.querySelector(".prodSelect").value;
    const value = secPrice.querySelector(".prodMarkup").value;
    const raw = value.trim().replace(",", ".");
    const parsed = raw === "" ? 0 : Number(raw);
    if (!prodId) return alert("Selectează produsul.");
    if (!Number.isFinite(parsed)) return alert("Procent invalid.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.products.${prodId}`]: parsed, updatedAt: serverTimestamp() });
    await loadUsers();
  };
  secPrice.querySelector(".delProd").onclick = async () => {
    const prodId = secPrice.querySelector(".prodSelect").value;
    if (!prodId) return alert("Selectează produsul.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.products.${prodId}`]: deleteField(), updatedAt: serverTimestamp() });
    await loadUsers();
  };

  return div;
}

// -------------------- SAVE USER --------------------

async function saveUser(uid, uData, secGeneral, secPrice, secDelivery, secContact, categoriesObj, productsObj, activate) {
  const clientType   = secGeneral.querySelector(".clientType").value;
  const channel      = secGeneral.querySelector(".channel").value;
  const referrerUid  = secGeneral.querySelector(".referrer").value || "";
  const globalMarkup = Number(secPrice.querySelector(".globalMarkup").value || 0);
  const fontColor    = secGeneral.querySelector(".fontColorPicker").value;
  const deliveryStart= secDelivery.querySelector(".deliveryStart").value || "";
  const deliveryFreq = Number(secDelivery.querySelector(".deliveryFreq").value || 1);
  const deliveryInt  = Number(secDelivery.querySelector(".deliveryInt").value || 7);

  // Contact fields
  const contactFullName = secContact.querySelector(".contactFullName").value.trim();
  const contactKennel   = secContact.querySelector(".contactKennel").value.trim();
  const contactAddress  = secContact.querySelector(".contactAddress").value.trim();
  const contactCounty   = secContact.querySelector(".contactCounty").value;
  const contactCity     = secContact.querySelector(".contactCity").value.trim();

  if (!clientType) return alert("Selectează tip client.");
  if (!channel) return alert("Selectează canalul.");
  if (channel === "recomandare_crescator" && !referrerUid) return alert("Selectează afiliatul.");

  // Detectează ziua de livrare din județul selectat în secContact
  const countyData = ALL_COUNTIES.find(c =>
    c.name.toLowerCase() === contactCounty.toLowerCase() || c.id === contactCounty.toLowerCase()
  );
  const deliveryDay = countyData?.deliveryDay || uData?.deliveryDay || "";

  const ref = ALL_USERS.find(x => x.uid === referrerUid);

  const payload = {
    clientType, channel, fontColor,
    referrerUid: channel === "recomandare_crescator" ? referrerUid : "",
    referrerPhone: channel === "recomandare_crescator" ? (ref?.phone || "") : "",
    priceRules: { globalMarkup, categories: categoriesObj || {}, products: productsObj || {} },
    deliveryDay,
    deliveryFrequency: deliveryFreq,
    deliveryIntervalDays: deliveryInt,
    deliveryStartDate: deliveryStart,
    // Contact fields (dot-notation for nested update without overwriting contact.completed)
    "contact.fullName": contactFullName,
    "contact.kennel":   contactKennel,
    "contact.address":  contactAddress,
    "contact.county":   contactCounty,
    "contact.city":     contactCity,
    updatedAt: serverTimestamp(),
  };
  if (activate) payload.status = "active";

  await updateDoc(doc(db, "users", uid), payload);
  alert(activate ? "Client activat!" : "Modificări salvate!");
  await loadUsers();
  const h = (location.hash || "").replace("#", "");
  if (h.startsWith("client/")) {
    const detailUid = decodeURIComponent(h.slice(7));
    if (detailUid === uid) loadClientDetail(uid);
  }
}

// -------------------- PROMOTIONS --------------------

async function loadPromotions() {
  const container = $("promotionsContainer");
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "promotions"), orderBy("createdAt", "desc")));
    renderPromotions(container, snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    console.error(e);
  }
}

function tsToInputDate(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return d.toISOString().split("T")[0];
}

function calcPromoStatus(p) {
  const now = new Date();
  if (!p.active) return { label: "Inactivă", color: "#ff5d5d" };
  const start = p.startDate?.toDate ? p.startDate.toDate() : null;
  const end   = p.endDate?.toDate   ? p.endDate.toDate()   : null;
  if (start && now < start) return { label: "Programată", color: "#f5a623" };
  if (end   && now > end)   return { label: "Expirată",   color: "#9fb0c3" };
  return { label: "Activă", color: "#35d07f" };
}

function formatPromoInterval(p) {
  const start = p.startDate?.toDate ? p.startDate.toDate().toLocaleDateString("ro-RO") : null;
  const end   = p.endDate?.toDate   ? p.endDate.toDate().toLocaleDateString("ro-RO")   : null;
  if (start && end)  return `${start} → ${end}`;
  if (start)         return `Din ${start}`;
  if (end)           return `Până pe ${end}`;
  return "";
}

const QUILL_TOOLBAR = [["bold", "italic", "underline"], ["link"], [{ list: "ordered" }, { list: "bullet" }], ["clean"]];

let addQuill = null;
let currentEditQuill = null;

function renderPromotions(container, promos) {
  const inputStyle = `width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:14px;box-sizing:border-box;`;

  container.innerHTML = `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:800;opacity:.45;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px;">Promoție nouă</div>
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Conținut promoție</label>
      <div id="promoQuillEditor" style="margin-bottom:10px;min-width:0;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Dată start (opțional)</label>
          <input id="promoStart" type="date" style="${inputStyle}" />
        </div>
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Dată final (opțional)</label>
          <input id="promoEnd" type="date" style="${inputStyle}" />
        </div>
      </div>
      <button id="btnAddPromo" style="width:100%;padding:14px;border-radius:12px;border:none;background:#4da3ff;color:#07111d;font-weight:900;font-size:15px;cursor:pointer;">
        + Publică promoție
      </button>
    </div>
    <div id="promoList"></div>
  `;

  if (typeof Quill !== "undefined") {
    addQuill = new Quill("#promoQuillEditor", { theme: "snow", modules: { toolbar: QUILL_TOOLBAR } });
  }

  $("btnAddPromo").onclick = async () => {
    const contentText = addQuill ? addQuill.getText().trim() : "";
    if (!contentText) return alert("Completează conținutul.");
    const startVal = $("promoStart").value;
    const endVal   = $("promoEnd").value;
    const contentHtml = addQuill ? addQuill.root.innerHTML : contentText;
    const contentDelta = addQuill && addQuill.getContents ? addQuill.getContents() : null;
    const payload = {
      contentHtml,
      contentDelta: contentDelta && contentDelta.ops ? { ops: contentDelta.ops } : null,
      contentText,
      text: contentText,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "",
      startDate: startVal ? new Date(startVal) : null,
      endDate:   endVal   ? new Date(endVal)   : null,
    };
    await addDoc(collection(db, "promotions"), payload);
    if (addQuill) addQuill.setContents([]);
    $("promoStart").value = "";
    $("promoEnd").value = "";
    await loadPromotions();
  };

  const listEl = $("promoList");
  if (!promos.length) {
    listEl.innerHTML = `<div style="opacity:.6;font-size:14px;padding:8px 0;">Nu există promoții.</div>`;
    return;
  }

  promos.forEach(p => {
    const status   = calcPromoStatus(p);
    const interval = formatPromoInterval(p);
    const when     = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString("ro-RO") : "";
    const contentSafe = getPromoContentForDisplay(p);
    const previewText = p.contentText || p.text || "";

    const row = document.createElement("div");
    row.style.cssText = `border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:14px;margin-bottom:10px;`;

    const viewEl = document.createElement("div");
    viewEl.className = "promo-view";
    viewEl.innerHTML = `
      <div class="promo-row">
        <div class="promo-content-wrap">
          <div class="promo-content-body"></div>
          <div style="font-size:12px;opacity:.5;">
            Creat: ${when}
            ${interval ? `&nbsp;|&nbsp; 📅 ${escapeHtml(interval)}` : ""}
            &nbsp;|&nbsp; <span style="color:${status.color};font-weight:700;">${status.label}</span>
          </div>
        </div>
        <div class="promo-actions-wrap">
          <button class="btnEditPromo" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:13px;">✏️ Editează</button>
          <button class="btnTogglePromo" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:13px;white-space:nowrap;">
            ${p.active ? "Dezactivează" : "Activează"}
          </button>
          <button class="btnDeletePromo" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,93,93,.3);background:rgba(255,93,93,.08);color:#ff5d5d;cursor:pointer;font-size:13px;">🗑️</button>
        </div>
      </div>
    `;
    viewEl.querySelector(".promo-content-body").innerHTML = contentSafe;

    const editEl = document.createElement("div");
    editEl.className = "promo-edit";
    editEl.style.display = "none";
    editEl.innerHTML = `
      <div style="font-size:12px;font-weight:800;opacity:.45;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Editează promoție</div>
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Conținut</label>
      <div class="editQuillContainer" style="min-width:0;margin-bottom:10px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Dată start</label>
          <input class="editStart" type="date" value="${tsToInputDate(p.startDate)}" style="${inputStyle}" />
        </div>
        <div>
          <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Dată final</label>
          <input class="editEnd" type="date" value="${tsToInputDate(p.endDate)}" style="${inputStyle}" />
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btnSaveEdit" style="flex:1;min-width:120px;padding:12px;border-radius:12px;border:none;background:#35d07f;color:#07111d;font-weight:900;font-size:15px;cursor:pointer;">💾 Salvează</button>
        <button class="btnCancelEdit" style="padding:12px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Anulează</button>
      </div>
    `;

    row.appendChild(viewEl);
    row.appendChild(editEl);

    viewEl.querySelector(".btnEditPromo").onclick = () => {
      viewEl.style.display = "none";
      editEl.style.display = "block";
      const container = editEl.querySelector(".editQuillContainer");
      if (currentEditQuill) try { currentEditQuill.destroy(); } catch (e) {}
      currentEditQuill = null;
      if (typeof Quill !== "undefined" && container) {
        currentEditQuill = new Quill(container, { theme: "snow", modules: { toolbar: QUILL_TOOLBAR } });
        if (p.contentDelta && p.contentDelta.ops && p.contentDelta.ops.length) {
          currentEditQuill.setContents(p.contentDelta);
        } else if (p.contentHtml) {
          currentEditQuill.clipboard.dangerouslyPasteHTML(sanitizePromoHtml(p.contentHtml, p.contentText || p.text || ""));
        } else {
          currentEditQuill.setText(p.text || p.contentText || "");
        }
      }
    };

    editEl.querySelector(".btnCancelEdit").onclick = () => {
      if (currentEditQuill) try { currentEditQuill.destroy(); } catch (e) {}
      currentEditQuill = null;
      editEl.style.display = "none";
      viewEl.style.display = "block";
    };

    editEl.querySelector(".btnSaveEdit").onclick = async () => {
      const contentText = currentEditQuill ? currentEditQuill.getText().trim() : "";
      if (!contentText) return alert("Conținutul nu poate fi gol.");
      const contentHtml = currentEditQuill ? currentEditQuill.root.innerHTML : contentText;
      const contentDelta = currentEditQuill && currentEditQuill.getContents ? currentEditQuill.getContents() : null;
      await updateDoc(doc(db, "promotions", p.id), {
        contentHtml,
        contentDelta: contentDelta && contentDelta.ops ? { ops: contentDelta.ops } : null,
        contentText,
        text: contentText,
        startDate: editEl.querySelector(".editStart").value ? new Date(editEl.querySelector(".editStart").value) : null,
        endDate:   editEl.querySelector(".editEnd").value ? new Date(editEl.querySelector(".editEnd").value) : null,
        updatedAt: serverTimestamp(),
      });
      if (currentEditQuill) try { currentEditQuill.destroy(); } catch (e) {}
      currentEditQuill = null;
      await loadPromotions();
    };

    viewEl.querySelector(".btnTogglePromo").onclick = async () => {
      await updateDoc(doc(db, "promotions", p.id), { active: !p.active, updatedAt: serverTimestamp() });
      await loadPromotions();
    };

    viewEl.querySelector(".btnDeletePromo").onclick = async () => {
      if (!confirm(`Ștergi promoția "${escapeHtml(previewText.slice(0, 80))}${previewText.length > 80 ? "…" : ""}"?`)) return;
      const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
      await deleteDoc(doc(db, "promotions", p.id));
      await loadPromotions();
    };

    listEl.appendChild(row);
  });
}

// -------------------- NOTIFICATIONS / WhatsApp --------------------

function initNotificationsSection() {
  const container = $("notificationsContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="display:grid;gap:12px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Selectează județul</label>
        <select id="notifCounty" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:#0b111a;color:#fff;font-size:15px;">
          <option value="">— alege județul —</option>
          ${ALL_COUNTIES.map(c => `<option value="${c.id}" data-name="${escapeHtml(c.name)}" data-day="${escapeHtml(c.deliveryDay)}">${escapeHtml(c.name)} (${c.deliveryDay || "—"})</option>`).join("")}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Mesaj WhatsApp (editabil)</label>
        <textarea id="notifMsg" rows="4" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;resize:vertical;box-sizing:border-box;">Bună ziua! Mâine, {ZI}, livrăm în {JUDEȚ}. Vă rugăm trimiteți comanda până la ora 18:00. Mulțumim!</textarea>
      </div>
      <button id="btnLoadClients" style="width:100%;padding:14px;border-radius:12px;border:none;background:#4da3ff;color:#07111d;font-weight:900;font-size:15px;cursor:pointer;">
        🔍 Încarcă clienții din județ
      </button>
      <div id="notifClientsList"></div>
    </div>
  `;

  $("notifCounty").addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    const day = opt?.dataset?.day || "{ZI}";
    const name = opt?.dataset?.name || "{JUDEȚ}";
    const msgEl = $("notifMsg");
    msgEl.value = "Bună ziua! Mâine, {ZI}, livrăm în {JUDEȚ}. Vă rugăm trimiteți comanda până la ora 18:00. Mulțumim!"
      .replace(/\{ZI\}/g, day).replace(/\{JUDEȚ\}/g, name);
  });

  $("btnLoadClients").onclick = async () => {
    const countyId = $("notifCounty").value;
    if (!countyId) return alert("Selectează județul.");
    const county = ALL_COUNTIES.find(c => c.id === countyId);
    const countyName = county?.name || countyId;
    const msgTemplate = $("notifMsg").value;
    const listEl = $("notifClientsList");
    listEl.innerHTML = `<div style="opacity:.6;padding:10px;">Se încarcă...</div>`;

    try {
      const allSnap = await getDocs(query(collection(db, "users"), where("status", "==", "active")));
      const clients = [];
      allSnap.forEach(s => {
        const d = s.data();
        const uc = (d?.contact?.county || "").toLowerCase();
        if (uc === countyName.toLowerCase() || uc === countyId.toLowerCase()) {
          clients.push({ uid: s.id, ...d });
        }
      });

      if (!clients.length) {
        listEl.innerHTML = `<div style="opacity:.6;padding:10px;">Nu există clienți activi în ${escapeHtml(countyName)}.</div>`;
        return;
      }

      listEl.innerHTML = `<div style="font-size:13px;opacity:.6;margin-bottom:10px;padding-top:4px;">${clients.length} clienți găsiți în ${escapeHtml(countyName)}</div>`;

      clients.forEach(client => {
        const phone = String(client.phone || "").replace(/\D/g, "");
        const name = client?.contact?.fullName || client.phone || "Client";
        const msg = msgTemplate.replace(/\{ZI\}/g, county?.deliveryDay || "").replace(/\{JUDEȚ\}/g, countyName);

        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);margin-bottom:8px;`;
        row.innerHTML = `
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;">${escapeHtml(name)}</div>
            <div style="font-size:13px;opacity:.6;">${escapeHtml(client.phone || "—")}</div>
          </div>
          <a href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" target="_blank"
            style="display:inline-flex;align-items:center;gap:6px;padding:12px 16px;border-radius:12px;background:rgba(37,211,102,.15);border:1px solid rgba(37,211,102,.3);color:#25d366;font-weight:800;font-size:14px;text-decoration:none;white-space:nowrap;flex-shrink:0;">
            📱 WhatsApp
          </a>
        `;
        listEl.appendChild(row);
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<div style="color:#ff5d5d;padding:10px;">Eroare: ${escapeHtml(e?.message || "")}</div>`;
    }
  };
}

// -------------------- RESETARE PAROLE --------------------

let _unsubPasswordResets = null;

function loadPasswordResetRequests() {
  const container = $("passwordResetsContainer");
  if (!container) return;

  if (_unsubPasswordResets) { try { _unsubPasswordResets(); } catch {} }

  const q = query(
    collection(db, "passwordResetRequests"),
    orderBy("createdAt", "desc")
  );

  _unsubPasswordResets = onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPasswordResets(container, requests);
  }, (err) => {
    container.innerHTML = `<div style="color:#ff5d5d;font-size:13px;">Eroare: ${escapeHtml(err?.message || "")}</div>`;
  });
}

function renderPasswordResets(container, requests) {
  if (!requests.length) {
    container.innerHTML = `<div style="opacity:.5;font-size:13px;padding:10px 0;">Nu există cereri de resetare.</div>`;
    return;
  }

  const pending = requests.filter(r => r.status !== 'resolved');
  const resolved = requests.filter(r => r.status === 'resolved');

  let html = '';

  if (pending.length) {
    html += `<div class="section-title" style="margin-top:0;">⏳ În așteptare (${pending.length})</div>`;
    pending.forEach(req => {
      const when = req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString('ro-RO') : '—';
      html += `
        <div data-req-id="${escapeHtml(req.id)}" data-req-phone="${escapeHtml(req.phone || '')}"
          style="border:1px solid rgba(255,183,77,.25);background:rgba(255,183,77,.05);border-radius:14px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;font-size:15px;">${escapeHtml(req.phone || '—')}</div>
              <div style="font-size:12px;opacity:.55;margin-top:2px;">${escapeHtml(when)}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btnSetPass"
                style="padding:8px 14px;border-radius:10px;background:rgba(77,163,255,.2);border:1px solid rgba(77,163,255,.4);color:#4da3ff;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">
                🔑 Setează parola
              </button>
              <button class="btnResolveReset"
                style="padding:8px 12px;border-radius:10px;background:rgba(53,208,127,.1);border:1px solid rgba(53,208,127,.25);color:#35d07f;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">
                ✓ Rezolvat
              </button>
            </div>
          </div>
          <div class="resetPassForm" hidden style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:12px;opacity:.65;">Parolă nouă pentru <strong>${escapeHtml(req.phone || '—')}</strong>:</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <input type="password" class="inputNewPass" placeholder="Parolă nouă (min. 6 car.)"
                style="flex:1;min-width:160px;padding:8px 12px;border-radius:10px;background:#0b0f14;border:1px solid #223044;color:#e8eef6;font-size:14px;">
              <button class="btnConfirmPass"
                style="padding:8px 14px;border-radius:10px;background:#4da3ff;color:#0b0f14;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap;">
                Salvează
              </button>
              <button class="btnCancelPass"
                style="padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#9fb0c3;font-weight:700;font-size:13px;cursor:pointer;">
                Anulează
              </button>
            </div>
            <div class="resetMsg" style="font-size:12px;display:none;"></div>
          </div>
        </div>`;
    });
  }

  if (resolved.length) {
    html += `<div class="section-title" style="margin-top:20px;">✅ Rezolvate (${resolved.length})</div>`;
    resolved.forEach(req => {
      const when = req.resolvedAt?.toDate ? req.resolvedAt.toDate().toLocaleString('ro-RO') : '—';
      html += `
        <div style="border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);border-radius:14px;padding:12px 14px;margin-bottom:8px;opacity:.7;">
          <div style="font-weight:700;font-size:14px;">${escapeHtml(req.phone || '—')}</div>
          <div style="font-size:12px;opacity:.55;">Rezolvat: ${escapeHtml(when)}</div>
        </div>`;
    });
  }

  container.innerHTML = html;

  const resetUserPassword = httpsCallable(functions, 'adminResetUserPassword');

  // Buton "Seteaza parola"
  container.querySelectorAll('.btnSetPass').forEach(btn => {
    const card = btn.closest('[data-req-id]');
    const form = card.querySelector('.resetPassForm');
    btn.addEventListener('click', () => {
      form.hidden = false;
      card.querySelector('.inputNewPass').focus();
    });
  });

  // Buton "Anuleaza"
  container.querySelectorAll('.btnCancelPass').forEach(btn => {
    const card = btn.closest('[data-req-id]');
    btn.addEventListener('click', () => {
      card.querySelector('.resetPassForm').hidden = true;
      card.querySelector('.inputNewPass').value = '';
      const msg = card.querySelector('.resetMsg');
      msg.style.display = 'none';
    });
  });

  // Buton "Salveaza" — apeleaza Cloud Function
  container.querySelectorAll('.btnConfirmPass').forEach(btn => {
    const card = btn.closest('[data-req-id]');
    const reqId = card.dataset.reqId;
    const phone = card.dataset.reqPhone;
    const input = card.querySelector('.inputNewPass');
    const msg = card.querySelector('.resetMsg');

    btn.addEventListener('click', async () => {
      const newPassword = input.value.trim();
      if (newPassword.length < 6) {
        msg.textContent = 'Parola trebuie să aibă minim 6 caractere.';
        msg.style.color = '#ff5d5d';
        msg.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Se procesează…';
      msg.style.display = 'none';
      try {
        await resetUserPassword({ phone, newPassword, requestId: reqId });
        msg.textContent = `✅ Parola a fost setată pentru ${phone}. Informează clientul!`;
        msg.style.color = '#35d07f';
        msg.style.display = 'block';
        input.value = '';
        btn.textContent = '✓ Gata';
      } catch (e) {
        msg.textContent = e?.message || 'Eroare la resetarea parolei.';
        msg.style.color = '#ff5d5d';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Salvează';
      }
    });
  });

  // Buton "Rezolvat" (fara schimbare parola)
  container.querySelectorAll('.btnResolveReset').forEach(btn => {
    const card = btn.closest('[data-req-id]');
    const reqId = card.dataset.reqId;
    btn.addEventListener('click', async () => {
      if (!reqId) return;
      btn.disabled = true;
      btn.textContent = 'Se salvează…';
      try {
        await updateDoc(doc(db, 'passwordResetRequests', reqId), {
          status: 'resolved',
          resolvedAt: serverTimestamp(),
        });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '✓ Rezolvat';
        alert(e?.message || 'Eroare.');
      }
    });
  });
}