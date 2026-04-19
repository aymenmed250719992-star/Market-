import { Router, type IRouter } from "express";
import { db, shiftsTable, salesTable, usersTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const toShift = (s: typeof shiftsTable.$inferSelect) => ({
  ...s,
  startingFloat: parseFloat(s.startingFloat),
  closingCash: s.closingCash ? parseFloat(s.closingCash) : null,
  systemTotal: parseFloat(s.systemTotal),
  totalSales: parseFloat(s.totalSales),
  deficit: s.deficit ? parseFloat(s.deficit) : null,
});

const OpenShiftBody = z.object({
  employeeBarcode: z.string().min(1),
  startingFloat: z.number().min(0).default(0),
});

const CloseShiftBody = z.object({
  shiftId: z.number().int(),
  closingCash: z.number().min(0),
  notes: z.string().optional(),
});

// Open shift by scanning employee barcode
router.post("/shifts/open", async (req, res): Promise<void> => {
  const parsed = OpenShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const { employeeBarcode, startingFloat } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.employeeBarcode, employeeBarcode));

  if (!user) {
    res.status(404).json({ error: "الباركود غير معروف — لم يتم التعرف على الموظف" });
    return;
  }

  // Check if cashier already has an open shift
  const existingShifts = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.cashierId, user.id), eq(shiftsTable.status, "open")));

  if (existingShifts.length > 0) {
    res.status(409).json({
      error: "يوجد وردية مفتوحة مسبقاً لهذا الموظف",
      shift: toShift(existingShifts[0]),
      user: { id: user.id, name: user.name, role: user.role },
    });
    return;
  }

  const [shift] = await db
    .insert(shiftsTable)
    .values({
      cashierId: user.id,
      cashierName: user.name,
      startingFloat: startingFloat.toString(),
      status: "open",
    })
    .returning();

  res.status(201).json({
    shift: toShift(shift),
    user: { id: user.id, name: user.name, role: user.role },
  });
});

// Close shift with cash reconciliation
router.post("/shifts/close", async (req, res): Promise<void> => {
  const parsed = CloseShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const { shiftId, closingCash, notes } = parsed.data;
  const [shift] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, shiftId));

  if (!shift) {
    res.status(404).json({ error: "الوردية غير موجودة" });
    return;
  }
  if (shift.status === "closed") {
    res.status(409).json({ error: "الوردية مغلقة مسبقاً" });
    return;
  }

  // Sum all cash sales during this shift
  const allSales = await db.select().from(salesTable);
  const shiftStart = new Date(shift.openedAt);
  const cashSales = allSales.filter(
    (s) =>
      s.cashierId === shift.cashierId &&
      new Date(s.createdAt) >= shiftStart &&
      s.paymentMethod === "cash"
  );

  const systemTotal = cashSales.reduce((sum, s) => sum + parseFloat(s.total), 0);
  const totalSales = allSales
    .filter((s) => s.cashierId === shift.cashierId && new Date(s.createdAt) >= shiftStart)
    .reduce((sum, s) => sum + parseFloat(s.total), 0);

  // deficit = closingCash - (startingFloat + systemTotal)
  const expected = parseFloat(shift.startingFloat) + systemTotal;
  const deficit = closingCash - expected;

  const [updated] = await db
    .update(shiftsTable)
    .set({
      closingCash: closingCash.toString(),
      systemTotal: systemTotal.toString(),
      totalSales: totalSales.toString(),
      deficit: deficit.toString(),
      notes: notes ?? null,
      status: "closed",
      closedAt: new Date(),
    })
    .where(eq(shiftsTable.id, shiftId))
    .returning();

  res.json(toShift(updated));
});

// List all shifts
router.get("/shifts", async (req, res): Promise<void> => {
  const cashierId = req.query.cashierId ? parseInt(req.query.cashierId as string) : undefined;
  const status = req.query.status as string | undefined;

  let shifts = await db
    .select()
    .from(shiftsTable)
    .orderBy(sql`${shiftsTable.openedAt} desc`);

  if (cashierId) shifts = shifts.filter((s) => s.cashierId === cashierId);
  if (status) shifts = shifts.filter((s) => s.status === status);

  res.json(shifts.map(toShift));
});

// Get active shift for a cashier
router.get("/shifts/active/:cashierId", async (req, res): Promise<void> => {
  const cashierId = parseInt(req.params.cashierId as string, 10);
  const [shift] = await db
    .select()
    .from(shiftsTable)
    .where(and(eq(shiftsTable.cashierId, cashierId), eq(shiftsTable.status, "open")));

  if (!shift) {
    res.status(404).json({ error: "لا توجد وردية مفتوحة" });
    return;
  }
  res.json(toShift(shift));
});

export default router;
