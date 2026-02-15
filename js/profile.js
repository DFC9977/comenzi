// js/profile.js
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const COUNTIES = [
  "Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brăila","Brașov","București",
  "Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu",
  "Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț",
  "Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"
];

// Demo listă (extinzi tu când vrei)
const COUNTY_CITIES = {
  "București": ["București"],
  "Cluj": ["Cluj-Napoca","Turda","Dej"],
  "Bihor": ["Oradea","Salonta","Marghita"],
  "Satu Mare": ["Satu Mare","Carei","Negrești-Oaș"],
  "Sălaj": ["Zalău","Șimleu Silvaniei","Jibou"],
  "Timiș": ["Timișoara","Lugoj","Sânnicolau Mare"],
  "Iași": ["Iași","Pașcani","Hârlău"],
  "Constanța": ["Constanța","Mangalia","Medgidia"],
};

export function fillCountyOptions(countySelectEl) {
  if (!countySelectEl) return;
  // protecție: să nu dubleze opțiunile dacă funcția e chemată de mai multe ori
  if (countySelectEl.dataset.filled === "1") return;

  for (const c of COUNTIES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    countySelectEl.appendChild(opt);
  }

  countySelectEl.dataset.filled = "1";
}

/**
 * Umple un <datalist id="cityList"> cu opțiuni pentru județul selectat.
 * Dacă nu există județ în map, rămâne gol (user poate scrie manual în input).
 */
export function fillCityDatalist(cityListEl, county) {
  if (!cityListEl) return;

  cityListEl.innerHTML = "";
  const cities = COUNTY_CITIES[county] || [];

  for (const city of cities) {
    const opt = document.createElement("option");
    opt.value = city;
    cityListEl.appendChild(opt);
  }
}

/**
 * Citește profilul userului din Firestore: /users/{uid}
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Alias compatibil cu app.js (care cere getProfile)
 */
export async function getProfile(uid) {
  return getUserProfile(uid);
}

export function isContactComplete(profile) {
  return profile?.contact?.completed === true;
}

/**
 * Salvează contactul în /users/{uid}. Merge (merge:true).
 */
export async function saveContact(uid, payload) {
  if (!uid) throw new Error("UID lipsă.");

  const fullName = (payload?.fullName || "").trim();
  const address = (payload?.address || "").trim();
  const county = (payload?.county || "").trim();
  const city = (payload?.city || "").trim();

  if (fullName.length < 3) throw new Error("Completează numele.");
  if (address.length < 6) throw new Error("Completează adresa.");
  if (!county) throw new Error("Selectează județul.");
  if (city.length < 2) throw new Error("Completează localitatea.");

  const ref = doc(db, "users", uid);

  await setDoc(
    ref,
    {
      contact: {
        fullName,
        address,
        county,
        city,
        completed: true,
        completedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return true;
}
