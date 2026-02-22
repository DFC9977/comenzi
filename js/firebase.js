import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const hostname = window.location.hostname;

// PROD
const firebaseConfigProd = {
  apiKey: "AIzaSyCyuJfFO-9ZiZd_xhrVPzeHumxacDiOHbk",
  authDomain: "comenzi-2969b.firebaseapp.com",
  projectId: "comenzi-2969b",
  storageBucket: "comenzi-2969b.firebasestorage.app",
  messagingSenderId: "470205004865",
  appId: "1:470205004865:web:f67d84006aac09396a5ac0"
};

// STAGING (lasă config-ul vechi gosbiromania)
const firebaseConfigStaging = {
  apiKey: "AICI_PUI_CONFIG_GOSBIROMANIA",
  authDomain: "gosbiromania.firebaseapp.com",
  projectId: "gosbiromania",
  storageBucket: "gosbiromania.firebasestorage.app",
  messagingSenderId: "885972653346",
  appId: "1:885972653346:web:76fda6a5435050e432017b"
};

const firebaseConfig =
  hostname.includes("comenzi-2969b") ||
  hostname.includes("comenzi9")
    ? firebaseConfigProd
    : firebaseConfigStaging;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);