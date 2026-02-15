// admin.js (ROOT, lângă admin.html)
import { auth, db } from "./js/firebase.js";
import { normalizePhone, phoneToEmail } from "./js/auth.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let ALL_CATEGORIES = []; // [{id,name}]
let ALL_USERS = [];      // [{uid, phone, name}]

// -------------------- AUTH UI --------------------
$("btnLogin").onclick = async () => {
  $("err").textContent = "";

  const phone = normalizePhone($("phone").value);
  const pass = $("pass").value;

  if (!phone || phone.length < 9) return ($("err").textContent = "Telefon invalid.");
  if (!pass || pass.length < 6) return ($("err").textContent = "Parola minim 6 caractere.");

  try {
    await signInWithEmailAndPassword(auth, phoneToEmail(phone), pass);
  } catch (e) {
    $("err").textContent = e?.message || "Eroare login";
  }
};

$("btnLogout").onclick = () => signOut(auth);

// -------------------- STATE --------------------
onAuthStateChanged(auth, async (u) => {
  $("me").textContent = "";
  $("pending").innerHTML = "";
  $("active").innerHTML = "";
  $("err").textContent = "";

  if (!u) return;

  try {
    // verifică dacă e admin
    const meRef = doc(db, "users", u.uid);
    const meSnap = await getDoc(meRef);
    const me = meSnap.exists() ? meSnap.data() : null;

    $("me").innerHTML = `<small>UID: ${u.uid}</small><br><b>role:</b> ${me?.role || "(lipsește)"} | <b>status:</b> ${me?.status || "(lipsește)"}`;

    if (me?.role !== "admin") {
      $("err").textContent = "Nu ești admin. Setează: users/{uid}.role = 'admin'.";
      return;
    }

    await loadCategories();
    await loadUsers();
  } catch (e) {
    console.error(e);
    $("err").textContent = e?.message || String(e);
  }
});

// -------------------- CATEGORIES --------------------
async function loadCategories() {
  const snap = await getDocs(collection(db, "categories"));
  const cats = [];

  snap.forEach((d) => {
    const data = d.data() || {};
    if (data.active === false) return;
    cats.push({
      id: d.id,
      name: String(data.name || d.id),
      sortOrder: Number(data.sortOrder ?? 999999),
    });
  });

  ALL_CATEGORIES = cats
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}

// -------------------- USERS LIST (fără orderBy) --------------------
async function loadUsers() {
  $("pending").innerHTML = "";
  $("active").innerHTML = "";
  $("err").textContent = "";

  try {
    // 1) Toți userii pentru dropdown affiliate
    const allSnap = await getDocs(collection(db, "users"));
    ALL_USERS = [];
    allSnap.forEach((s) => {
      const d = s.data() || {};
      ALL_USERS.push({
        uid: s.id,
        phone: d.phone || "",
        name: d.contact?.fullName || "",
      });
    });

    // 2) Pending
    const qPend = query(collection(db, "users"), where("status", "==", "pending"));
    const pendSnap = await getDocs(qPend);
    $("pending").innerHTML = pendSnap.size ? "" : "<small>Nimic pending.</small>";
    pendSnap.forEach((s) => $("pending").appendChild(renderUserCard(s.id, s.data(), true)));

    // 3) Active
    const qAct = query(collection(db, "users"), where("status", "==", "active"));
    const actSnap = await getDocs(qAct);
    $("active").innerHTML = actSnap.size ? "" : "<small>Nimic active.</small>";
    actSnap.forEach((s) => $("active").appendChild(renderUserCard(s.id, s.data(), false)));

  } catch (e) {
    console.error(e);
    $("err").textContent = e?.message || String(e);
  }
}

