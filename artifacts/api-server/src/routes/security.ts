import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { getRequestUser } from "../lib/audit";
import { firestore } from "../lib/firebase";

const router: IRouter = Router();

// Set or change a 4-6 digit security PIN for sensitive admin actions
router.post("/security/set-pin", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ error: "رمز PIN يجب أن يكون من 4 إلى 6 أرقام" });
    return;
  }
  const hash = await bcrypt.hash(pin, 10);
  await firestore.collection("users").doc(String(user.id)).update({ securityPin: hash, updatedAt: new Date() });
  res.json({ ok: true });
});

router.post("/security/verify-pin", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user) { res.status(401).json({ error: "غير مسجل" }); return; }
  const pin = String(req.body?.pin ?? "");
  const stored = (user.data as any)?.securityPin;
  if (!stored) { res.json({ ok: true, notSet: true }); return; }
  const match = await bcrypt.compare(pin, stored);
  if (!match) { res.status(401).json({ error: "رمز PIN غير صحيح" }); return; }
  res.json({ ok: true });
});

router.get("/security/pin-status", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user) { res.status(401).json({ error: "غير مسجل" }); return; }
  res.json({ isSet: !!(user.data as any)?.securityPin });
});

export default router;
