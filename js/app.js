// js/app.js

import { auth, db } from "./firebase.js";
import { submitOrder } from "./orders.js";
import { clearCart, getItemCount } from "./cart.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
;
window.addEventListener("catalog:submitOrderRequested", async (event) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert("Trebuie să fii logat.");
      return;
    }

    const items = event.detail?.items || [];

    if (!items.length) {
      alert("Coș gol.");
      return;
    }

    const result = await submitOrder({
      clientId: user.uid,
      clientName: user.email || "",
      items
    });

    await clearCart();

    alert(`Comanda #${result.orderNumber} a fost trimisă.`);
  } catch (err) {
    console.error(err);
    alert(err.message || "Eroare la trimiterea comenzii.");
  }
});

import {
  fillCountyOptions,
  fillCityDatalist,
  getUserProfile,
  isContactComplete,
  saveContact,
} from "./profile.js";

import { loadProducts, renderProducts } from "./catalog.js";

/* -------------------- DOM -------------------- */
const screenLoading = document.getElementById("screenLoading");
const screenLogin = document.getElementById("screenLogin");
const screenContactGate = document.getElementById("screenContactGate");
const screenCatalog = document.getElementById("screenCatalog");
const screenAdmin = document.getElementById("screenAdmin");

const sessionInfo = document.getElementById("sessionInfo");
const btnLogout = document.getElementById("btnLogout");
const btnAdmin = document.getElementById("btnAdmin");
const btnOrdersAdmin = document.getElementById("btnOrdersAdmin");

const loginPhone = document.getElementById("loginPhone");
const loginPass = document.getElementById("loginPass");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const loginMsg = document.getElementById("loginMsg");

const fullName = document.getElementById("fullName");
const address = document.getElementById("address");
const countySelect = document.getElementById("countySelect");
const cityInput = document.getElementById("cityInput");
const cityList = document.getElementById("cityList");
const btnSaveContact = document.getElementById("btnSaveContact");
const btnBackToLogin = document.getElementById("btnBackToLogin");
const contactMsg = document.getElementById("contactMsg");

const productsGrid = document.getElementById("productsGrid");
const catalogHint = document.getElementById("catalogHint");
const btnRefreshProducts = document.getElementById("btnRefreshProducts");

const btnBackToCatalog = document.getElementById("btnBackToCatalog");
const adminFrame = document.getElementById("adminFrame");

/* -------------------- Helpers -------------------- */
function showOnly(el) {
  const screens = [screenLoading, screenLogin, screenContactGate, screenCatalog, screenAdmin];
  for (const s of screens) if (s) s.hidden = (s !== el);
}

function showNote(el, text, kind = "info") {
  if (!el) return;
  el.hidden = false;
  el.textContent = text || "";
  el.classList.remove("ok", "err", "info");
  el.classList.add(kind);
}

function clearNote(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
  el.classList.remove("ok", "err", "info");
}

function normalizePhone(p) {
  return String(p || "").replace(/\s+/g, "").trim();
}

function phoneToEmail(phone) {
  const p = normalizePhone(phone);
  return p ? `${p}@phone.local` : "";
}

async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const phone = (user.email || "").replace("@phone.local", "");
  const payload = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    role: "client",
    status: "pending",
    phone: phone || "",
    email: user.email || "",
    contact: { completed: false },
  };

  await setDoc(ref, payload, { merge: true });
  return payload;
}

function setSessionText(user) {
  if (!user) {
    sessionInfo.textContent = "Neautentificat";
    btnLogout.hidden = true;
    if (btnAdmin) btnAdmin.style.display = "none";
    if (btnOrdersAdmin) btnOrdersAdmin.style.display = "none";
    return;
  }
  const phone = (user.email || "").replace("@phone.local", "");
  sessionInfo.textContent = `Autentificat: ${phone || user.email || user.uid}`;
  btnLogout.hidden = false;
}

function setCatalogHint(profile) {
  const status = profile?.status || "pending";
  if (!catalogHint) return;
  catalogHint.textContent =
    status === "active"
      ? "Cont activ. Prețurile sunt vizibile."
      : "Ești în așteptare (pending). Vezi catalog fără prețuri.";
}

/* -------------------- Cart UI (real-time) -------------------- */
function updateCartUI() {
  const count = getItemCount();

  const cartCountEl = document.getElementById("cartCount");
  if (cartCountEl) cartCountEl.textContent = String(count);

  const btnCart = document.getElementById("btnCart");
  if (btnCart) btnCart.textContent = count > 0 ? `Coș (${count})` : "Coș";
}

window.addEventListener("cart:updated", () => {
  updateCartUI();
});

/* -------------------- UI: Contact -------------------- */
function initCountyCity() {
  fillCountyOptions(countySelect);

  countySelect?.addEventListener("change", () => {
    const county = countySelect.value;
    fillCityDatalist(cityList, county);
    cityInput.value = "";
    cityInput.disabled = !county;
  });
}

/* -------------------- Auth Buttons -------------------- */
btnLogin?.addEventListener("click", async () => {
  clearNote(loginMsg);

  const phone = normalizePhone(loginPhone.value);
  const pass = String(loginPass.value || "");

  if (!phone) return showNote(loginMsg, "Completează telefonul.", "err");
  if (pass.length < 4) return showNote(loginMsg, "Parola e prea scurtă.", "err");

  try {
    btnLogin.disabled = true;
    await signInWithEmailAndPassword(auth, phoneToEmail(phone), pass);
  } catch (e) {
    showNote(loginMsg, e?.message || "Eroare la login.", "err");
  } finally {
    btnLogin.disabled = false;
  }
});

