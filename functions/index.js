const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1" });

/**
 * Callable function: adminResetUserPassword
 * Apelata din admin panel pentru a seta o parola noua unui client.
 * Doar adminii pot apela aceasta functie.
 *
 * Input: { phone: "07xx", newPassword: "xxx", requestId: "docId" (optional) }
 * Output: { success: true }
 */
exports.adminResetUserPassword = onCall(async (request) => {
  // 1. Verifica autentificarea
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Trebuie să fii autentificat.");
  }

  // 2. Verifica ca apelantul este admin in Firestore
  const callerUid = request.auth.uid;
  const callerDoc = await admin.firestore()
    .collection("users")
    .doc(callerUid)
    .get();

  if (!callerDoc.exists || callerDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Nu ai permisiuni de admin.");
  }

  const { phone, newPassword, requestId } = request.data;

  // 3. Valideaza input
  if (!phone || !newPassword) {
    throw new HttpsError("invalid-argument", "Telefon și parolă sunt obligatorii.");
  }
  if (newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Parola trebuie să aibă minim 6 caractere.");
  }

  // 4. Gaseste userul dupa email-ul fals (phone@phone.local)
  const email = `${phone}@phone.local`;
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError(
      "not-found",
      `Utilizatorul cu telefonul ${phone} nu a fost găsit în Firebase Auth.`
    );
  }

  // 5. Seteaza parola noua
  await admin.auth().updateUser(userRecord.uid, { password: newPassword });

  // 6. Marcheaza cererea ca rezolvata (daca s-a transmis requestId)
  if (requestId) {
    await admin.firestore()
      .collection("passwordResetRequests")
      .doc(requestId)
      .update({
        status: "resolved",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: callerUid,
      });
  }

  return { success: true };
});
