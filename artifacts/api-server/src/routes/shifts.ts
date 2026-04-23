import { Router, type IRouter } from "express";
import { nextId, tsToDate } from "../lib/firebase";
import { shiftsCache, salesCache, usersCache } from "../lib/cache";
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
  employeeBarcode: z.string().min(1).optional(),
  cashierId: z.number().int().positive().optional(),
  startingFloat: z.number().min(0).default(0),
}).refine((d) => !!d.employeeBarcode || !!d.cashierId, { message: "employeeBarcode or cashierId is required" });

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

  const { employeeBarcode, cashierId, startingFloat } = parsed.data;
  let userId: number | null = null;
  let user: any = null;
  if (employeeBarcode) {
    const found = await usersCache.findOne((u) => u.employeeBarcode === employeeBarcode);
    if (!found) {
      res.status(404).json({ error: "الباركود غير معروف — لم يتم التعرف على الموظف" });
      return;
    }
    userId = found.id;
    user = found.data;
  } else if (cashierId) {
    const data = await usersCache.get(cashierId);
    if (!data) {
      res.status(404).json({ error: "الموظف غير موجود" });
      return;
    }
    userId = cashierId;
    user = data;
  }

  const existing = await shiftsCache.findOne((s) => s.cashierId === userId && s.status === "open");
  if (existing) {
    res.status(409).json({
      error: "يوجد وردية مفتوحة مسبقاً لهذا الموظف",
      shift: toShift(existing.id, existing.data),
      user: { id: userId, name: user.name, role: user.role },
    });
    return;
  }

  const id = await nextId("shifts");
  const now = new Date();
  const data = {
    cashierId: userId!,
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
  await shiftsCache.set(id, data);
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
  let shift: any = shiftId ? await shiftsCache.get(shiftId) : null;
  if (!shift) {
    const token = req.cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token, "base64").toString());
        const found = await shiftsCache.findOne((s) => s.cashierId === payload.id && s.status === "open");
        if (found) {
          shiftId = found.id;
          shift = found.data;
        }
      } catch {}
    }
  }
  if (!shift || !shiftId) {
    res.status(404).json({ error: "الوردية غير موجودة" });
    return;
  }
  if (shift.status === "closed") {
    res.status(409).json({ error: "الوردية مغلقة مسبقاً" });
    return;
  }

  const allSales = await salesCache.all();
  const shiftStart = tsToDate(shift.openedAt);

  const cashSales = allSales.filter(
    ({ data: s }) => s.cashierId === shift.cashierId && tsToDate(s.createdAt) >= shiftStart && s.paymentMethod === "cash",
  );
  const systemTotal = cashSales.reduce((sum, { data: s }) => sum + parseFloat(s.total), 0);
  const totalSales = allSales
    .filter(({ data: s }) => s.cashierId === shift.cashierId && tsToDate(s.createdAt) >= shiftStart)
    .reduce((sum, { data: s }) => sum + parseFloat(s.total), 0);

  const expected = parseFloat(shift.startingFloat) + systemTotal;
  const deficit = closingCash - expected;

  const merged = await shiftsCache.update(shiftId, {
    closingCash: closingCash.toString(),
    systemTotal: systemTotal.toString(),
    totalSales: totalSales.toString(),
    deficit: deficit.toString(),
    notes: notes ?? null,
    status: "closed",
    closedAt: new Date(),
  });
  res.json(toShift(shiftId, merged ?? shift));
});

router.get("/shifts", async (req, res): Promise<void> => {
  let shifts = await shiftsCache.all();
  shifts.sort((a, b) => +tsToDate(b.data.openedAt) - +tsToDate(a.data.openedAt));

  const cashierId = req.query.cashierId ? parseInt(req.query.cashierId as string) : undefined;
  const status = req.query.status as string | undefined;
  if (cashierId) shifts = shifts.filter(({ data }) => data.cashierId === cashierId);
  if (status) shifts = shifts.filter(({ data }) => data.status === status);

  res.json(shifts.map(({ id, data }) => toShift(id, data)));
});

router.get("/shifts/active/:cashierId", async (req, res): Promise<void> => {
  const cashierId = parseInt(req.params.cashierId as string, 10);
  const found = await shiftsCache.findOne((s) => s.cashierId === cashierId && s.status === "open");
  if (!found) {
    res.status(404).json({ error: "لا توجد وردية مفتوحة" });
    return;
  }
  res.json(toShift(found.id, found.data));
});

export default router;
