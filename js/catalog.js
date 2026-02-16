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
let _gridClickBound = false;

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
function safeText(s) {
  return String(s ?? "").trim();
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

  const list = [
    { id: "ALL", name: "Toate" },
    ...categories.filter((c) => presentCategoryIds.includes(c.id))
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
    .qty-controls {
      display:flex;
      align-items:center;
      gap:10px;
      margin-top: 6px;
    }
    .qty-controls button {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.05);
      color: inherit;
      cursor: pointer;
      font-weight: 900;
      line-height: 1;
    }
    .qty-controls .qty {
      min-width: 28px;
      text-align:center;
      font-weight: 900;
    }
    .qty-controls .add {
      margin-left:auto;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.20);
      background: rgba(255,255,255,0.08);
    }
    #cartBar {
      position: sticky;
      bottom: 0;
      z-index: 50;
      margin-top: 14px;
      padding: 12px 12px;
      border-top: 1px solid rgba(255,255,255,0.10);
      background: rgba(10,12,16,0.92);
      backdrop-filter: blur(10px);
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    #cartBar .left {
      opacity: 0.9;
      font-weight: 800;
    }
    #cartBar button {
      padding: 10px 14px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.20);
      background: rgba(255,255,255,0.10);
      color: inherit;
      cursor: pointer;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   Cart UI helpers
========================= */

function ensureCartBar(productsGrid) {
  const screen = document.getElementById("screenCatalog") || document.body;

  let bar = screen.querySelector("#cartBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "cartBar";
    bar.innerHTML = `
      <div class="left">Coș: <span id="cartCount">0</span> buc</div>
      <button id="btnSubmitOrder" type="button">Trimite comanda</button>
    `;

    const parent = productsGrid?.parentElement || screen;
    parent.appendChild(bar);

    const btn = bar.querySelector("#btnSubmitOrder");
    btn.addEventListener("click", () => {
      const items = getItemsArray();
      const ev = new CustomEvent("submit", { detail: { items } });

      // safe: dispatch on both grid and window
      if (_lastGridEl) _lastGridEl.dispatchEvent(ev);
      window.dispatchEvent(ev);
    });
  }
  return bar;
}

function updateQtyBadges(productsGrid) {
  if (!productsGrid) return;

  const cards = productsGrid.querySelectorAll(".product-card[data-product-id]");
  cards.forEach((card) => {
    const id = card.getAttribute("data-product-id");
    const q = asNumber(getItemCount(id));
    const span = card.querySelector(`[data-qty-for="${id}"]`);
    if (span) span.textContent = String(q);
  });

  const total = asNumber(getItemsArray()?.reduce((acc, it) => acc + asNumber(it.qty), 0));
  const countEl = document.getElementById("cartCount");
  if (countEl) countEl.textContent = String(total);
}

/* =========================
   Product Card HTML
========================= */

function productCardHTML(p) {
  const id = String(p.id || "");
  const name = String(p.name || "");
  const showPrice = !!_lastRenderOpts.showPrices;
  const finalPrice = computeFinalPrice(p, showPrice, _lastRenderOpts.priceRules);

  const img = Array.isArray(p?.imageUrls) && p.imageUrls.length ? String(p.imageUrls[0] || "") : "";
  const desc = safeText(p?.description);

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

      ${img ? `
        <img
          src="${img}"
          alt="${name}"
          loading="lazy"
          style="
            width:100%;
            height:160px;
            object-fit:contain;
            border-radius:12px;
            background:rgba(255,255,255,0.04);
            margin:8px 0 4px 0;"
        />
      ` : ""}

      ${desc ? `
        <div style="
          font-size:13px;
          opacity:0.75;
          line-height:1.35;
          margin:4px 0 2px 0;
          max-height:54px;
          overflow:hidden;">
          ${desc}
        </div>
      ` : ""}

      <div style="opacity:0.9; font-size:14px;">
        ${
          showPrice
            ? `Preț: <b>${formatMoney(finalPrice)} lei</b>`
            : `Prețuri vizibile doar pentru clienți activi`
        }
      </div>

      <div class="qty-controls">
        <button type="button" data-action="dec" data-id="${id}">-</button>
        <span class="qty" data-qty-for="${id}">0</span>
        <button type="button" data-action="inc" data-id="${id}">+</button>
        <button class="add" type="button" data-action="add" data-id="${id}">Adaugă</button>
      </div>
    </div>
  `;
}

/* =========================
   Events
========================= */

function bindGridClickOnce(productsGrid) {
  if (_gridClickBound || !productsGrid) return;
  _gridClickBound = true;

  productsGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action][data-id]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    const current = asNumber(getItemCount(id));

    if (action === "inc") increment(id, +1);
    else if (action === "dec") increment(id, -1);
    else if (action === "add") {
      // “Adaugă” = dacă e 0, pune 1; altfel +1
      if (current <= 0) setQuantity(id, 1);
      else increment(id, +1);
    }

    updateQtyBadges(productsGrid);
  });
}

function bindCartUpdatedOnce(productsGrid) {
  if (_cartUpdatedBound) return;
  _cartUpdatedBound = true;

  // dacă cart.js emite ceva gen window.dispatchEvent(new Event("cartUpdated"))
  window.addEventListener("cartUpdated", () => {
    updateQtyBadges(productsGrid);
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
  ensureCartBar(productsGrid);
  bindGridClickOnce(productsGrid);
  bindCartUpdatedOnce(productsGrid);

  // categories
  await renderCategories(productsGrid);

  // filter by category
  let filtered = _lastItems;
  if (_selectedCategoryId && _selectedCategoryId !== "ALL") {
    filtered = filtered.filter((p) => String(p.categoryId || "") === _selectedCategoryId);
  }

  if (!productsGrid) return;
  productsGrid.innerHTML = "";

  filtered.forEach((p) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = productCardHTML(p);
    productsGrid.appendChild(wrap.firstElementChild);
  });

  // sync quantities after render
  updateQtyBadges(productsGrid);
}
