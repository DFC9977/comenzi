import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function normalizePhone(raw) {
  return (raw || "")
    .replace(/\s+/g, "")
    .replace(/^\+4/, "") // dacă user pune +40
    .replace(/^0040/, "")
    .trim();
}

export function phoneToEmail(phone) {
  // IMPORTANT: e doar “email intern” pentru auth v1
  return `${phone}@phone.local`;
}

export async function loginWithPhone(phoneRaw, pass) {
  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 9) throw new Error("Telefon invalid.");
  if (!pass || pass.length < 6) throw new Error("Parola trebuie să aibă minim 6 caractere.");

  const email = phoneToEmail(phone);
  const cred = await signInWithEmailAndPassword(auth, email, pass);

  await ensureUserDoc(cred.user.uid, { phone, email });
  return cred.user;
}

export async function registerWithPhone(phoneRaw, pass) {
  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 9) throw new Error("Telefon invalid.");
  if (!pass || pass.length < 6) throw new Error("Parola trebuie să aibă minim 6 caractere.");

  const email = phoneToEmail(phone);
  const cred = await createUserWithEmailAndPassword(auth, email, pass);

  await ensureUserDoc(cred.user.uid, { phone, email }, true);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

async function ensureUserDoc(uid, { phone, email }, isNew = false) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      phone,
      email,
      role: "client",
      status: "pending",
      contact: {
        fullName: "",
        address: "",
        county: "",
        city: "",
        completed: false,
        completedAt: null
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return;
  }

  // dacă există, doar păstrăm actualizat updatedAt + phone/email dacă lipsesc
  const data = snap.data();
  const patch = {};
  if (!data.phone) patch.phone = phone;
  if (!data.email) patch.email = email;
  if (Object.keys(patch).length) {
    patch.updatedAt = serverTimestamp();
    await setDoc(ref, patch, { merge: true });
  }

  // isNew flag nu e necesar aici, dar l-am lăsat pentru extinderi
}
