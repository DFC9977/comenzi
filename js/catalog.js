// js/catalog.js
// Catalog: cards with image/desc + qty controls + cart details + submit event with items

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getQty,
  increment,
  setQuantity,
  getItemCount,
  getItemsArray
} from "./cart.js";

let _lastItems = [];
let _lastRenderOpts = { showPrices: false, db: null, priceRules: null };
let _gridBound = false;
let _cartBound = false;

// product lookup for details
function buildProductsMap(items) {
  const m = new Map();
  (items || []).forEach(p => m.set(String(p.id), p));
  return m;
}
let _productsMap = new Map();

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round(asNumber(n) * 100) / 100;
}
function formatMoney(v) {
  return round2(v).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim() + "...";
}

function ensureCSSOnce() {
  if (document.getElementById("catalog_css")) return;
  const style = document.createElement("style");
  style.id = "catalog_css";
  style.textContent = `
#productsGrid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
  gap:16px;
}

.product-card{
  border:1px solid rgba(255,255,255,.10);
  border-radius:16px;
  padding:14px;
  background:rgba(255,255,255,.02);
  display:flex;
  flex-direction:column;
  gap:10px;
}

/* ===== QTY CONTROLS ===== */
.qty-controls{
  display:flex;
  align-items:center;
  gap:8px;
  margin-top:6px;
  flex-wrap:nowrap; /* FIX */
}

.qty-controls button{
  border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);
  color:inherit;
  border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  flex:0 0 auto;
}

.qty-controls .qty{
  min-width:34px;
  text-align:center;
  font-weight:900;
}

/* ===== CHECKOUT BAR ===== */
#checkoutBar{
  position:sticky;
  bottom:0;
  z-index:999;
  border:1px solid rgba(255,255,255,.12);
  border-radius:16px 16px 0 0;
  background:rgba(0,0,0,.35);
  backdrop-filter:blur(8px);
  padding:12px;
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  align-items:flex-start;
  margin-top:16px;
}

#checkoutBar button{
  border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.08);
  color:inherit;
  border-radius:12px;
  padding:10px 12px;
  font-weight:900;
  cursor:pointer;
}

/* ===== CART DETAILS (SCROLLABLE) ===== */
#cartDetails{
  margin-top:10px;
  border-top:1px solid rgba(255,255,255,.12);
  padding-top:10px;
  display:none;
  width:100%;

  max-height:260px;
  overflow:auto;
  -webkit-overflow-scrolling:touch;

  background:rgba(0,0,0,.18);
  border-radius:12px;
  padding:10px;
  box-sizing:border-box;
}

.cart-line{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:6px 0;
  border-bottom:1px dashed rgba(255,255,255,.10);
}

.cart-line:last-child{
  border-bottom:none;
}

.cart-line .meta{
  min-width:0;
}

.cart-line .title{
  font-weight:800;
  font-size:13px;
  white-space:normal;
  word-break:break-word;
}

.cart-line .sub{
  font-size:12px;
  opacity:.75;
  margin-top:2px;
}

.cart-line .actions{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
}

.cart-line .actions button{
  padding:6px 10px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);
  cursor:pointer;
}

/* ===== MOBILE FIX ===== */
@media (max-width:600px){

  #productsGrid{
    grid-template-columns:1fr;
  }

  #checkoutBar{
    flex-direction:column;
    align-items:stretch;
  }

  #checkoutBar button{
    width:100%;
  }

  #cartDetails{
    max-height:45vh;
  }

  .cart-line{
    padding:10px 0;
  }

}

/* ===== CART BOTTOM SHEET (SLIDE UP) ===== */
#cartOverlay{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.55);
  display:none;
  z-index:9998;
}

#cartSheet{
  position:fixed;
  left:0;
  right:0;
  bottom:0;
  transform:translateY(110%);
  transition:transform .22s ease;
  z-index:9999;

  background:rgba(10,12,16,.92);
  border-top:1px solid rgba(255,255,255,.12);
  border-radius:16px 16px 0 0;
  backdrop-filter:blur(10px);
  padding:12px;
}

#cartSheet.open{
  transform:translateY(0);
}

#cartSheetHeader{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:10px;
}

#cartSheetHeader .title{
  font-weight:900;
  font-size:14px;
}

#cartSheetClose{
  border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.08);
  color:inherit;
  border-radius:12px;
  padding:8px 10px;
  font-weight:900;
  cursor:pointer;
  flex:0 0 auto;
}

/* conținut scrollabil */
#cartSheetBody{
  max-height:55vh;
  overflow:auto;
  -webkit-overflow-scrolling:touch;
  padding-right:4px;
}

/* în sheet vrem butoane mai compacte */
#cartSheetBody .cart-line .actions{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:nowrap;
}

#cartSheetBody .cart-line .actions button{
  width:auto;
  padding:6px 10px;
  font-size:12px;
  line-height:1;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.10);

  color:#fff;          /* ← FIXUL IMPORTANT */
  font-weight:600;

  cursor:pointer;
  flex:0 0 auto;
}

#cartSheetBody .cart-line .actions button:hover{
  background:rgba(255,255,255,.18);
}
`;
  document.head.appendChild(style);
}

