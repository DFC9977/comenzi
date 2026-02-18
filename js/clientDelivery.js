// js/clientDelivery.js — Afișare date livrare pentru client
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const deliveryCard  = document.getElementById("deliveryCard");
const deliveryDates = document.getElementById("deliveryDates");

function formatDateRO(d) {
  return new Date(d).toLocaleDateString("ro-RO", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  });
}

function calcNextDeliveries(startDate, intervalDays, count = 3) {
  if (!startDate || !intervalDays) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const base = new Date(startDate);
  base.setHours(0, 0, 0, 0);

  // Găsim prima dată >= azi pornind de la startDate cu pas intervalDays
  const dates = [];
  let current = new Date(base);

  // Avansăm până ajungem la o dată >= azi
  while (current < today) {
    current.setDate(current.getDate() + intervalDays);
  }

  // Luăm următoarele `count` date
  for (let i = 0; i < count; i++) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + intervalDays);
  }

  return dates;
}

async function loadDeliveryInfo(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const data = snap.data();

    const deliveryStart   = data?.deliveryStartDate || "";
    const deliveryInt     = Number(data?.deliveryIntervalDays || 0);
    const deliveryDay     = data?.deliveryDay || "";
    const deliveryFreq    = Number(data?.deliveryFrequency || 1);

    if (!deliveryStart || !deliveryInt) return;

    const dates = calcNextDeliveries(deliveryStart, deliveryInt, 3);
    if (!dates.length) return;

    // Afișăm cardul
    if (deliveryCard) deliveryCard.classList.add("show");
    if (!deliveryDates) return;

    deliveryDates.innerHTML = "";

    dates.forEach((d, i) => {
      const chip = document.createElement("div");
      chip.className = `delivery-date-chip${i === 0 ? " next" : ""}`;
      chip.textContent = formatDateRO(d);
      deliveryDates.appendChild(chip);
    });

    // Info frecvență dacă există
    if (deliveryDay || deliveryFreq > 1) {
      const info = document.createElement("div");
      info.style.cssText = "width:100%; margin-top:8px; font-size:12px; opacity:.55;";
      const parts = [];
      if (deliveryDay) parts.push(`Zi livrare: ${deliveryDay}`);
      if (deliveryFreq > 1) parts.push(`Frecvență: de ${deliveryFreq}x la ${deliveryInt} zile`);
      else parts.push(`La fiecare ${deliveryInt} zile`);
      info.textContent = parts.join(" · ");
      deliveryDates.appendChild(info);
    }

  } catch (e) {
    console.error("clientDelivery:", e);
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  await loadDeliveryInfo(user.uid);
});
