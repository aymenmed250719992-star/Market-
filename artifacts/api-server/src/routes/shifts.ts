import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";

const router: IRouter = Router();

function toShift(id: number, data: any) {
  return {
    ...data,
    id,
    openedAt: tsToDate(data.openedAt),
    closedAt: tsToDate(data.closedAt),
    startingFloat: parseFloat(data.startingFloat),
    closingCash: data.closingCash != null ? parseFloat(data.closingCash) : null,
    systemTotal: parseFloat(data.systemTotal),
    totalSales: parseFloat(data.totalSales),
    deficit: data.deficit != null ? parseFloat(data.deficit) : null,
  };
}

const OpenShiftBody = z.object({
  employeeBarcode: z.string().min(1),
  startingFloat: z.number().min(0).default(0),
});

const CloseShiftBody = z.object({
  shiftId: z.number().int().optional(),
  closingCash: z.number().min(0),
  notes: z.string().optional(),
});

router.post("/shifts/open", async (req, res): Promise<void> => {
  const parsed = OpenShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const { employeeBarcode, startingFloat } = parsed.data;
  const userSnap = await firestore.collection("users").where("employeeBarcode", "==", employeeBarcode).limit(1).get();
  if (userSnap.empty) {
    res.status(404).json({ error: "الباركود غير معروف — لم يتم التعرف على الموظف" });
    return;
  }
  const userDoc = userSnap.docs[0];
  const user = userDoc.data();
  const userId = parseInt(userDoc.id, 10);

  const existingSnap = await firestore.collection("shifts")
    .where("cashierId", "==", userId)
    .where("status", "==", "open")
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existingShift = existingSnap.docs[0];
    res.status(409).json({
      error: "يوجد وردية مفتوحة مسبقاً لهذا الموظف",
      shift: toShift(parseInt(existingShift.id, 10), existingShift.data()),
      user: { id: userId, name: user.name, role: user.role },
    });
    return;
  }

  const id = await nextId("shifts");
  const now = new Date();
  const data = {
    cashierId: userId,
    cashierName: user.name,
    startingFloat: startingFloat.toString(),
    systemTotal: "0",
    totalSales: "0",
    closingCash: null,
    deficit: null,
    notes: null,
    status: "open",
    openedAt: now,
    closedAt: null,
  };
  await firestore.collection("shifts").doc(String(id)).set(data);
  res.status(201).json({
    shift: toShift(id, data),
    user: { id: userId, name: user.name, role: user.role },
  });
});

router.post("/shifts/close", async (req, res): Promise<void> => {
  const parsed = CloseShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const { closingCash, notes } = parsed.data;
  let shiftId = parsed.data.shiftId;
  let shiftSnap = shiftId ? await firestore.collection("shifts").doc(String(shiftId)).get() : null;
  if (!shiftSnap?.exists) {
    const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token, "base64").toString());
        const activeSnap = await firestore.collection("shifts")
          .where("cashierId", "==", payload.id)
          .where("status", "==", "open")
          .limit(1)
          .get();
        if (!activeSnap.empty) {
          shiftId = parseInt(activeSnap.docs[0].id, 10);
          shiftSnap = activeSnap.docs[0] as any;
        }
      } catch {}
    }
  }
  if (!shiftSnap?.exists) {
    res.status(404).json({ error: "الوردية غير موجودة" });
    return;
  }
  const shift = shiftSnap.data()!;
  if (shift.status === "closed") {
    res.status(409).json({ error: "الوردية مغلقة مسبقاً" });
    return;
  }

  const salesSnap = await firestore.collection("sales").get();
  const shiftStart = tsToDate(shift.openedAt);
  const allSales = salesSnap.docs.map((d) => d.data());

  const cashSales = allSales.filter(
    (s) => s.cashierId === shift.cashierId && tsToDate(s.createdAt) >= shiftStart && s.paymentMethod === "cash"
  );
  const systemTotal = cashSales.reduce((sum, s) => sum + parseFloat(s.total), 0);
  const totalSales = allSales
    .filter((s) => s.cashierId === shift.cashierId && tsToDate(s.createdAt) >= shiftStart)
    .reduce((sum, s) => sum + parseFloat(s.total), 0);

  const expected = parseFloat(shift.startingFloat) + systemTotal;
  const deficit = closingCash - expected;

  await firestore.collection("shifts").doc(String(shiftId)).update({
    closingCash: closingCash.toString(),
    systemTotal: systemTotal.toString(),
    totalSales: totalSales.toString(),
    deficit: deficit.toString(),
    notes: notes ?? null,
    status: "closed",
    closedAt: new Date(),
  });
  const updated = await firestore.collection("shifts").doc(String(shiftId)).get();
  res.json(toShift(parseInt(updated.id, 10), updated.data()!));
});

router.get("/shifts", async (req, res): Promise<void> => {
  const snap = await firestore.collection("shifts").orderBy("openedAt", "desc").get();
  let shifts = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  const cashierId = req.query.cashierId ? parseInt(req.query.cashierId as string) : undefined;
  const status = req.query.status as string | undefined;
  if (cashierId) shifts = shifts.filter(({ raw }) => raw.cashierId === cashierId);
  if (status) shifts = shifts.filter(({ raw }) => raw.status === status);

  res.json(shifts.map(({ raw, id }) => toShift(id, raw)));
});

router.get("/shifts/active/:cashierId", async (req, res): Promise<void> => {
  const cashierId = parseInt(req.params.cashierId as string, 10);
  const snap = await firestore.collection("shifts")
    .where("cashierId", "==", cashierId)
    .where("status", "==", "open")
    .limit(1)
    .get();
  if (snap.empty) {
    res.status(404).json({ error: "لا توجد وردية مفتوحة" });
    return;
  }
  const doc = snap.docs[0];
  res.json(toShift(parseInt(doc.id, 10), doc.data()));
});

export default router;