function computeFinalPrice(p) {
  if (!_lastRenderOpts.showPrices) return 0;

  const base = asNumber(p.basePrice ?? p.price ?? 0);
  const rules = _lastRenderOpts.priceRules;

  if (!rules) return round2(base);

  // Try category override first
  const categoryId = String(p.categoryId || p.category || "");
  const categoriesObj = rules.categories || {};

  let markup = 0;

  if (categoryId && categoriesObj[categoryId] !== undefined) {
    // Category override exists — use it (ignores global)
    markup = asNumber(categoriesObj[categoryId]);
  } else {
    // No override — use global markup
    markup = asNumber(rules.globalMarkup ?? 0);
  }

  return round2(base * (1 + markup / 100));
}

function productCardHTML(p) {
  const id = String(p.id || "");
  const name = escHtml(p.name || "");
  const img = p.imageUrls?.[0] ? String(p.imageUrls[0]) : "";
  const desc = (p.description || "").trim();
  const descShort = truncateText(desc, 80);
  const hasMore = desc.length > 80;
  const gama = (p.gama || "").trim();
  const producer = (p.producer || "").trim();

  const showPrice = !!_lastRenderOpts.showPrices;
  const finalPrice = computeFinalPrice(p);
  const qty = showPrice ? getQty(id) : 0;

  return `
    <div class="product-card" data-product-id="${escHtml(id)}">
      <div style="font-weight:900;font-size:16px;line-height:1.25;">${name}</div>

      ${gama ? `
        <div style="display:inline-block;background:#1f2937;color:#fff;padding:4px 8px;border-radius:8px;font-size:12px;width:fit-content;">
          ${escHtml(gama)}
        </div>` : ""}

      ${producer ? `<div style="font-size:13px;opacity:.7;">${escHtml(producer)}</div>` : ""}

      ${img ? `
        <img src="${escHtml(img)}" alt="${name}"
          style="width:100%;height:160px;object-fit:contain;border-radius:12px;background:#111;margin:6px 0 0 0;">
      ` : ""}

      ${desc ? `
        <div class="desc-wrapper" style="font-size:13px;opacity:.7;">
          <div class="desc-short">${escHtml(descShort)}</div>
          <div class="desc-full" style="display:none;">${escHtml(desc)}</div>
          ${hasMore ? `<button type="button" class="read-more" style="color:#3b82f6;background:none;border:none;padding:0;cursor:pointer;font-size:13px;margin-top:4px;">Citește mai mult</button>` : ""}
        </div>` : ""}

      <div style="font-size:14px;opacity:.95;">
        ${showPrice ? `Preț: <b>${formatMoney(finalPrice)} lei</b>` : `Prețuri vizibile doar pentru clienți activi`}
      </div>

      ${showPrice ? `
        <div class="qty-controls">
          <button type="button" data-action="dec">-</button>
          <span class="qty" id="qty-${escHtml(id)}">${qty}</span>
          <button type="button" data-action="inc">+</button>
          <button type="button" data-action="add" style="margin-left:auto;">Adaugă</button>
        </div>
      ` : ""}
    </div>
  `;
}

function ensureCheckoutBar(grid) {
  const host = grid?.parentElement || document.getElementById("screenCatalog") || document.body;

  let bar = document.getElementById("checkoutBar");
  if (bar) return bar;

  bar = document.createElement("div");
  bar.id = "checkoutBar";
  bar.innerHTML = `
    <div style="font-weight:900;">
      Coș: <span id="cartCount">0</span> buc
      <span id="cartTotal" style="opacity:.75;font-weight:700;margin-left:10px;"></span>
    </div>
    <div style="flex:1;"></div>
    <button id="btnCartDetails" type="button">Detalii</button>
    <button id="btnSubmitOrder" type="button">Trimite comanda</button>
    <div id="cartDetails"></div>
  `;

  host.appendChild(bar);

  bar.querySelector("#btnCartDetails").addEventListener("click", () => {
    openCartSheet();
  });

  bar.querySelector("#btnSubmitOrder").addEventListener("click", () => {
    const items = buildOrderItemsForSubmit();
    if (!items.length) return alert("Coșul este gol.");

    window.dispatchEvent(
      new CustomEvent("catalog:submitOrderRequested", { detail: { items } })
    );
  });

  return bar;
}

