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
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
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

    const msg = result.updated 
      ? `Comanda #${result.orderNumber} a fost actualizată.`
      : `Comanda #${result.orderNumber} a fost trimisă.`;
    
    alert(msg);
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

// Butoane navigare
const btnOrders        = document.getElementById("btnOrders");
const btnPromos        = document.getElementById("btnPromos");
const btnMessages      = document.getElementById("btnMessages");
const btnAdminClients  = document.getElementById("btnAdminClients");
const btnAdminPromos   = document.getElementById("btnAdminPromos");
const btnAdminCounties = document.getElementById("btnAdminCounties");
const badgePromos      = document.getElementById("badgePromos");
const badgeMessages    = document.getElementById("badgeMessages");

// session flags
let __isAdminSession = false;
let _unsubMsgBadge = null;
let _unsubPromoBadge = null;

const loginPhone = document.getElementById("loginPhone");
const loginPass = document.getElementById("loginPass");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const loginMsg = document.getElementById("loginMsg");

const fullName = document.getElementById("fullName");
const kennel = document.getElementById("kennel");
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
    [btnOrders, btnPromos, btnMessages, btnAdminClients, btnAdminPromos, btnAdminCounties]
      .forEach(b => { if (b) b.style.display = "none"; });
    __isAdminSession = false;
    stopBadgeListeners();
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
      kennel: kennel?.value || "",
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

/* -------------------- Nav buttons -------------------- */
function openFrame(src, title, subtitle) {
  showOnly(screenAdmin);
  const uid = auth.currentUser?.uid || "";
  if (adminFrame) adminFrame.src = src + (src.includes("?") ? "&" : "?") + "v=" + Date.now() + "&uid=" + encodeURIComponent(uid);
  const titleEl = document.getElementById("adminFrameTitle");
  const subtitleEl = document.getElementById("adminFrameSubtitle");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle || "";
}

btnOrders?.addEventListener("click", () => openFrame("./my-orders.html", "Comenzile mele", ""));
btnPromos?.addEventListener("click", () => openFrame("./my-orders.html?tab=promotions", "Promoții", ""));
btnAdminClients?.addEventListener("click", () => openFrame("./admin.html#clients", "Admin — Clienți", "Aprobări / adaos / recomandări"));
btnAdminPromos?.addEventListener("click", () => openFrame("./admin.html#promotions", "Admin — Promoții", ""));
btnAdminCounties?.addEventListener("click", () => openFrame("./admin.html#counties", "Admin — Județe", "Zile livrare per județ"));
btnMessages?.addEventListener("click", () => openFrame("./messages.html", "Mesaje", ""));

btnBackToCatalog?.addEventListener("click", () => {
  showOnly(screenCatalog);
});

