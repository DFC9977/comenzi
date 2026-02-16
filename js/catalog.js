// js/catalog.js
// Catalog view renderer + cart UI (sticky bar + summary drawer)
//
// - Categories: buttons "Toate" + each category present in products
// - Product card: name + (gama badge) + producer + image + description + price + qty controls
// - Sticky cart bar: count + total + "Vezi coș" + "Trimite comanda"
// - Summary drawer: "Produs × qty", unit price, line total + remove
//
// NOTE: "Trimite comanda" dispatches: catalog:submitOrderRequested with detail.items

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getCart,
  increment,
  setQuantity,
  getItemCount,
  getItemsArray
} from "./cart.js";

/* =========================
   State
========================= */

let _lastItems = [];
let _lastRenderOpts = {
  showPrices: true,
  db: null,
  priceRules: null
};

let _selectedCategoryId = "ALL";

/* =========================
   Utils
========================= */

function asNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(x) {
  const n = asNumber(x);
  return n.toFixed(2).replace(/\.00$/, "");
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================
   Price compute
========================= */

function computeFinalPrice(p, showPrice, priceRules) {
  if (!showPrice) return 0;

  const base = asNumber(p.basePrice);

  // if no rules, return base
  if (!priceRules || typeof priceRules !== "object") return base;

  // priceRules example:
  // { mode:"percent", value:20 } or { mode:"fixed", value:10 }
  // You already handle other logic elsewhere; this is defensive.
  const mode = String(priceRules.mode || "").toLowerCase();
  const val = asNumber(priceRules.value);

  if (!mode) return base;

  if (mode === "percent") return Math.round(base * (1 + val / 100) * 100) / 100;
  if (mode === "fixed") return Math.max(0, Math.round((base + val) * 100) / 100);

  return base;
}

/* =========================
   Categories
========================= */

async function loadCategories(db) {
  const snap = await getDocs(
    query(collection(db, "categories"), orderBy("sortOrder"), orderBy("name"))
  );
  const cats = [];
  snap.forEach((d) => cats.push({ id: d.id, ...(d.data() || {}) }));
  return cats;
}

function renderCategoriesUI(productsGrid, categories, presentCategoryIds) {
  const wrapId = "categoriesWrap";
  let wrap = document.getElementById(wrapId);

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.style.display = "flex";
    wrap.style.gap = "10px";
    wrap.style.flexWrap = "wrap";
    wrap.style.margin = "14px 0 18px 0";

    const screen = document.getElementById("screenCatalog") || document.body;
    const hint = document.getElementById("catalogHint");
    if (hint && hint.parentElement) {
      hint.parentElement.insertBefore(wrap, hint.nextSibling);
    } else {
      screen.insertBefore(wrap, screen.firstChild);
    }
  }

  const btn = (label, categoryId) => {
    const active = _selectedCategoryId === categoryId;
    return `
      <button type="button"
        data-cat="${escHtml(categoryId)}"
        style="
          padding:10px 14px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,0.18);
          background:${active ? "rgba(255,255,255,0.12)" : "transparent"};
          color:inherit;
          cursor:pointer;
          font-weight:600;">
        ${escHtml(label)}
      </button>
    `;
  };

  const present = categories.filter((c) => presentCategoryIds.includes(String(c.id)));
  wrap.innerHTML =
    btn("Toate", "ALL") +
    present
      .map((c) => btn(String(c.name || c.id), String(c.id)))
      .join("");

  wrap.querySelectorAll("button[data-cat]").forEach((b) => {
    b.addEventListener("click", async () => {
      _selectedCategoryId = b.getAttribute("data-cat") || "ALL";
      // rerender
      await renderProducts(productsGrid, _lastItems, _lastRenderOpts);
    });
  });
}

/* =========================
   Layout / Styles
========================= */

function ensureGridLayout(productsGrid) {
  if (!productsGrid) return;
  productsGrid.style.display = "grid";
  productsGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(260px, 1fr))";
  productsGrid.style.gap = "18px";
}

