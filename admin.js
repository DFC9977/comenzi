// admin.js (ROOT, lângă admin.html)
import { auth, db } from "./js/firebase.js";
import { normalizePhone, phoneToEmail } from "./js/auth.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
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
let ALL_PRODUCTS = [];
let ALL_COUNTIES = [];

// -------------------- HELPERS --------------------

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  $("me").textContent = "";
  $("pending").innerHTML = "";
  $("active").innerHTML = "";
  showMsg("");
  document.querySelectorAll(".admin-section").forEach(s => s.style.display = u ? "block" : "none");

  // Ascunde formularul de login dacă sesiunea e activă
  const authCard = $("authCard");
  if (authCard) authCard.style.display = u ? "none" : "block";

  if (!u) return;

  try {
    const meSnap = await getDoc(doc(db, "users", u.uid));
    const me = meSnap.exists() ? meSnap.data() : null;
    $("me").innerHTML = `<small style="opacity:.6">UID: ${u.uid}</small> | <b>role:</b> ${me?.role || "—"}`;
    if (me?.role !== "admin") {
      showMsg("Nu ești admin.", true);
      if (authCard) authCard.style.display = "block";
      document.querySelectorAll(".admin-section").forEach(s => s.style.display = "none");
      return;
    }
    await Promise.all([loadCategories(), loadProducts(), loadCounties()]);
    await loadUsers();
    await loadPromotions();
    initNotificationsSection();
  } catch (e) {
    console.error(e);
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

async function loadUsers() {
  $("pending").innerHTML = "";
  $("active").innerHTML = "";
  try {
    const allSnap = await getDocs(collection(db, "users"));
    ALL_USERS = [];
    allSnap.forEach(s => {
      const d = s.data() || {};
      ALL_USERS.push({ uid: s.id, phone: d.phone || "", name: d.contact?.fullName || "" });
    });

    const pendSnap = await getDocs(query(collection(db, "users"), where("status", "==", "pending")));
    $("pending").innerHTML = pendSnap.size ? "" : `<div style="opacity:.6;font-size:14px;padding:10px;">Niciun client în așteptare.</div>`;
    pendSnap.forEach(s => $("pending").appendChild(renderUserCard(s.id, s.data(), true)));

    const actSnap = await getDocs(query(collection(db, "users"), where("status", "==", "active")));
    $("active").innerHTML = actSnap.size ? "" : `<div style="opacity:.6;font-size:14px;padding:10px;">Niciun client activ.</div>`;
    actSnap.forEach(s => $("active").appendChild(renderUserCard(s.id, s.data(), false)));
  } catch (e) {
    console.error(e);
    showMsg(e?.message || String(e), true);
  }
}

// -------------------- COUNTIES SECTION --------------------

function renderCountiesSection() {
  const container = $("countiesContainer");
  if (!container) return;
  const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri"];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:14px;">
      <div>
        <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Județ</label>
        <input id="newCountyName" placeholder="ex: Satu Mare" style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;box-sizing:border-box;" />
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
    const name = $("newCountyName").value.trim();
    const day = $("newCountyDay").value;
    if (!name) return alert("Completează județul.");
    if (!day) return alert("Selectează ziua.");
    const id = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    await setDoc(doc(db, "counties", id), { name, deliveryDay: day, updatedAt: serverTimestamp() }, { merge: true });
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
        <input class="catMarkup" type="number" step="0.01" placeholder="%" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:center;" />
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
        <input class="prodMarkup" type="number" step="0.01" placeholder="%" style="padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:center;" />
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
    btnApprove.onclick = () => saveUser(uid, u, secGeneral, secPrice, secDelivery, categoriesObj, productsObj, true);
  } else {
    const btnSave = makeBtn("💾 Salvează modificările", "#4da3ff", "#07111d");
    const btnDeactivate = makeBtn("⏸ Trece în pending", "rgba(255,93,93,.12)", "#ff5d5d");
    actDiv.appendChild(btnSave);
    actDiv.appendChild(btnDeactivate);
    btnSave.onclick = () => saveUser(uid, u, secGeneral, secPrice, secDelivery, categoriesObj, productsObj, false);
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
    const val = Number(secPrice.querySelector(".catMarkup").value);
    if (!catId) return alert("Selectează categoria.");
    if (!Number.isFinite(val)) return alert("Procent invalid.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.categories.${catId}`]: val, updatedAt: serverTimestamp() });
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
    const val = Number(secPrice.querySelector(".prodMarkup").value);
    if (!prodId) return alert("Selectează produsul.");
    if (!Number.isFinite(val)) return alert("Procent invalid.");
    await updateDoc(doc(db, "users", uid), { [`priceRules.products.${prodId}`]: val, updatedAt: serverTimestamp() });
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

async function saveUser(uid, uData, secGeneral, secPrice, secDelivery, categoriesObj, productsObj, activate) {
  const clientType   = secGeneral.querySelector(".clientType").value;
  const channel      = secGeneral.querySelector(".channel").value;
  const referrerUid  = secGeneral.querySelector(".referrer").value || "";
  const globalMarkup = Number(secPrice.querySelector(".globalMarkup").value || 0);
  const fontColor    = secGeneral.querySelector(".fontColorPicker").value;
  const deliveryStart= secDelivery.querySelector(".deliveryStart").value || "";
  const deliveryFreq = Number(secDelivery.querySelector(".deliveryFreq").value || 1);
  const deliveryInt  = Number(secDelivery.querySelector(".deliveryInt").value || 7);

  if (!clientType) return alert("Selectează tip client.");
  if (!channel) return alert("Selectează canalul.");
  if (channel === "recomandare_crescator" && !referrerUid) return alert("Selectează afiliatul.");

  // Detectează ziua de livrare din județ
  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const userCounty = userData?.contact?.county || "";
  const countyData = ALL_COUNTIES.find(c =>
    c.name.toLowerCase() === userCounty.toLowerCase() || c.id === userCounty.toLowerCase()
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
    updatedAt: serverTimestamp(),
  };
  if (activate) payload.status = "active";

  await updateDoc(doc(db, "users", uid), payload);
  alert(activate ? "Client activat!" : "Modificări salvate!");
  await loadUsers();
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

function renderPromotions(container, promos) {
  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;opacity:.6;margin-bottom:4px;">Text promoție nouă</label>
      <textarea id="promoText" rows="3" placeholder="ex: 🎉 Reducere 10% până pe 31 martie!"
        style="width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;resize:vertical;box-sizing:border-box;"></textarea>
      <button id="btnAddPromo" style="width:100%;margin-top:10px;padding:14px;border-radius:12px;border:none;background:#4da3ff;color:#07111d;font-weight:900;font-size:15px;cursor:pointer;">
        + Publică promoție
      </button>
    </div>
    <div id="promoList"></div>
  `;

  $("btnAddPromo").onclick = async () => {
    const text = $("promoText").value.trim();
    if (!text) return alert("Completează textul.");
    await addDoc(collection(db, "promotions"), { text, active: true, createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid || "" });
    $("promoText").value = "";
    await loadPromotions();
  };

  const listEl = $("promoList");
  if (!promos.length) {
    listEl.innerHTML = `<div style="opacity:.6;font-size:14px;padding:8px 0;">Nu există promoții.</div>`;
    return;
  }

  promos.forEach(p => {
    const row = document.createElement("div");
    row.style.cssText = `border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:14px;padding:14px;margin-bottom:10px;`;
    const when = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString("ro-RO") : "";
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div style="font-size:15px;margin-bottom:6px;">${escapeHtml(p.text)}</div>
          <div style="font-size:12px;opacity:.5;">${when} &nbsp;|&nbsp;
            <span style="color:${p.active ? "#35d07f" : "#ff5d5d"};">${p.active ? "Activă" : "Inactivă"}</span>
          </div>
        </div>
        <button class="togglePromo" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:13px;white-space:nowrap;flex-shrink:0;">
          ${p.active ? "Dezactivează" : "Activează"}
        </button>
      </div>
    `;
    row.querySelector(".togglePromo").onclick = async () => {
      await updateDoc(doc(db, "promotions", p.id), { active: !p.active, updatedAt: serverTimestamp() });
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