/* -------------------- Routing -------------------- */
async function routeAfterAuth(user) {
  setSessionText(user);

  const base = await ensureUserDoc(user);
  const profile = (await getUserProfile(user.uid)) || base;

  const isAdmin = profile?.role === "admin";
  __isAdminSession = !!isAdmin;

  // Afișăm butoanele corecte per rol
  if (isAdmin) {
    if (btnOrders)        btnOrders.style.display        = "inline-block"; // Comenzi admin → orders-admin.html
    if (btnPromos)        btnPromos.style.display        = "none";
    if (btnAdminClients)  btnAdminClients.style.display  = "inline-block";
    if (btnAdminPromos)   btnAdminPromos.style.display   = "inline-block";
    if (btnAdminCounties) btnAdminCounties.style.display = "inline-block";
  } else {
    if (btnOrders)        btnOrders.style.display        = "inline-block";
    if (btnPromos)        btnPromos.style.display        = "inline-block";
    if (btnAdminClients)  btnAdminClients.style.display  = "none";
    if (btnAdminPromos)   btnAdminPromos.style.display   = "none";
    if (btnAdminCounties) btnAdminCounties.style.display = "none";
  }
  if (btnMessages) btnMessages.style.display = "inline-block";

  // Pornim badge listeners
  startBadgeListeners(user.uid, isAdmin);

  if (!isContactComplete(profile)) {
    fullName.value = profile?.contact?.fullName || "";
    if (kennel) kennel.value = profile?.contact?.kennel || "";
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

/* -------------------- Badge listeners -------------------- */
function stopBadgeListeners() {
  if (_unsubMsgBadge)   { try { _unsubMsgBadge(); }   catch {} _unsubMsgBadge = null; }
  if (_unsubPromoBadge) { try { _unsubPromoBadge(); } catch {} _unsubPromoBadge = null; }
}

function startBadgeListeners(uid, isAdmin) {
  stopBadgeListeners();
  startMessagesBadge(uid, isAdmin);
  if (!isAdmin) startPromosBadge(uid);
}

function startMessagesBadge(uid, isAdmin) {
  const ordersQ = isAdmin
    ? query(collection(db, "orders"), orderBy("updatedAt", "desc"))
    : query(collection(db, "orders"), where("clientId", "==", uid));

  const orderMsgUnsubs = new Map();
  const orderCounts    = new Map();

  function updateBadge() {
    let total = 0;
    orderCounts.forEach(v => total += v);
    if (badgeMessages) {
      badgeMessages.textContent = String(total);
      badgeMessages.style.display = total > 0 ? "inline-flex" : "none";
    }
  }

  _unsubMsgBadge = onSnapshot(ordersQ, (snap) => {
    snap.docs.forEach(orderDoc => {
      if (orderMsgUnsubs.has(orderDoc.id)) return;
      const msgQ = query(collection(db, "orders", orderDoc.id, "messages"));
      const unsub = onSnapshot(msgQ, (msgSnap) => {
        const unread = msgSnap.docs.filter(d => {
          const m = d.data();
          if (isAdmin) return m.fromRole === "client" && !m.readByAdmin;
          return m.fromRole === "admin" && !m.readByClient;
        }).length;
        orderCounts.set(orderDoc.id, unread);
        updateBadge();
      }, () => {});
      orderMsgUnsubs.set(orderDoc.id, unsub);
    });
  }, () => {});
}

function startPromosBadge(uid) {
  const promosQ = query(collection(db, "promotions"), where("active", "==", true));
  let seenPromos = [];

  // Citim seenPromotions o dată
  getDoc(doc(db, "users", uid)).then(snap => {
    seenPromos = snap.data()?.seenPromotions || [];

    _unsubPromoBadge = onSnapshot(promosQ, (snap) => {
      const unread = snap.docs.filter(d => !seenPromos.includes(d.id)).length;
      if (badgePromos) {
        badgePromos.textContent = String(unread);
        badgePromos.style.display = unread > 0 ? "inline-flex" : "none";
      }
    }, () => {});
  }).catch(() => {});
}

// Când clientul citește promoțiile (mesaj din iframe)
window.addEventListener("message", (event) => {
  if (event.data?.action === "promosRead") {
    if (badgePromos) badgePromos.style.display = "none";
  }
  if (event.data?.action === "messagesRead") {
    if (badgeMessages) badgeMessages.style.display = "none";
  }
});

/* -------------------- Boot -------------------- */
initCountyCity();
showOnly(screenLoading);
setSessionText(null);

updateCartUI();

// Listen for messages from iframe (my-orders.html) to show catalog
window.addEventListener('message', async (event) => {
  if (event.data?.action === 'showCatalog') {
    showOnly(screenCatalog);
    // Force cart UI update and refresh product grid with quantities
    updateCartUI();
    // Small delay to ensure cart is loaded from localStorage
    await new Promise(resolve => setTimeout(resolve, 50));
    // Refresh catalog to show updated quantities
    if (typeof refreshCatalog === 'function') {
      await refreshCatalog();
    }
  }
});

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
// Add to app.js at the end

// Listen for postMessage from iframe (e.g., myOrders.js requesting catalog)
window.addEventListener("message", (event) => {
  if (event.data?.action === "showCatalog") {
    const screenCatalog = document.getElementById("screenCatalog");
    if (screenCatalog) {
      showOnly(screenCatalog);
    }
  }
});