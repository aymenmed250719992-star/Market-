import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { LoginBody } from "@workspace/api-zod";
import { z } from "zod";

const RegisterBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  password: z.string().min(6),
});

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة، تأكد من ملء جميع الحقول" });
    return;
  }
  const { name, email, phone, password } = parsed.data;

  const existing = await firestore.collection("users").where("email", "==", email).limit(1).get();
  if (!existing.empty) {
    res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    return;
  }

  const now = new Date();
  const id = await nextId("users");
  const newUser = {
    name,
    email,
    phone,
    password,
    role: "customer",
    baseSalary: null,
    employeeBarcode: null,
    activityPoints: 0,
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection("users").doc(String(id)).set(newUser);

  const { password: _pw, ...safeUser } = newUser;
  const token = Buffer.from(JSON.stringify({ id, role: "customer" })).toString("base64");
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
  res.status(201).json({
    user: { ...safeUser, id, createdAt: now, updatedAt: now },
    token,
  });
});

// Guest entry — issues a session for an ephemeral guest account so non-authenticated
// users can place orders. Reuses an existing guest user per device when phone is provided.
router.post("/auth/guest", async (req, res): Promise<void> => {
  const phone = (req.body?.phone as string | undefined)?.trim();
  const name = (req.body?.name as string | undefined)?.trim() || "ضيف";
  const now = new Date();

  let id: number;
  let user: any;
  if (phone) {
    const existing = await firestore.collection("users").where("phone", "==", phone).limit(1).get();
    if (!existing.empty) {
      id = parseInt(existing.docs[0].id, 10);
      user = existing.docs[0].data();
    }
  }
  if (!user!) {
    id = await nextId("users");
    user = {
      name,
      email: phone ? `${phone}@guest.local` : `guest_${id}@guest.local`,
      phone: phone ?? null,
      password: null,
      role: "customer",
      isGuest: true,
      baseSalary: null,
      employeeBarcode: null,
      activityPoints: 0,
      createdAt: now,
      updatedAt: now,
    };
    await firestore.collection("users").doc(String(id)).set(user);
  }

  const token = Buffer.from(JSON.stringify({ id: id!, role: user.role })).toString("base64");
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
  const { password: _pw, ...safe } = user;
  res.json({ user: { ...safe, id: id!, createdAt: tsToDate(user.createdAt), updatedAt: tsToDate(user.updatedAt) }, token });
});

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
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 365 * 24 * 60 * 60 * 1000 });
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
