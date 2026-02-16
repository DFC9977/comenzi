const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

const serviceAccount = require("./serviceAccountKey.json");

// ✅ bucket-ul tău REAL (din Firebase Storage: gs://gosbiromania.firebasestorage.app)
const STORAGE_BUCKET = "gosbiromania.firebasestorage.app";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: STORAGE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket(STORAGE_BUCKET);

console.log("Using bucket:", bucket.name);

function extFromContentType(ct) {
  if (!ct) return "jpg";
  ct = ct.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

function isAlreadyInOurBucket(url) {
  if (!url) return false;
  return (
    url.includes(`storage.googleapis.com/${STORAGE_BUCKET}/`) ||
    url.includes(`firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/`)
  );
}

// URL “Firebase style” (merge cu rules; în test mode merge imediat)
function firebasePublicUrl(objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(
    objectPath
  )}?alt=media`;
}

async function downloadToBuffer(url) {
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    validateStatus: () => true,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (resp.status >= 200 && resp.status < 300) {
    const ct = resp.headers?.["content-type"] || "";
    return { buf: Buffer.from(resp.data), contentType: ct };
  }

  const msg = typeof resp.data === "string" ? resp.data.slice(0, 200) : "";
  throw new Error(`HTTP ${resp.status} ${msg}`.trim());
}

async function run() {
  const snap = await db.collection("products").get();

  for (const doc of snap.docs) {
    const p = doc.data();
    const sku = String(p.sku || doc.id);

    const currentUrl =
      Array.isArray(p.imageUrls) && p.imageUrls.length ? String(p.imageUrls[0] || "") : "";

    // ✅ dacă deja e pe bucket-ul nostru, nu refacem
    if (isAlreadyInOurBucket(currentUrl)) {
      console.log("SKIP already migrated:", sku);
      continue;
    }

    // dacă n-ai niciun url, sari
    if (!currentUrl) {
      console.log("SKIP no image url:", sku);
      continue;
    }

    try {
      console.log("\nSKU:", sku);
      console.log("Downloading from:", currentUrl);

      const { buf, contentType } = await downloadToBuffer(currentUrl);
      const ext = extFromContentType(contentType);

      const objectPath = `products/${sku}.${ext}`;
      const file = bucket.file(objectPath);

      // upload
      await file.save(buf, {
        resumable: false,
        metadata: {
          contentType: contentType || (ext === "png" ? "image/png" : "image/jpeg"),
          cacheControl: "public, max-age=31536000",
        },
      });

      const newUrl = firebasePublicUrl(objectPath);

      await doc.ref.update({ imageUrls: [newUrl] });

      console.log("OK:", sku);
      console.log("=>", newUrl);
    } catch (err) {
      console.log("UPLOAD/UPDATE ERROR:", sku, "|", err?.message || err);
    }
  }

  console.log("\nDONE");
}

run().catch((e) => console.error("FATAL:", e));
