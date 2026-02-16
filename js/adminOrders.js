import { auth, db } from "./firebase.js";
import { exportOrderPDFA4_PRO } from "./pdf-export.js";

import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const listEl = document.getElementById("ordersList");
const filterEl = document.getElementById("filterStatus");
const refreshBtn = document.getElementById("refreshBtn");

let ordersData = [];

// ===== Helpers =====
function formatMoney(v) {
  return Number(v || 0).toLocaleString("ro-RO");
}

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("ro-RO");
}

// ===== Render =====
function render() {
  const filter = filterEl.value;

  const items = ordersData.filter((o) =>
    filter === "ALL" ? true : o.status === filter
  );

  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = "<div>Nu există comenzi.</div>";
    return;
  }

  items.forEach((order) => {
    const card = document.createElement("div");
    card.className = "order-card";

    card.innerHTML = `
      <div><b>Comanda #${order.orderNumber || "-"}</b></div>
      <div>Status: ${order.status || "-"}</div>
      <div>Data: ${formatDate(order.createdAt)}</div>
      <div>Total: ${formatMoney(order.total)} RON</div>
      <br>
      <button class="exportBtn">Export PDF</button>
    `;

    card.querySelector(".exportBtn").onclick = () => {
      exportOrderPDFA4_PRO(order, db);
    };

    listEl.appendChild(card);
  });
}

// ===== Firestore Listener =====
function loadOrders() {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snap) => {
    ordersData = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));

    render();
  });
}

// ===== Events =====
filterEl.addEventListener("change", render);
refreshBtn.addEventListener("click", render);

// ===== Init =====
loadOrders();
