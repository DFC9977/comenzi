// js/cart.js
// Stable cart module (localStorage) + emits "cart:updated"
// Cart schema:
// { items: { [productId]: qty }, updatedAt: number }

const STORAGE_KEY = "gosbi_cart_v2";

/* =========================
   Internal helpers
========================= */

function emptyCart() {
  return { items: {}, updatedAt: Date.now() };
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function canUseStorage() {
  try {
    const k = "__t";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const _hasStorage = canUseStorage();

// in-memory fallback (rare, but protects from crashes)
let _memCart = emptyCart();

function readCart() {
  if (!_hasStorage) return _memCart;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyCart();

  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return emptyCart();
  if (!parsed.items || typeof parsed.items !== "object") return emptyCart();

  return {
    items: parsed.items,
    updatedAt: Number(parsed.updatedAt || Date.now())
  };
}

function writeCart(cart) {
  const clean = {
    items: cart?.items && typeof cart.items === "object" ? cart.items : {},
    updatedAt: Date.now()
  };

  if (_hasStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // if quota exceeded, fallback to memory
      _memCart = clean;
    }
  } else {
    _memCart = clean;
  }

  // single source of truth: notify UI
  window.dispatchEvent(new CustomEvent("cart:updated", { detail: clean }));
  return clean;
}

function asQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/* =========================
   Public API
========================= */

export function getCart() {
  return readCart();
}

export function getItemsArray() {
  const cart = readCart();
  const items = cart.items || {};

  return Object.entries(items)
    .map(([productId, qty]) => ({ productId, qty: asQty(qty) }))
    .filter((x) => x.productId && x.qty > 0);
}

export function getItemCount() {
  return getItemsArray().reduce((sum, it) => sum + it.qty, 0);
}

export function getQty(productId) {
  if (!productId) return 0;
  const cart = readCart();
  return asQty(cart.items?.[productId] || 0);
}

export function setQuantity(productId, qty) {
  if (!productId) return readCart();

  const cart = readCart();
  const items = { ...(cart.items || {}) };
  const q = asQty(qty);

  if (q <= 0) delete items[productId];
  else items[productId] = q;

  return writeCart({ items });
}

export function increment(productId, step = 1) {
  if (!productId) return readCart();

  const cart = readCart();
  const items = { ...(cart.items || {}) };
  const current = asQty(items[productId] || 0);
  const next = asQty(current + Number(step || 0));

  if (next <= 0) delete items[productId];
  else items[productId] = next;

  return writeCart({ items });
}

export function removeItem(productId) {
  if (!productId) return readCart();
  const cart = readCart();
  const items = { ...(cart.items || {}) };
  delete items[productId];
  return writeCart({ items });
}

export function clearCart() {
  return writeCart(emptyCart());
}
