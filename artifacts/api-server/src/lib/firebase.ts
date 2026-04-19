import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "./logger";

function initFirebase() {
  if (getApps().length > 0) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is required for Firebase Admin SDK");
  }

  const parsed = JSON.parse(serviceAccount);

  initializeApp({
    credential: cert(parsed),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  logger.info("Firebase Admin initialized");
}

initFirebase();

export const firestore = getFirestore();

export async function nextId(collection: string): Promise<number> {
  const counterRef = firestore.collection("_counters").doc(collection);
  const id = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? (snap.data()!.next as number) : 1;
    tx.set(counterRef, { next: current + 1 }, { merge: true });
    return current;
  });
  return id;
}

export function tsToDate(val: any): any {
  if (!val) return val;
  if (typeof val.toDate === "function") return val.toDate();
  return val;
}