btnRegister?.addEventListener("click", async () => {
  clearNote(loginMsg);

  const phone = normalizePhone(loginPhone.value);
  const pass = String(loginPass.value || "");

  if (!phone) return showNote(loginMsg, "Completează telefonul.", "err");
  if (pass.length < 6) return showNote(loginMsg, "Parola trebuie minim 6 caractere.", "err");

  try {
    btnRegister.disabled = true;
    await createUserWithEmailAndPassword(auth, phoneToEmail(phone), pass);
    showNote(loginMsg, "Cont creat. Te autentific…", "ok");
  } catch (e) {
    showNote(loginMsg, e?.message || "Eroare la creare cont.", "err");
  } finally {
    btnRegister.disabled = false;
  }
});

btnLogout?.addEventListener("click", async () => {
  try { await signOut(auth); } catch (e) {}
});

btnBackToLogin?.addEventListener("click", async () => {
  clearNote(contactMsg);
  try { await signOut(auth); } catch (e) {}
});

/* -------------------- Contact Save -------------------- */
btnSaveContact?.addEventListener("click", async () => {
  clearNote(contactMsg);

  const user = auth.currentUser;
  if (!user) return showNote(contactMsg, "Sesiune invalidă. Reautentifică-te.", "err");

  try {
    btnSaveContact.disabled = true;

    await saveContact(user.uid, {
      fullName: fullName.value,
      address: address.value,
      county: countySelect.value,
      city: cityInput.value,
    });

    showNote(contactMsg, "Date salvate. Se deschide catalogul…", "ok");
    await routeAfterAuth(user);
  } catch (e) {
    showNote(contactMsg, e?.message || "Eroare la salvare.", "err");
  } finally {
    btnSaveContact.disabled = false;
  }
});

/* -------------------- Catalog -------------------- */
btnRefreshProducts?.addEventListener("click", async () => {
  try {
    btnRefreshProducts.disabled = true;
    await refreshCatalog();
  } finally {
    btnRefreshProducts.disabled = false;
  }
});

function normalizePrice(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

async function refreshCatalog() {
  const user = auth.currentUser;
  if (!user) return;

  const profile = (await getUserProfile(user.uid)) || (await ensureUserDoc(user));
  const canSeePrices = profile?.status === "active" || profile?.role === "admin";

  const rawItems = await loadProducts(db);

  const items = (rawItems || []).map((p) => {
    const base = normalizePrice(
      p?.priceGross ?? p?.basePrice ?? p?.base_price ?? p?.price ?? p?.basePriceRon
    );
    return { ...p, priceGross: base, basePrice: base, base_price: base, price: base };
  });

  renderProducts(productsGrid, items, {
    showPrices: canSeePrices,
    db,
    priceRules: profile?.priceRules || null,
  });

  updateCartUI();
}

/* -------------------- Admin screen in-app -------------------- */
btnAdmin?.addEventListener("click", () => {
  showOnly(screenAdmin);
  if (adminFrame) adminFrame.src = "./admin.html?v=" + Date.now();
});

btnOrdersAdmin?.addEventListener("click", () => {
  showOnly(screenAdmin);
  if (adminFrame) adminFrame.src = "./orders-admin.html?v=" + Date.now();
});

btnBackToCatalog?.addEventListener("click", () => {
  showOnly(screenCatalog);
});

/* -------------------- Routing -------------------- */
async function routeAfterAuth(user) {
  setSessionText(user);

  const base = await ensureUserDoc(user);
  const profile = (await getUserProfile(user.uid)) || base;

  const isAdmin = profile?.role === "admin";
  if (btnAdmin) btnAdmin.style.display = isAdmin ? "inline-block" : "none";
  if (btnOrdersAdmin) btnOrdersAdmin.style.display = isAdmin ? "inline-block" : "none";

  if (!isContactComplete(profile)) {
    fullName.value = profile?.contact?.fullName || "";
    address.value = profile?.contact?.address || "";

    const county = profile?.contact?.county || "";
    countySelect.value = county;

    fillCityDatalist(cityList, county);
    cityInput.disabled = !county;

    cityInput.value = profile?.contact?.city || "";

    clearNote(contactMsg);
    showOnly(screenContactGate);
    return;
  }

  setCatalogHint(profile);
  showOnly(screenCatalog);

  try {
    await refreshCatalog();
  } catch (e) {
    productsGrid.innerHTML = `<div class="note">Eroare la încărcarea produselor: ${escapeHtml(e?.message || "unknown")}</div>`;
  }
}

/* -------------------- Boot -------------------- */
initCountyCity();
showOnly(screenLoading);
setSessionText(null);

updateCartUI();

onAuthStateChanged(auth, async (user) => {
  clearNote(loginMsg);
  clearNote(contactMsg);

  if (!user) {
    setSessionText(null);
    showOnly(screenLogin);
    updateCartUI();
    return;
  }

  showOnly(screenLoading);

  try {
    await routeAfterAuth(user);
  } catch (e) {
    setSessionText(user);
    showOnly(screenLogin);
    showNote(loginMsg, `Eroare: ${e?.message || "unknown"}`, "err");
  } finally {
    updateCartUI();
  }
});

/* -------------------- util -------------------- */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
