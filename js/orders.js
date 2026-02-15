// js/orders.js
// Submit order using items received from UI (event.detail.items)
// Saves full clientSnapshot and safe statusHistory

import { auth, db } from "./firebase.js";

import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round(asNumber(n) * 100) / 100;
}

export async function submitOrder({ clientId, items }) {
  if (!clientId) throw new Error("clientId lipsă.");
  const user = auth.currentUser;
  if (!user) throw new Error("Trebuie să fii logat.");

  // ✅ items vin din catalog.js prin event.detail.items
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) throw new Error("Coș gol.");

  // normalize + validare minimă
  const normalized = safeItems
    .map((it) => {
      const qty = asNumber(it.qty);
      const unit = round2(it.unitPriceFinal ?? it.unit ?? 0);
      return {
        productId: String(it.productId || ""),
        name: String(it.name || ""),
        qty,
        unitPriceFinal: unit,
        lineTotal: round2(unit * qty)
      };
    })
    .filter((it) => it.productId && it.qty > 0);

  if (!normalized.length) throw new Error("Coș gol.");

  const total = round2(normalized.reduce((s, it) => s + it.lineTotal, 0));

  // ===== client snapshot =====
  const userRef = doc(db, "users", clientId);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const contact = userData.contact || {};

  const clientSnapshot = {
    uid: clientId,
    email: userData.email || user.email || "",
    phone: userData.phone || "",
    fullName: contact.fullName || "",
    county: contact.county || "",
    city: contact.city || "",
    address: contact.address || "",
    clientType: userData.clientType || "",
    channel: userData.channel || ""
  };

  // ===== order number & write =====
  const counterRef = doc(db, "counters", "orders");

  const result = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);

    let nextNumber = 1000;
    if (counterSnap.exists()) {
      const current = asNumber(counterSnap.data().lastNumber || 1000);
      nextNumber = current + 1;
    }

    tx.set(counterRef, { lastNumber: nextNumber }, { merge: true });

    const orderRef = doc(collection(db, "orders"));

    tx.set(orderRef, {
      orderNumber: nextNumber,
      clientId,
      clientSnapshot,
      items: normalized,
      total,
      status: "NEW",
      statusHistory: [
        {
          status: "NEW",
          at: Timestamp.now(), // ✅ OK in arrays
          adminUid: null
        }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { orderNumber: nextNumber };
  });

  return result;
}
