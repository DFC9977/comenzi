// js/pdf-export.js
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================
   Helpers
========================= */

function formatRON(v) {
  return Number(v || 0)
    .toFixed(2)
    .replace(".", ",") + " RON";
}

// ✅ scoate sufixul _DOG (doar la final)
function cleanSku(sku) {
  if (!sku) return "";
  return String(sku).replace(/_DOG$/i, "");
}

// În caz că nu e "sku" exact, încearcă câmpuri alternative
function pickSkuFromData(data) {
  if (!data || typeof data !== "object") return "";
  return (
    data.sku ||
    data.SKU ||
    data.erpCode ||
    data.erp ||
    data.codERP ||
    data.cod ||
    data.code ||
    ""
  );
}

/**
 * Completează SKU pentru items folosind products/{productId}.
 * Dacă item-ul are deja sku, îl păstrează.
 */
async function enrichItemsWithSku(db, items) {
  const safe = Array.isArray(items) ? items : [];
  const ids = [...new Set(safe.map((it) => String(it.productId || "")).filter(Boolean))];

  const map = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, "products", id));
        map.set(id, snap.exists() ? pickSkuFromData(snap.data()) : "");
      } catch {
        map.set(id, "");
      }
    })
  );

  return safe.map((it) => {
    const existing =
      it.sku || it.SKU || it.erpCode || it.codERP || it.code || it.cod || "";
    const fromDb = map.get(String(it.productId || "")) || "";
    return { ...it, sku: existing || fromDb || "" };
  });
}

/* =========================
   Export
========================= */

/**
 * Export PDF A4 (listare internă, nu factură)
 * IMPORTANT: async + primește db ca parametru.
 */
export async function exportOrderPDFA4_PRO(order, db) {
  if (!db) throw new Error("DB lipsă (exportOrderPDFA4_PRO are nevoie de db).");
  if (!window.jspdf?.jsPDF) throw new Error("jsPDF nu este încărcat.");
  if (!order) throw new Error("Order lipsă.");

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;

  const c = order.clientSnapshot || {};

  const orderDate = order.createdAt?.seconds
    ? new Date(order.createdAt.seconds * 1000)
    : new Date();

  /* ---------- Header / Footer ---------- */

  const drawHeader = () => {
    pdf.setFontSize(16);
    // ✅ doar "COMANDA"
    pdf.text("COMANDA", pageWidth / 2, 12, { align: "center" });

    pdf.setFontSize(9);
    pdf.text(
      `ID: ${order.orderNumber || "-"} | Data: ${orderDate.toLocaleString("ro-RO")}`,
      pageWidth / 2,
      18,
      { align: "center" }
    );

    pdf.setDrawColor(0);
    pdf.line(margin, 22, pageWidth - margin, 22);
  };

  const drawFooter = () => {
    const pageCount = pdf.internal.getNumberOfPages();
    const pageNumber = pdf.internal.getCurrentPageInfo().pageNumber;

    pdf.setDrawColor(0);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    pdf.setFontSize(9);
    pdf.text(`Pagina ${pageNumber} / ${pageCount}`, pageWidth / 2, pageHeight - 6, {
      align: "center"
    });
  };

  drawHeader();

  /* ---------- Client box ---------- */

  let y = 35;

  pdf.setFontSize(11);
  pdf.text("CLIENT", margin, y);
  y += 5;

  pdf.rect(margin, y, pageWidth - margin * 2, 30);

  pdf.setFontSize(10);

  const clientText = [
    `Nume: ${c.fullName || "—"}`,
    `Telefon: ${c.phone || "—"}`,
    `Email: ${c.email || "—"}`,
    `Adresă: ${c.address || "—"}`,
    `Localitate: ${c.city || "—"}, ${c.county || "—"}`,
    `Canal: ${c.channel || "—"}`
  ];

  let ty = y + 7;
  clientText.forEach((t) => {
    pdf.text(t, margin + 4, ty);
    ty += 6;
  });

  y += 45;

  /* ---------- Products table ---------- */

  const enrichedItems = await enrichItemsWithSku(db, order.items || []);

  const rows = enrichedItems.map((p) => [
    cleanSku(p.sku) || "—", // ✅ fără _DOG
    p.name || "",
    p.qty || 0,
    formatRON(p.unitPriceFinal),
    formatRON(p.discount || 0),
    formatRON(p.lineTotal)
  ]);

  pdf.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [["SKU", "Produs", "Cant.", "Preț", "Discount", "Total"]],
    body: rows,

    styles: {
      fontSize: 10,
      cellPadding: 4,
      lineWidth: 0.1,
      lineColor: [150, 150, 150],
      overflow: "linebreak"
    },

    headStyles: {
      fillColor: [40, 40, 40],
      textColor: 255,
      fontSize: 10,
      halign: "center"
    },

    columnStyles: {
      0: { cellWidth: 28 }, // SKU
      1: { cellWidth: 78 }, // Produs
      2: { cellWidth: 16, halign: "center" }, // Cant
      3: { cellWidth: 22, halign: "right" }, // Preț
      4: { cellWidth: 24, halign: "right" }, // Discount
      5: { cellWidth: 22, halign: "right" } // Total
    },

    didDrawPage: () => {
      drawHeader();
      drawFooter();
    }
  });

  /* ---------- Totals ---------- */

  const fy = pdf.lastAutoTable.finalY + 12;

  const subtotal = order.total || 0;
  const discountTotal = order.discountTotal || 0;
  const transport = order.transport || 0;
  const totalPay = subtotal - discountTotal + transport;

  pdf.setFontSize(11);
  pdf.text("TOTALURI", margin, fy);

  pdf.setFontSize(10);
  pdf.text(`Subtotal: ${formatRON(subtotal)}`, margin, fy + 8);
  pdf.text(`Discount: ${formatRON(discountTotal)}`, margin, fy + 14);
  pdf.text(`Transport: ${formatRON(transport)}`, margin, fy + 20);

  pdf.setFontSize(14);
  pdf.setFont(undefined, "bold");
  pdf.text(`TOTAL: ${formatRON(totalPay)}`, margin, fy + 30);
  pdf.setFont(undefined, "normal");

  /* ---------- Save ---------- */

  const safeName = String(c.fullName || "Client").replace(/\s+/g, "");
  const date = new Date().toISOString().slice(0, 10);

  pdf.save(`ComandaInterna_${order.orderNumber || "NA"}_${safeName}_${date}.pdf`);
}