function ensureCartSheetOnce() {
  if (document.getElementById("cartSheet")) return;

  const overlay = document.createElement("div");
  overlay.id = "cartOverlay";
  overlay.addEventListener("click", closeCartSheet);

  const sheet = document.createElement("div");
  sheet.id = "cartSheet";
  sheet.innerHTML = `
    <div id="cartSheetHeader">
      <div class="title">Detalii coș</div>
      <button id="cartSheetClose" type="button">Închide</button>
    </div>
    <div id="cartSheetBody"></div>
  `;

  sheet.querySelector("#cartSheetClose").addEventListener("click", closeCartSheet);

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
}

function openCartSheet() {
  ensureCartSheetOnce();

  const overlay = document.getElementById("cartOverlay");
  const sheet = document.getElementById("cartSheet");
  const body = document.getElementById("cartSheetBody");

  if (!overlay || !sheet || !body) return;

  renderCartDetailsInto(body);

  overlay.style.display = "block";
  sheet.classList.add("open");
  document.body.classList.add("cart-open");
}

function closeCartSheet() {
  const overlay = document.getElementById("cartOverlay");
  const sheet = document.getElementById("cartSheet");
  if (overlay) overlay.style.display = "none";
  if (sheet) sheet.classList.remove("open");
  document.body.classList.remove("cart-open");
}

function renderCartDetailsInto(containerEl) {
  const items = buildOrderItemsForSubmit();
  if (!items.length) {
    containerEl.innerHTML = `<div style="opacity:.75;">Coș gol.</div>`;
    return;
  }

  const total = round2(items.reduce((s, it) => s + asNumber(it.lineTotal), 0));

  containerEl.innerHTML = `
    ${items.map(it => `
      <div class="cart-line" data-id="${escHtml(it.productId)}">
        <div class="meta">
          <div class="title">${escHtml(it.name || it.productId)}</div>
          <div class="sub">${formatMoney(it.unitPriceFinal)} lei × ${it.qty} = <b>${formatMoney(it.lineTotal)} lei</b></div>
        </div>
        <div class="actions">
          <button type="button" data-cart="dec">-</button>
          <button type="button" data-cart="inc">+</button>
          <button type="button" data-cart="rm">Șterge</button>
        </div>
      </div>
    `).join("")}

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
      <div style="opacity:.8;font-weight:800;">Total:</div>
      <div style="font-weight:900;">${formatMoney(total)} lei</div>
    </div>
  `;

  containerEl.querySelectorAll("button[data-cart]").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".cart-line");
      const pid = row?.getAttribute("data-id");
      if (!pid) return;

      const act = btn.getAttribute("data-cart");
      if (act === "inc") increment(pid, 1);
      if (act === "dec") increment(pid, -1);
      if (act === "rm") setQuantity(pid, 0);

      updateCartUI();
      renderCartDetailsInto(containerEl);
    });
  });
}

function buildOrderItemsForSubmit() {
  const raw = getItemsArray(); // [{productId, qty}]
  const showPrice = !!_lastRenderOpts.showPrices;

  return raw.map(it => {
    const p = _productsMap.get(String(it.productId)) || {};
    const unitFinal = showPrice ? asNumber(computeFinalPrice(p)) : 0;

    return {
      productId: String(it.productId),
      qty: asNumber(it.qty),
      name: String(p.name || ""),
      sku: String(p.sku || ""),
      unitPriceFinal: unitFinal,
      lineTotal: showPrice ? round2(unitFinal * asNumber(it.qty)) : 0
    };
  }).filter(x => x.productId && x.qty > 0);
}

function renderCartDetails() {
  const bar = document.getElementById("checkoutBar");
  if (!bar) return;

  const wrap = bar.querySelector("#cartDetails");
  if (!wrap) return;

  renderCartDetailsInto(wrap);
}

