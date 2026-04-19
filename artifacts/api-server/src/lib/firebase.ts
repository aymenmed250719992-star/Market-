import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "./logger";

function initFirebase() {
  if (getApps().length > 0) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT env var is required for Firebase Admin SDK");
  }

  // Replit may escape newlines in secrets — try to unescape first
  const rawJson = serviceAccount.replace(/\\n/g, "\n");

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // fallback: try original as-is
    try {
      parsed = JSON.parse(serviceAccount);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
  }

  // Ensure private_key newlines are real newlines (not escaped)
  if (parsed.private_key && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  initializeApp({
    credential: cert(parsed),
    projectId: parsed.project_id ?? process.env.FIREBASE_PROJECT_ID,
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