function ensureCatalogStylesOnce() {
  if (document.getElementById("catalogStyles")) return;

  const style = document.createElement("style");
  style.id = "catalogStyles";
  style.textContent = `
    .product-card button:hover { filter: brightness(1.1); }
    #stickyCartBar {
      position: sticky;
      bottom: 0;
      z-index: 50;
      width: 100%;
      margin-top: 18px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 16px;
      backdrop-filter: blur(8px);
      background: rgba(0,0,0,0.35);
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #stickyCartBar .left { font-weight: 700; }
    #stickyCartBar .muted { opacity: 0.75; font-weight: 500; }
    #stickyCartBar button {
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.06);
      color: inherit;
      padding: 10px 12px;
      cursor: pointer;
      font-weight: 700;
      white-space: nowrap;
    }
    #cartSummaryWrap {
      margin-top: 12px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 16px;
      padding: 12px;
      background: rgba(0,0,0,0.25);
    }
    #cartSummaryWrap h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .cart-row {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 8px 0;
      border-top: 1px solid rgba(255,255,255,0.10);
    }
    .cart-row:first-of-type { border-top: 0; }
    .cart-row .name { font-weight: 700; }
    .cart-row .qty { opacity: 0.85; }
    .cart-row .money { font-weight: 800; }
    .cart-row .remove {
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.18);
      background: transparent;
      color: inherit;
      padding: 6px 10px;
      cursor: pointer;
      opacity: 0.9;
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   Qty helpers
========================= */

function getQtyFromCart(productId) {
  const cart = getCart();
  return asNumber(cart[productId]?.qty);
}

function setQtyUI(cardEl, qty) {
  const input = cardEl.querySelector('input[data-role="qty"]');
  if (input) input.value = String(Math.max(0, asNumber(qty)));
}

function syncAllVisibleQty(productsGrid) {
  if (!productsGrid) return;
  productsGrid.querySelectorAll(".product-card").forEach((card) => {
    const id = card.getAttribute("data-product-id");
    if (!id) return;
    setQtyUI(card, getQtyFromCart(id));
  });
}

function updateQtyBadges(productsGrid) {
  // optional hook if you add badges later; keep safe
  void productsGrid;
}

/* =========================
   Cart bar + summary
========================= */

function getCartItemsEnriched() {
  const raw = getItemsArray(); // [{ productId, qty }]
  const productsById = window.__PRODUCTS_BY_ID__ || {};
  const showPrices = !!_lastRenderOpts.showPrices;

  return raw
    .filter((it) => asNumber(it.qty) > 0)
    .map((it) => {
      const productId = String(it.productId || "");
      const qty = asNumber(it.qty);
      const p = productsById[productId] || {};

      const unitFinal = showPrices
        ? asNumber(computeFinalPrice(p, true, _lastRenderOpts.priceRules))
        : 0;

      return {
        productId,
        qty,
        name: String(p.name || "Produs"),
        sku: String(p.sku || ""),
        unitPriceFinal: unitFinal,
        lineTotal: showPrices ? Math.round(unitFinal * qty * 100) / 100 : 0
      };
    });
}

function getCartTotal() {
  const items = getCartItemsEnriched();
  return items.reduce((s, it) => s + asNumber(it.lineTotal), 0);
}

function renderCartSummaryIntoBar(bar) {
  let wrap = bar.querySelector("#cartSummaryWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "cartSummaryWrap";
    wrap.style.display = "none";
    bar.appendChild(wrap);
  }

  const items = getCartItemsEnriched();
  const total = getCartTotal();

  if (!items.length) {
    wrap.innerHTML = `<div style="opacity:0.75;">Coș gol.</div>`;
    return;
  }

  wrap.innerHTML = `
    <h3>Detalii coș</h3>
    ${items
      .map(
        (it) => `
      <div class="cart-row" data-cart-product="${escHtml(it.productId)}">
        <div class="name">${escHtml(it.name)}</div>
        <div class="qty">× ${it.qty}</div>
        <div class="money">${_lastRenderOpts.showPrices ? formatMoney(it.lineTotal) + " lei" : ""}</div>
        <button class="remove" type="button" data-action="remove">Șterge</button>
      </div>
    `
      )
      .join("")}
    ${
      _lastRenderOpts.showPrices
        ? `<div style="border-top:1px solid rgba(255,255,255,0.12); padding-top:10px; display:flex; justify-content:flex-end; gap:10px;">
            <div style="opacity:0.8; font-weight:700;">Total:</div>
            <div style="font-weight:900;">${formatMoney(total)} lei</div>
          </div>`
        : ""
    }
  `;

  wrap.querySelectorAll('button[data-action="remove"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".cart-row");
      const pid = row?.getAttribute("data-cart-product");
      if (!pid) return;

      setQuantity(pid, 0);
      updateStickyCartBarVisibilityAndData();

      // keep open + re-render
      const wasOpen = wrap.style.display !== "none";
      if (wasOpen) renderCartSummaryIntoBar(bar);

      // sync grid qty
      const grid = window.__CATALOG_GRID__;
      if (grid) syncAllVisibleQty(grid);
    });
  });
}

function buildOrderItemsForSubmit() {
  // Build enriched items from cart + latest products map.
  const raw = getItemsArray(); // [{ productId, qty }]
  const productsById = window.__PRODUCTS_BY_ID__ || {};
  const showPrices = !!_lastRenderOpts.showPrices;

  return raw
    .filter((it) => asNumber(it.qty) > 0)
    .map((it) => {
      const productId = String(it.productId || "");
      const qty = asNumber(it.qty);
      const p = productsById[productId] || {};

      const unitBase = asNumber(p.basePrice);
      const unitFinal = showPrices ? asNumber(computeFinalPrice(p, true, _lastRenderOpts.priceRules)) : 0;

      return {
        productId,
        qty,
        name: String(p.name || ""),
        sku: String(p.sku || ""),
        categoryId: String(p.categoryId || ""),
        unitPriceBase: unitBase,
        unitPriceFinal: unitFinal,
        lineTotal: showPrices ? Math.round(unitFinal * qty * 100) / 100 : 0
      };
    });
}

function ensureStickyCartBar() {
  ensureCatalogStylesOnce();

  let bar = document.getElementById("stickyCartBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "stickyCartBar";
    bar.innerHTML = `
      <div class="left">
        Coș: <span id="cartCount">0</span> buc
        <span class="muted" id="cartTotalWrap" style="margin-left:10px;"></span>
      </div>
      <div style="flex:1;"></div>
      <button type="button" id="btnToggleCart">Detalii</button>
      <button type="button" id="btnSubmitOrder">Trimite comanda</button>
    `;

    const screen = document.getElementById("screenCatalog") || document.body;
    screen.appendChild(bar);

    // toggle details
    bar.querySelector("#btnToggleCart").addEventListener("click", () => {
      const wrap = bar.querySelector("#cartSummaryWrap");
      if (!wrap) return;
      const open = wrap.style.display !== "none";
      wrap.style.display = open ? "none" : "block";
      if (!open) renderCartSummaryIntoBar(bar);
    });

    // submit
    bar.querySelector("#btnSubmitOrder").addEventListener("click", () => {
      const count = getItemCount();
      if (count <= 0) return alert("Coșul este gol.");
      window.dispatchEvent(
        new CustomEvent("catalog:submitOrderRequested", {
          detail: { items: buildOrderItemsForSubmit() }
        })
      );
    });
  }

  return bar;
}

function updateStickyCartBarVisibilityAndData() {
  const bar = ensureStickyCartBar();
  const count = getItemCount();
  bar.style.display = count > 0 ? "flex" : "none";

  const c = bar.querySelector("#cartCount");
  if (c) c.textContent = String(count);

  const totalWrap = bar.querySelector("#cartTotalWrap");
  if (totalWrap) {
    if (_lastRenderOpts.showPrices) {
      totalWrap.textContent = `• Total: ${formatMoney(getCartTotal())} lei`;
      totalWrap.style.display = "inline";
    } else {
      totalWrap.textContent = "";
      totalWrap.style.display = "none";
    }
  }

  const wrap = bar.querySelector("#cartSummaryWrap");
  if (wrap && wrap.style.display !== "none") {
    renderCartSummaryIntoBar(bar);
  }
}

/* =========================
   Card renderer (WITH IMG + DESC + GAMA + PRODUCER)
========================= */

function productCardHTML(p, showPrice, priceRules) {
  const id = String(p.id || "");
  const name = String(p.name || "");
  const img = (p.imageUrls && p.imageUrls[0]) ? String(p.imageUrls[0]) : "";
  const desc = (p.description != null && String(p.description).trim()) ? String(p.description).trim() : "";
  const gama = (p.gama != null && String(p.gama).trim()) ? String(p.gama).trim() : "";
  const producer = (p.producer != null && String(p.producer).trim()) ? String(p.producer).trim() : "";

  const finalPrice = computeFinalPrice(p, showPrice, priceRules);
  const qty = showPrice ? getQtyFromCart(id) : 0;

  return `
    <div class="product-card"
         data-product-id="${id}"
         style="border:1px solid rgba(255,255,255,0.10); border-radius:16px; padding:14px; display:flex; flex-direction:column; gap:10px;">

      <div style="font-weight:700; line-height:1.25; font-size:16px;">
        ${escHtml(name)}

        ${gama ? `
          <div style="
            display:inline-block;
            background:#1f2937;
            padding:4px 8px;
            border-radius:8px;
            font-size:12px;
            margin-top:6px;">
            ${escHtml(gama)}
          </div>
        ` : ""}

        ${producer ? `
          <div style="font-size:13px; opacity:0.7; margin-top:4px;">
            ${escHtml(producer)}
          </div>
        ` : ""}
      </div>

      ${img ? `
        <img src="${escHtml(img)}" alt="${escHtml(name)}"
             style="
               width:100%;
               height:160px;
               object-fit:contain;
               margin:6px 0 0 0;
               border-radius:12px;
               background:#111;">
      ` : ""}

      ${desc ? `
        <div style="font-size:13px; opacity:0.7; margin-top:4px;">
          ${escHtml(desc)}
        </div>
      ` : ""}

      <div style="opacity:0.9; font-size:14px;">
        ${
          showPrice
            ? `Preț: <b>${formatMoney(finalPrice)} lei</b>`
            : `Prețuri vizibile doar pentru clienți activi`
        }
      </div>

      ${
        showPrice
          ? `
          <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
            <button type="button" data-action="dec"
              aria-label="Scade cantitatea"
              style="width:44px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:transparent; color:inherit; font-size:20px; cursor:pointer;">−</button>

            <input data-role="qty" type="number" min="0" inputmode="numeric" value="${qty}"
              style="width:72px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:transparent; color:inherit; text-align:center; padding:0 8px; font-size:16px;" />

            <button type="button" data-action="inc"
              aria-label="Crește cantitatea"
              style="width:44px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:transparent; color:inherit; font-size:20px; cursor:pointer;">+</button>

            <div style="flex:1;"></div>

            <button type="button" data-action="add"
              style="padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); color:inherit; cursor:pointer; font-weight:600;">
              Adaugă
            </button>
          </div>
          `
          : `
          <button type="button" disabled
            style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.15); background:transparent; color:inherit; opacity:0.6;">
            Comandă (indisponibil)
          </button>
          `
      }
    </div>
  `;
}

/* =========================
   Bindings
========================= */

function ensureCartBindings(productsGrid) {
  if (!productsGrid) return;
  window.__CATALOG_GRID__ = productsGrid;

  if (productsGrid.__cartBound) return;
  productsGrid.__cartBound = true;

  productsGrid.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-action]");
    if (!btn) return;

    const card = btn.closest(".product-card");
    const pid = card?.getAttribute("data-product-id");
    if (!pid) return;

    const action = btn.getAttribute("data-action");

    if (action === "inc") {
      increment(pid, +1);
    } else if (action === "dec") {
      increment(pid, -1);
    } else if (action === "add") {
      // "Add" = +1 (simple)
      increment(pid, +1);
    }

    // sync UI
    setQtyUI(card, getQtyFromCart(pid));
    updateStickyCartBarVisibilityAndData();
    updateQtyBadges(productsGrid);
  });

  productsGrid.addEventListener("change", (ev) => {
    const input = ev.target.closest('input[data-role="qty"]');
    if (!input) return;

    const card = input.closest(".product-card");
    const pid = card?.getAttribute("data-product-id");
    if (!pid) return;

    const qty = Math.max(0, Math.floor(asNumber(input.value)));
    setQuantity(pid, qty);

    // sync UI + bar
    setQtyUI(card, qty);
    updateStickyCartBarVisibilityAndData();
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
  _lastItems = Array.isArray(items) ? items : [];
  _lastRenderOpts = {
    showPrices: !!opts.showPrices,
    db: opts.db || null,
    priceRules: opts.priceRules || null
  };

  ensureGridLayout(productsGrid);
  ensureCartBindings(productsGrid);

  const screenHint = document.getElementById("catalogHint");
  if (screenHint) {
    screenHint.textContent = _lastRenderOpts.showPrices
      ? "Cont activ. Prețurile sunt vizibile."
      : "Ești în așteptare (pending). Vezi catalog fără prețuri.";
  }

  // Keep base map too (useful elsewhere)
  window.__PRODUCTS_BY_ID__ = window.__PRODUCTS_BY_ID__ || {};
  _lastItems.forEach((p) => (window.__PRODUCTS_BY_ID__[p.id] = p));

  // Categories UI
  try {
    const db = _lastRenderOpts.db || window.__db || null;
    const categories = db ? await loadCategories(db) : [];
    const presentCategoryIds = uniq(
      _lastItems.map((p) => String(p.categoryId || "")).filter(Boolean)
    );
    if (categories.length) renderCategoriesUI(productsGrid, categories, presentCategoryIds);
  } catch (e) {
    console.warn("Categories load failed:", e);
  }

  const filtered =
    _selectedCategoryId === "ALL"
      ? _lastItems
      : _lastItems.filter((p) => String(p.categoryId || "") === _selectedCategoryId);

  if (!productsGrid) return;
  productsGrid.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.8";
    empty.textContent = "Nu există produse în această categorie.";
    productsGrid.appendChild(empty);
    return;
  }

  filtered.forEach((p) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = productCardHTML(p, _lastRenderOpts.showPrices, _lastRenderOpts.priceRules);
    productsGrid.appendChild(wrap.firstElementChild);
  });

  if (_lastRenderOpts.showPrices) {
    syncAllVisibleQty(productsGrid);
    updateStickyCartBarVisibilityAndData();
  } else {
    const bar = document.getElementById("stickyCartBar");
    if (bar) bar.style.display = "none";
  }
}