function updateCartUI() {
  const count = getItemCount();
  const bar = document.getElementById("checkoutBar");

  if (bar) {
    const el = bar.querySelector("#cartCount");
    if (el) el.textContent = String(count);

    const totalEl = bar.querySelector("#cartTotal");
    if (totalEl) {
      const items = buildOrderItemsForSubmit();
      const total = round2(items.reduce((s, it) => s + asNumber(it.lineTotal), 0));
      totalEl.textContent = _lastRenderOpts.showPrices ? `• Total: ${formatMoney(total)} lei` : "";
    }

    const details = bar.querySelector("#cartDetails");
    if (details && details.style.display !== "none") renderCartDetails();
  }

  // if sheet is open, keep it in sync
  const sheet = document.getElementById("cartSheet");
  if (sheet && sheet.classList.contains("open")) {
    const body = document.getElementById("cartSheetBody");
    if (body) renderCartDetailsInto(body);
  }

  // sync quantities in visible cards
  document.querySelectorAll(".product-card").forEach(card => {
    const pid = card.getAttribute("data-product-id");
    if (!pid) return;
    const q = getQty(pid);
    const qEl = document.getElementById(`qty-${pid}`);
    if (qEl) qEl.textContent = String(q);
  });
}

function bindGridOnce(grid) {
  if (_gridBound) return;
  _gridBound = true;

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = btn.closest(".product-card");
    const pid = card?.getAttribute("data-product-id");

    // Read more/less toggle
    if (btn.classList.contains("read-more")) {
      e.preventDefault();
      const wrapper = card.querySelector(".desc-wrapper");
      const short = wrapper.querySelector(".desc-short");
      const full = wrapper.querySelector(".desc-full");

      if (full.style.display === "none") {
        short.style.display = "none";
        full.style.display = "block";
        btn.textContent = "Citește mai puțin";
      } else {
        short.style.display = "block";
        full.style.display = "none";
        btn.textContent = "Citește mai mult";
      }
      return;
    }

    if (!pid) return;

    const act = btn.getAttribute("data-action");
    if (act === "inc") increment(pid, 1);
    if (act === "dec") increment(pid, -1);
    if (act === "add") increment(pid, 1);

    updateCartUI();
  });
}

function bindCartUpdatedOnce() {
  if (_cartBound) return;
  _cartBound = true;

  window.addEventListener("cart:updated", () => {
    updateCartUI();
  });
}

/* =========================
   Public API
========================= */

export async function loadProducts(db) {
  const snap = await getDocs(
    query(
      collection(db, "products"),
      where("active", "==", true),
      orderBy("sortOrder"),
      orderBy("name"),
      limit(2000)
    )
  );

  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
  return items;
}

export async function renderProducts(productsGrid, items, opts = {}) {
  ensureCSSOnce();

  _lastItems = Array.isArray(items) ? items : [];
  _productsMap = buildProductsMap(_lastItems);

  _lastRenderOpts = {
    showPrices: !!opts.showPrices,
    db: opts.db || null,
    priceRules: opts.priceRules || null
  };

  if (!productsGrid) return;
  productsGrid.id = productsGrid.id || "productsGrid";

  // Build filter options
  const categories = [...new Set(_lastItems.map(p => p.categoryId || p.category).filter(Boolean))];
  const producers = [...new Set(_lastItems.map(p => p.producer).filter(Boolean))];
  const gamas = [...new Set(_lastItems.map(p => p.gama).filter(Boolean))];

  // Create filter UI
  const filtersHTML = `
    <div id="catalogFilters" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      <select id="filterCategory" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;">
        <option value="">Toate categoriile</option>
        ${categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("")}
      </select>

      <select id="filterProducer" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;">
        <option value="">Toți producătorii</option>
        ${producers.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join("")}
      </select>

      <select id="filterGama" style="padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;">
        <option value="">Toate gamele</option>
        ${gamas.map(g => `<option value="${escHtml(g)}">${escHtml(g)}</option>`).join("")}
      </select>
    </div>
  `;

  // Insert filters + grid
  const wrapper = productsGrid.parentElement;
  if (wrapper && !document.getElementById("catalogFilters")) {
    wrapper.insertAdjacentHTML("afterbegin", filtersHTML);
    
    // Bind filter change events
    ["filterCategory", "filterProducer", "filterGama"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", () => applyFilters());
    });
  }

  // Initial render
  applyFilters();

  ensureCheckoutBar(productsGrid);
  bindGridOnce(productsGrid);
  bindCartUpdatedOnce();

  updateCartUI();
}

function applyFilters() {
  const catFilter = document.getElementById("filterCategory")?.value || "";
  const prodFilter = document.getElementById("filterProducer")?.value || "";
  const gamaFilter = document.getElementById("filterGama")?.value || "";

  const filtered = _lastItems.filter(p => {
    if (catFilter && (p.categoryId || p.category) !== catFilter) return false;
    if (prodFilter && p.producer !== prodFilter) return false;
    if (gamaFilter && p.gama !== gamaFilter) return false;
    return true;
  });

  const grid = document.getElementById("productsGrid");
  if (grid) {
    grid.innerHTML = filtered.map(productCardHTML).join("");
  }
}