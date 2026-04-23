import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { usersCache } from "../lib/cache";
import { LoginBody } from "@workspace/api-zod";
import { z } from "zod";

const RegisterBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(9),
  password: z.string().min(6),
});

const router: IRouter = Router();

async function findUserByEmail(email: string): Promise<{ id: number; data: any } | undefined> {
  const target = email.toLowerCase();
  return usersCache.findOne((u) => typeof u.email === "string" && u.email.toLowerCase() === target);
}

async function findUserByPhone(phone: string): Promise<{ id: number; data: any } | undefined> {
  return usersCache.findOne((u) => u.phone === phone);
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة، تأكد من ملء جميع الحقول" });
    return;
  }
  const { name, email, phone, password } = parsed.data;

  if (await findUserByEmail(email)) {
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
  await usersCache.set(id, newUser);

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

  let id: number | undefined;
  let user: any;
  if (phone) {
    const existing = await findUserByPhone(phone);
    if (existing) {
      id = existing.id;
      user = existing.data;
    }
  }
  if (!user) {
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
    await usersCache.set(id, user);
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

  const found = await findUserByEmail(email);
  if (!found) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const user = found.data;
  if (user.password !== password) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  const id = found.id;
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
    const id = Number(payload.id);
    const user = await usersCache.get(id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const { password: _pw, ...safeUser } = user;
    res.json({
      ...safeUser,
      id,
      createdAt: tsToDate(user.createdAt),
      updatedAt: tsToDate(user.updatedAt),
      baseSalary: user.baseSalary != null ? parseFloat(user.baseSalary) : null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
