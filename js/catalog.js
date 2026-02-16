// js/catalog.js
// Catalog UI + categories + product cards (image/desc) + qty controls + checkout bar
// Exports: loadProducts(db), renderProducts(productsGrid, items, opts)
// ✅ "Trimite comanda" dispatches: catalog:submitOrderRequested with detail.items (array)

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  increment,
  setQuantity,
  getQty,
  getItemCount,
  getItemsArray,
} from "./cart.js";

/* =========================
   State
========================= */
let _categoriesCache = null;
let _lastItems = [];
let _selectedCategoryId = "ALL";
let _lastRenderOpts = { showPrices: false, db: null, priceRules: null };
let _lastGridEl = null;
let _boundGridHandlers = false;
let _boundCartUpdated = false;

/* =========================
   Helpers
========================= */
function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round(asNumber(n) * 100) / 100;
}
function formatMoney(v) {
  return round2(v).toLocaleString("ro-RO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
function uniq(arr) {
  return [...new Set(arr)];
}
function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Pricing
========================= */
function getBaseGrossPrice(p) {
  return asNumber(p?.priceGross ?? p?.basePrice ?? p?.base_price ?? p?.price ?? 0);
}
function getMarkupForProduct(p, priceRules) {
  const catId = String(p?.categoryId || "");
  const byCat = priceRules?.categories?.[catId];
  if (byCat !== undefined && byCat !== null && byCat !== "") return asNumber(byCat);
  return asNumber(priceRules?.globalMarkup ?? 0);
}
function computeFinalPrice(p, showPrice, priceRules) {
  if (!showPrice) return null;
  const base = getBaseGrossPrice(p);
  const markup = getMarkupForProduct(p, priceRules);
  return round2(base * (1 + markup / 100));
}

/* =========================
   Categories
========================= */
async function loadCategories(db) {
  if (_categoriesCache) return _categoriesCache;

  const snap = await getDocs(
    query(
      collection(db, "categories"),
      where("active", "==", true),
      orderBy("sortOrder"),
      limit(500)
    )
  );

  const cats = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    cats.push({
      id: d.id,
      name: String(data.name || d.id),
      sortOrder: asNumber(data.sortOrder),
      active: data.active !== false,
    });
  });

  _categoriesCache = cats;
  return cats;
}

function ensureCategoriesHost(productsGrid) {
  const screen = document.getElementById("screenCatalog") || document.body;

  let top = screen.querySelector("#categoriesTopBar");
  if (!top) {
    top = document.createElement("div");
    top.id = "categoriesTopBar";
    top.style.display = "flex";
    top.style.flexWrap = "wrap";
    top.style.gap = "10px";
    top.style.margin = "12px 0 16px 0";
    top.style.alignItems = "center";

    const parent = productsGrid?.parentElement || screen;
    parent.insertBefore(top, productsGrid);
  }
  return top;
}

function catChip(label, active) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.padding = "10px 12px";
  b.style.borderRadius = "14px";
  b.style.border = active
    ? "1px solid rgba(255,255,255,0.55)"
    : "1px solid rgba(255,255,255,0.18)";
  b.style.background = active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)";
  b.style.color = "inherit";
  b.style.cursor = "pointer";
  b.style.fontWeight = "800";
  return b;
}

async function renderCategories(productsGrid) {
  const db = _lastRenderOpts.db || window.__db || null;
  if (!db) return;

  const categories = await loadCategories(db);
  const presentCategoryIds = uniq(
    _lastItems.map((p) => String(p.categoryId || "")).filter(Boolean)
  );

  const host = ensureCategoriesHost(productsGrid);
  host.innerHTML = "";

  const list = [
    { id: "ALL", name: "Toate" },
    ...categories.filter((c) => presentCategoryIds.includes(c.id)),
  ];

  list.forEach((c) => {
    const btn = catChip(c.name, _selectedCategoryId === c.id);
    btn.addEventListener("click", () => {
      _selectedCategoryId = c.id;
      renderProducts(productsGrid, _lastItems, _lastRenderOpts);
    });
    host.appendChild(btn);
  });
}

