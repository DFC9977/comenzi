const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "gosbiromania.appspot.com"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const folderPath = "./upload";

async function run() {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const sku = path.parse(file).name;

    console.log("Uploading:", file);

    await bucket.upload(path.join(folderPath, file), {
      destination: `products/${file}`,
      public: true
    });

    const url = `https://storage.googleapis.com/${bucket.name}/products/${file}`;

    const snap = await db.collection("products")
      .where("sku", "==", sku)
      .get();

    if (snap.empty) {
      console.log("SKU NOT FOUND:", sku);
      continue;
    }

    await snap.docs[0].ref.update({
      imageUrls: [url]
    });

    console.log("Updated:", sku);
  }
