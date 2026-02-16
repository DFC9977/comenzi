const admin = require("firebase-admin");
const axios = require("axios");

const serviceAccount = require("./serviceAccountKey.json");

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

// scoate "/media/cache/<filter>/" din url
function stripCachePath(url) {
  return url.replace(/\/media\/cache\/[^/]+\//i, "/");
}

// încearcă să genereze URL-uri alternative plauzibile pentru vivog
function buildCandidates(oldUrl) {
  const list = [];

  if (oldUrl && typeof oldUrl === "string") list.push(oldUrl);

  // 1) vivog: /media/cache/<filter>/...  -> /media/cache/resolve/<filter>/...
  // ex: /media/cache/product_zoom/assets/products/x.jpg
  const m = oldUrl.match(/\/media\/cache\/([^/]+)\/(.*)$/i);
  if (m) {
    const filter = m[1];
    const rest = m[2];
    list.push(`https://www.vivog.fr/media/cache/resolve/${filter}/${rest}`);
    list.push(`https://vivog.fr/media/cache/resolve/${filter}/${rest}`);
  }

  // 2) fără cache (direct)
  if (oldUrl.includes("/media/cache/")) {
    const noCache = stripCachePath(oldUrl);
    list.push(noCache);
    // și variantă fără www dacă e cazul
    list.push(noCache.replace("https://www.vivog.fr", "https://vivog.fr"));
  }

  // 3) dacă există /assets/products/... păstrează domenii
  const m2 = oldUrl.match(/\/assets\/products\/[^?#]+/i);
  if (m2) {
    list.push("https://www.vivog.fr" + m2[0]);
    list.push("https://vivog.fr" + m2[0]);
  }

  // 4) elimină duplicate + goluri
  return [...new Set(list.filter(Boolean))];
}

async function fetchImage(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,ro;q=0.7",
      "Referer": "https://www.google.com/",
    },
    validateStatus: (s) => s >= 200 && s < 500, // nu arunca automat
  });

  const ct = (res.headers["content-type"] || "").toLowerCase();

  // acceptăm doar imagine reală
  if (res.status >= 200 && res.status < 300 && ct.startsWith("image/")) {
    return res;
  }

  // pentru debugging: un mic preview textual
  let preview = "";
  try {
    preview = Buffer.from(res.data).toString("utf8", 0, 180).replace(/\s+/g, " ");
  } catch {
    preview = "";
  }

  const err = new Error(
    `Not an image. status=${res.status} ct=${ct || "?"} url=${url} preview="${preview}"`
  );
  err._status = res.status;
  err._ct = ct;
  throw err;
}

async function run() {
  const snap = await db.collection("products").get();

  for (const doc of snap.docs) {
    const data = doc.data();

    // ajustare: dacă ai alt câmp, schimbă aici
    if (!data.imageUrls || !data.imageUrls.length) continue;

    const oldUrl = data.imageUrls[0];
    const sku = data.sku;

    if (!sku) {
      console.log("SKIP doc fără sku:", doc.id);
      continue;
    }
    if (!oldUrl) {
      console.log("SKIP sku fără url:", sku);
      continue;
    }

    const candidates = buildCandidates(oldUrl);

    console.log("\nSKU:", sku);
    console.log("Candidates:");
    candidates.forEach((u) => console.log("  -", u));

    let response = null;
    let usedUrl = null;

    for (const u of candidates) {
      try {
        console.log("Trying:", u);
        response = await fetchImage(u);
        usedUrl = u;
        break;
      } catch (e) {
        console.log("  fail:", e.message);
      }
    }

    if (!response) {
      console.log("=> SKIP (niciun URL nu a returnat imagine)");
      continue;
    }

    const ct = response.headers["content-type"] || "";
    const ext = extFromContentType(ct);

    const storagePath = `products/${sku}.${ext}`;
    const file = bucket.file(storagePath);

    try {
      await file.save(response.data, {
        contentType: ct || "application/octet-stream",
        public: true,
      });

      const newUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      await doc.ref.update({ imageUrls: [newUrl] });

      console.log("OK:", sku, "from", usedUrl);
      console.log("=>", newUrl);
    } catch (e) {
      console.log("UPLOAD/UPDATE ERROR:", sku, e?.message || e);
    }
  }

  console.log("\nDONE");
}

run().catch((e) => console.error("FATAL:", e));