/* =========================
   CSS
========================= */
function ensureCatalogCSSOnce() {
  if (document.getElementById("catalogCss")) return;

  const style = document.createElement("style");
  style.id = "catalogCss";
  style.textContent = `
    .product-card {
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255,255,255,0.02);
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 140px;
    }

    .product-card .qty-controls{
      display:flex;
      gap:8px;
      align-items:center;
      margin-top:6px;
    }
    .product-card .qty-controls button{
      border:1px solid rgba(255,255,255,0.20);
      background: rgba(255,255,255,0.05);
      color: inherit;
      border-radius: 10px;
      padding: 8px 10px;
      font-weight: 800;
      cursor: pointer;
    }
    .product-card .qty-controls .qty{
      min-width: 34px;
      text-align:center;
      font-weight:900;
    }

    #catalogCartBar{
      position: sticky;
      bottom: 12px;
      margin-top: 14px;
      display:flex;
      justify-content: space-between;
      align-items:center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
    }
    #catalogCartBar button{
      border:1px solid rgba(255,255,255,0.25);
      background: rgba(255,255,255,0.08);
      color: inherit;
      border-radius: 12px;
      padding: 10px 12px;
      font-weight: 900;
      cursor: pointer;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   Product Card HTML
========================= */
function productCardHTML(p) {
  const id = String(p.id || "");
  const name = escHtml(p.name || "");
  const img = String(p.imageUrls?.[0] || "");
  const desc = escHtml(p.description || "");
  const showPrice = !!_lastRenderOpts.showPrices;
  const finalPrice = computeFinalPrice(p, showPrice, _lastRenderOpts.priceRules);
  const qty = getQty(id);

  return `
    <div class="product-card" data-product-id="${escHtml(id)}">

      <div style="font-weight:900; font-size:16px; line-height:1.25;">
        ${name}
      </div>

      ${p.gama ? `
        <div style="
          display:inline-block;
          background:#1f2937;
          color:white;
          padding:4px 8px;
          border-radius:8px;
          font-size:12px;
          margin-top:4px;
          width:fit-content;">
          ${escHtml(p.gama)}
        </div>
      ` : ""}

      ${p.producer ? `
        <div style="font-size:13px; opacity:0.7;">
          ${escHtml(p.producer)}
        </div>
      ` : ""}

      ${img ? `
        <img src="${escHtml(img)}"
             alt=""
             style="
               width:100%;
               height:160px;
               object-fit:contain;
               margin:6px 0 2px 0;
               border-radius:12px;
               background:#111;">
      ` : ""}

      ${desc ? `
        <div style="font-size:13px; opacity:0.7;">
          ${desc}
        </div>
      ` : ""}

      <div style="opacity:0.95; font-size:14px;">
        ${
          showPrice
            ? `Preț: <b>${formatMoney(finalPrice)} lei</b>`
            : `Prețuri vizibile doar pentru clienți activi`
        }
      </div>

      <div class="qty-controls">
        <button type="button" data-action="dec" data-id="${escHtml(id)}">-</button>
        <span class="qty" id="qty-${escHtml(id)}">${qty}</span>
        <button type="button" data-action="inc" data-id="${escHtml(id)}">+</button>
        <button type="button" data-action="add" data-id="${escHtml(id)}">Adaugă</button>
      </div>

    </div>
  `;
}

/* =========================
   Cart bar
========================= */
function ensureCartBar(productsGrid) {
  const screen = document.getElementById("screenCatalog") || document.body;
  const parent = productsGrid?.parentElement || screen;

  let bar = parent.querySelector("#catalogCartBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "catalogCartBar";
    bar.innerHTML = `
      <div style="font-weight:900;">
        Coș: <span id="catalogCartCount">0</span> buc
      </div>
      <button id="btnSubmitOrder" type="button">Trimite comanda</button>
    `;
    parent.appendChild(bar);

    bar.querySelector("#btnSubmitOrder").addEventListener("click", () => {
      const items = getItemsArray();
      if (!items.length) {
        alert("Coșul este gol.");
        return;
      }
      window.dispatchEvent(
        new CustomEvent("catalog:submitOrderRequested", { detail: { items } })
      );
    });
  }
  updateCartBar();
}

function updateCartBar() {
  const el = document.getElementById("catalogCartCount");
  if (el) el.textContent = String(getItemCount());
}

/* =========================
   Event binding (once)
========================= */
function bindGridHandlersOnce(productsGrid) {
  if (_boundGridHandlers) return;
  if (!productsGrid) return;

  productsGrid.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    if (action === "inc") {
      increment(id, 1);
    } else if (action === "dec") {
      increment(id, -1);
    } else if (action === "add") {
      increment(id, 1);
    }

    // UI update is triggered by cart:updated as well, but keep it snappy
    const qtyEl = document.getElementById(`qty-${id}`);
    if (qtyEl) qtyEl.textContent = String(getQty(id));
    updateCartBar();
  });

  _boundGridHandlers = true;
}

function bindCartUpdatedOnce(productsGrid) {
  if (_boundCartUpdated) return;

  window.addEventListener("cart:updated", () => {
    // update all qty labels currently rendered
    if (productsGrid) {
      productsGrid.querySelectorAll("[data-product-id]").forEach((card) => {
        const id = card.getAttribute("data-product-id");
        const qtyEl = id ? document.getElementById(`qty-${id}`) : null;
        if (qtyEl) qtyEl.textContent = String(getQty(id));
      });
    }
    updateCartBar();
  });

  _boundCartUpdated = true;
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
  snap.forEach((d) => {
    items.push({ id: d.id, ...((d.data && d.data()) || {}) });
  });
  return items;
}

export function renderProducts(productsGrid, items, opts = {}) {
  if (!productsGrid) return;

  ensureCatalogCSSOnce();

  _lastGridEl = productsGrid;
  _lastItems = Array.isArray(items) ? items : [];
  _lastRenderOpts = { ..._lastRenderOpts, ...opts };

  bindGridHandlersOnce(productsGrid);
  bindCartUpdatedOnce(productsGrid);

  // filter by category
  let view = _lastItems;
  if (_selectedCategoryId && _selectedCategoryId !== "ALL") {
    view = view.filter((p) => String(p.categoryId || "") === _selectedCategoryId);
  }

  // render categories (async, non-blocking)
  renderCategories(productsGrid).catch(() => {});

  // render cards
  productsGrid.innerHTML = view.map(productCardHTML).join("");

  // ensure cart bar + count
  ensureCartBar(productsGrid);
}
