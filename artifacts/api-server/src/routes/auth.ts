import { Router, type IRouter } from "express";
import { firestore, tsToDate } from "../lib/firebase";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const snap = await firestore.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const doc = snap.docs[0];
  const user = doc.data();
  if (user.password !== password) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const id = parseInt(doc.id, 10);
  const { password: _pw, ...safeUser } = user;
  const token = Buffer.from(JSON.stringify({ id, role: user.role })).toString("base64");
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.json({
    user: {
      ...safeUser,
      id,
      createdAt: tsToDate(user.createdAt),
      updatedAt: tsToDate(user.updatedAt),
      baseSalary: user.baseSalary != null ? parseFloat(user.baseSalary) : null,
    },
    token,
  });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie("session");
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    const snap = await firestore.collection("users").doc(String(payload.id)).get();
    if (!snap.exists) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const user = snap.data()!;
    const { password: _pw, ...safeUser } = user;
    res.json({
      ...safeUser,
      id: parseInt(snap.id, 10),
      createdAt: tsToDate(user.createdAt),
      updatedAt: tsToDate(user.updatedAt),
      baseSalary: user.baseSalary != null ? parseFloat(user.baseSalary) : null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
