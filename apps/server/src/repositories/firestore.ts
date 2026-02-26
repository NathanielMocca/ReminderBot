import admin from "firebase-admin";

let initialized = false;

export function getDb(): FirebaseFirestore.Firestore {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    initialized = true;
  }
  return admin.firestore();
}
