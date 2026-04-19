import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || user.password !== password) {
    res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }
  const { password: _pw, ...safeUser } = user;
  const token = Buffer.from(JSON.stringify({ id: user.id, role: user.role })).toString("base64");
  req.session = req.session ?? {};
  (req as any).session.userId = user.id;
  res.cookie("session", token, { httpOnly: true, sameSite: "lax" });
  res.json({
    user: {
      ...safeUser,
      baseSalary: safeUser.baseSalary ? parseFloat(safeUser.baseSalary) : null,
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const { password: _pw, ...safeUser } = user;
    res.json({
      ...safeUser,
      baseSalary: safeUser.baseSalary ? parseFloat(safeUser.baseSalary) : null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