function renderUserCard(uid, u, isPending) {
  const div = document.createElement("div");
  div.className = "card";

  const clientType = u?.clientType || "tip1";
  const channel = u?.channel || "internet";
  const globalMarkup = Number(u?.priceRules?.globalMarkup ?? 0);
  const categoriesObj = u?.priceRules?.categories || {};
  const referrerUid = u?.referrerUid || "";

  div.innerHTML = `
    <b>${u.phone || "(fără phone)"} </b> <small>(${uid})</small><br>
    <small>
      status: ${u.status || "-"} |
      tip: ${u.clientType || "-"} |
      canal: ${u.channel || "-"} |
      recomandat de: ${u.referrerPhone || u.referrerUid || "-"}
    </small>
    <br><br>

    <div class="row" style="flex-wrap:wrap; gap:10px; align-items:center;">
      <label>Tip client:
        <select class="clientType">
          <option value="tip1">Tip 1</option>
          <option value="tip2">Tip 2</option>
          <option value="tip3">Tip 3</option>
        </select>
      </label>

      <label>Canal:
        <select class="channel">
          <option value="internet">Internet</option>
          <option value="gasit_de_mine">Găsit de mine</option>
          <option value="recomandare_crescator">Recomandare (crescător)</option>
          <option value="alt_crescator">Alt crescător</option>
        </select>
      </label>

      <label>Recomandat de:
        <select class="referrer" disabled></select>
      </label>

      <label>Adaos global (%):
        <input class="globalMarkup" type="number" step="0.01" min="0" />
      </label>

      ${isPending ? `<button class="approve">Aprobă</button>` : `<button class="deactivate">Trece în pending</button>`}
    </div>

    <div class="card" style="background:#fafafa">
      <b>Adaos pe categorie (override)</b><br>
      <small>Dacă nu există override, se aplică adaosul global.</small>

      <div class="row" style="margin-top:8px; flex-wrap:wrap; gap:10px; align-items:center;">
        <select class="catSelect"></select>
        <input class="catMarkup" type="number" step="0.01" min="0" placeholder="% categorie" />
        <button class="setCat">Setează/Actualizează</button>
        <button class="delCat">Șterge override</button>
      </div>

      <div class="catList" style="margin-top:8px"></div>
    </div>
  `;

  // prefill
  div.querySelector(".clientType").value = clientType;
  div.querySelector(".channel").value = channel;
  div.querySelector(".globalMarkup").value = String(globalMarkup);

  const channelSel = div.querySelector(".channel");
  const refSel = div.querySelector(".referrer");

  // populate referrer dropdown
  {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(fără)";
    refSel.appendChild(opt);
  }

  ALL_USERS
    .filter((x) => x.uid !== uid)
    .sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone))
    .forEach((x) => {
      const opt = document.createElement("option");
      opt.value = x.uid;
      opt.textContent = `${x.name || "(fără nume)"} — ${x.phone || x.uid}`;
      refSel.appendChild(opt);
    });

  refSel.value = referrerUid;

  function syncRefEnabled() {
    refSel.disabled = channelSel.value !== "recomandare_crescator";
    if (refSel.disabled) refSel.value = ""; // curățare dacă schimbi canalul
  }
  channelSel.addEventListener("change", syncRefEnabled);
  syncRefEnabled();

  // dropdown categories
  const catSelect = div.querySelector(".catSelect");
  if (!ALL_CATEGORIES.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(nu există categorii)";
    catSelect.appendChild(opt);
  } else {
    ALL_CATEGORIES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });
  }

  // list overrides
  renderCatList(div, categoriesObj);

  const readForm = () => ({
    clientType: div.querySelector(".clientType").value,
    channel: div.querySelector(".channel").value,
    globalMarkup: Number(div.querySelector(".globalMarkup").value || 0),
    referrerUid: div.querySelector(".referrer").value || "",
  });

  // Approve / deactivate
  if (isPending) {
    div.querySelector(".approve").onclick = async () => {
      const f = readForm();

      if (!f.clientType) return alert("Selectează tip client.");
      if (!f.channel) return alert("Selectează canalul.");
      if (!Number.isFinite(f.globalMarkup) || f.globalMarkup <= 0) {
        return alert("Setează adaos global (%) > 0 înainte de aprobare.");
      }

      if (f.channel === "recomandare_crescator" && !f.referrerUid) {
        return alert("Selectează afiliatul (Recomandat de).");
      }

      const ref = ALL_USERS.find((x) => x.uid === f.referrerUid);

      await updateDoc(doc(db, "users", uid), {
        status: "active",
        clientType: f.clientType,
        channel: f.channel,
        referrerUid: (f.channel === "recomandare_crescator") ? f.referrerUid : "",
        referrerPhone: (f.channel === "recomandare_crescator") ? (ref?.phone || "") : "",
        priceRules: {
          globalMarkup: f.globalMarkup,
          categories: categoriesObj || {},
        },
        updatedAt: serverTimestamp(),
      });

      await loadUsers();
    };
  } else {
    div.querySelector(".deactivate").onclick = async () => {
      await updateDoc(doc(db, "users", uid), {
        status: "pending",
        updatedAt: serverTimestamp(),
      });
      await loadUsers();
    };
  }

  // Set category override
  div.querySelector(".setCat").onclick = async () => {
    const catId = div.querySelector(".catSelect").value;
    if (!catId) return alert("Nu există categorie selectată.");

    const markup = Number(div.querySelector(".catMarkup").value || 0);
    if (!Number.isFinite(markup) || markup <= 0) {
      return alert("Adaos categorie trebuie să fie > 0.");
    }

    await updateDoc(doc(db, "users", uid), {
      [`priceRules.categories.${catId}`]: markup,
      updatedAt: serverTimestamp(),
    });

    await loadUsers();
  };

  // Delete category override
  div.querySelector(".delCat").onclick = async () => {
    const catId = div.querySelector(".catSelect").value;
    if (!catId) return alert("Nu există categorie selectată.");

    await updateDoc(doc(db, "users", uid), {
      [`priceRules.categories.${catId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });

    await loadUsers();
  };

  return div;
}

function renderCatList(div, categoriesObj) {
  const list = div.querySelector(".catList");
  const entries = Object.entries(categoriesObj || {});
  if (!entries.length) {
    list.innerHTML = "<small>(fără override pe categorii)</small>";
    return;
  }

  const nameById = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.id, c.name]));

  list.innerHTML = entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, v]) => {
      const label = nameById[id]
        ? `${nameById[id]} <small style="opacity:.6">(${id})</small>`
        : id;
      return `<small><b>${label}</b>: ${Number(v)}%</small>`;
    })
    .join("<br>");
}
