import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const hostname = window.location.hostname;

// PROD (comenzi-2969b)
const firebaseConfigProd = {
  apiKey: "AIzaSyCYuJfF0-9ZiZd_xhrVPzeHumxacDiOHbk",
  authDomain: "comenzi-2969b.firebaseapp.com",
  projectId: "comenzi-2969b",
  storageBucket: "comenzi-2969b.firebasestorage.app",
  messagingSenderId: "470205004865",
  appId: "1:470205004865:web:f67d84006aac09396a5ac0"
};

// STAGING (gosbiromania)
const firebaseConfigStaging = {
  apiKey: "AIzaSyAtAxHsqXRUMQa2pP2473lIng3NwP9lL-I",
  authDomain: "gosbiromania.firebaseapp.com",
  projectId: "gosbiromania",
  storageBucket: "gosbiromania.appspot.com",
  messagingSenderId: "885972653346",
  appId: "1:885972653346:web:76fda6a5435050e432017b"
};

// Hostname -> config: gosbiromania -> staging; comenzi-2969b/comenzi9 -> prod; localhost/127.0.0.1 -> FB_ENV (default staging)
function getFirebaseConfig() {
  if (hostname.includes("gosbiromania")) return firebaseConfigStaging;
  if (hostname.includes("comenzi-2969b") || hostname.includes("comenzi9")) return firebaseConfigProd;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const env = typeof localStorage !== "undefined" && localStorage.getItem("FB_ENV");
    return env === "prod" ? firebaseConfigProd : firebaseConfigStaging;
  }
  return firebaseConfigStaging;
}

const firebaseConfig = getFirebaseConfig();
const env = firebaseConfig === firebaseConfigProd ? "prod" : "staging";

const app = initializeApp(firebaseConfig);

if (typeof console !== "undefined" && console.info) {
  console.info("[FB] env=" + env, { host: location.hostname, projectId: firebaseConfig.projectId });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);