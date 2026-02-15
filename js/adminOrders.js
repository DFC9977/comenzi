import { auth, db } from "./firebase.js";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const listEl = document.getElementById("ordersList");
const filterEl = document.getElementById("filterStatus");
const refreshBtn = document.getElementById("refreshBtn");

let ordersData = [];

function formatMoney(v) {
  return Number(v || 0).toLocaleString("ro-RO");
}

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString("ro-RO");
}

function render() {
  const filter = filterEl.value;

  const items = ordersData.filter(o =>
    filter === "ALL" ? true : o.status === filter
  );

  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML = "<div>Nu există comenzi.</div>";
    return;
  }

  items.forEach(order => {
    const card = document.createElement("div");
    card.className = "order-card";

    const header = document.createElement("div");
    header.className = "order-header";

    header.innerHTML = `
      <div>
        <strong>#${order.orderNumber}</strong><br>
        ${order.clientName || order.clientId}<br>
        ${formatDate(order.createdAt)}
      </div>

      <div>
        Total: <strong>${formatMoney(order.total)} lei</strong>
      </div>
    `;

    const controls = document.createElement("div");

    const select = document.createElement("select");
    ["NEW","CONFIRMED","SENT","DELIVERED","CANCELED"].forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (order.status === s) opt.selected = true;
      select.appendChild(opt);
    });

    const btn = document.createElement("button");
    btn.textContent = "Salvează";

    btn.onclick = async () => {
      const user = auth.currentUser;
      if (!user) return alert("Nu ești logat.");

      await updateDoc(doc(db, "orders", order.id), {
        status: select.value,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: select.value,
          at: Timestamp.now(),
          adminUid: user.uid
        })
      });

      alert("Status actualizat.");
    };

    controls.appendChild(select);
    controls.appendChild(btn);

    header.appendChild(controls);

    card.appendChild(header);

    const lines = document.createElement("div");
    lines.className = "order-lines";

    order.items.forEach(line => {
      const row = document.createElement("div");
      row.className = "line";
      row.innerHTML = `
        <div>${line.name} × ${line.qty}</div>
        <div>${formatMoney(line.lineTotal)} lei</div>
      `;
      lines.appendChild(row);
    });

    card.appendChild(lines);
    listEl.appendChild(card);
  });
}

function subscribe() {
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, snap => {
    ordersData = [];
    snap.forEach(d => {
      ordersData.push({ id: d.id, ...d.data() });
    });
    render();
  });
}

filterEl.addEventListener("change", render);
refreshBtn.addEventListener("click", render);

subscribe();
