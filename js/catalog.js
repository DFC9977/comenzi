// js/catalog.js
// Catalog (mobile-first) + categories + cart controls + sticky cart bar + summary
// ✅ always dispatches submit event with detail.items
// Exports: loadProducts(db), renderProducts(productsGrid, items, opts)

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  increment,
  setQuantity,
  getItemCount,
  getItemsArray
} from "./cart.js";

/* =========================
   State
========================= */

let _categoriesCache = null;
let _lastItems = [];
let _selectedCategoryId = "ALL";
let _lastRenderOpts = { showPrices: false, db: null, priceRules: null };
let _lastGridEl = null;
let _cartUpdatedBound = false;

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
    maximumFractionDigits: 2
  });
}
function uniq(arr) {
  return [...new Set(arr)];
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
      active: data.active !== false
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

  const list = [{ id: "ALL", name: "Toate" }, ...categories.filter((c) => presentCategoryIds.includes(c.id))];

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
  `;
  document.head.appendChild(style);
}

/* =========================
   Product Card HTML
========================= */

function productCardHTML(p) {
  const id = String(p.id || "");
  const name = String(p.name || "");
  const showPrice = !!_lastRenderOpts.showPrices;
  const finalPrice = computeFinalPrice(p, showPrice, _lastRenderOpts.priceRules);

  return `
    <div class="product-card" data-product-id="${id}">
      <div style="font-weight:900; font-size:16px; line-height:1.25;">${name}</div>

      ${p.gama ? `
        <div style="
          display:inline-block;
          background:#1f2937;
          color:white;
          padding:4px 8px;
          border-radius:8px;
          font-size:12px;
          margin-top:4px;">
          ${p.gama}
        </div>
      ` : ""}

      ${p.producer ? `
        <div style="font-size:13px; opacity:0.7;">
          ${p.producer}
        </div>
      ` : ""}

      <div style="opacity:0.9; font-size:14px;">
        ${
          showPrice
            ? `Preț: <b>${formatMoney(finalPrice)} lei</b>`
            : `Prețuri vizibile doar pentru clienți activi`
        }
      </div>
    </div>
  `;
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
  _lastItems = items;
  return items;
}

export async function renderProducts(productsGrid, items, opts = {}) {
  _lastGridEl = productsGrid;

  _lastItems = Array.isArray(items) ? items : [];
  _lastRenderOpts = {
    showPrices: !!opts.showPrices,
    db: opts.db || null,
    priceRules: opts.priceRules || null
  };

  ensureCatalogCSSOnce();

  const filtered = _lastItems;

  if (!productsGrid) return;
  productsGrid.innerHTML = "";

  filtered.forEach((p) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = productCardHTML(p);
    productsGrid.appendChild(wrap.firstElementChild);
  });
}
