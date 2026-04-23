import { Router, type IRouter } from "express";
import { tsToDate } from "../lib/firebase";
import { salesCache, expensesCache, advancesCache } from "../lib/cache";
import { productsCacheApi } from "./products";
import { getRequestUser } from "../lib/audit";

const router: IRouter = Router();

interface PeriodStats {
  label: string;
  monthKey: string;
  salesCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  discount: number;
  expenses: number;
  advances: number;
  netProfit: number;
  avgTicket: number;
  topProducts: { id: number; name: string; qty: number; revenue: number; profit: number }[];
  dailyRevenue: { day: string; revenue: number; profit: number }[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(year, month, 1, 0, 0, 0, 0),
    end: new Date(year, month + 1, 1, 0, 0, 0, 0),
  };
}

function buildPeriodStats(
  label: string,
  range: { start: Date; end: Date },
  allSales: { id: number; data: any }[],
  productsById: Map<number, any>,
  allExpenses: { id: number; data: any }[],
  allAdvances: { id: number; data: any }[],
): PeriodStats {
  const mKey = monthKey(range.start);

  const periodSales = allSales
    .map((s) => ({ ...s.data, _date: tsToDate(s.data.createdAt) }))
    .filter((s) => s._date >= range.start && s._date < range.end);

  let revenue = 0;
  let cost = 0;
  let grossProfit = 0;
  let discount = 0;
  const productAgg = new Map<number, { name: string; qty: number; revenue: number; profit: number }>();
  const dayAgg = new Map<string, { revenue: number; profit: number }>();

  for (const sale of periodSales) {
    revenue += parseFloat(sale.total ?? "0");
    discount += parseFloat(sale.discount ?? "0");
    let saleProfit = 0;

    for (const item of (sale.items as any[]) ?? []) {
      const product = productsById.get(item.productId);
      const unitCost = product
        ? (product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice))
        : 0;
      const itemRevenue = item.price * item.quantity;
      const itemProfit = (item.price - unitCost) * item.quantity;
      cost += unitCost * item.quantity;
      grossProfit += itemProfit;
      saleProfit += itemProfit;

      const existing = productAgg.get(item.productId) ?? {
        name: product?.name ?? `#${item.productId}`,
        qty: 0,
        revenue: 0,
        profit: 0,
      };
      existing.qty += item.quantity;
      existing.revenue += itemRevenue;
      existing.profit += itemProfit;
      productAgg.set(item.productId, existing);
    }

    grossProfit -= parseFloat(sale.discount ?? "0");
    saleProfit -= parseFloat(sale.discount ?? "0");

    const dayKey = sale._date.toISOString().slice(0, 10);
    const dayRow = dayAgg.get(dayKey) ?? { revenue: 0, profit: 0 };
    dayRow.revenue += parseFloat(sale.total ?? "0");
    dayRow.profit += saleProfit;
    dayAgg.set(dayKey, dayRow);
  }

  const monthExpenses = allExpenses
    .map((e) => e.data)
    .filter((e) => e.month === mKey)
    .reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);

  const monthAdv = allAdvances
    .map((a) => a.data)
    .filter((a) => a.month === mKey && a.type === "advance")
    .reduce((sum, a) => sum + parseFloat(a.amount ?? "0"), 0);

  const netProfit = grossProfit - monthExpenses - monthAdv;
  const topProducts = Array.from(productAgg.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const daysInMonth = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate();
  const dailyRevenue: { day: string; revenue: number; profit: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${mKey}-${String(d).padStart(2, "0")}`;
    const row = dayAgg.get(key) ?? { revenue: 0, profit: 0 };
    dailyRevenue.push({ day: String(d), revenue: row.revenue, profit: row.profit });
  }

  return {
    label,
    monthKey: mKey,
    salesCount: periodSales.length,
    revenue,
    cost,
    grossProfit,
    discount,
    expenses: monthExpenses,
    advances: monthAdv,
    netProfit,
    avgTicket: periodSales.length ? revenue / periodSales.length : 0,
    topProducts,
    dailyRevenue,
  };
}

router.get("/analytics/monthly-comparison", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const now = new Date();
  const yParam = req.query.year ? parseInt(String(req.query.year)) : now.getFullYear();
  const mParam = req.query.month ? parseInt(String(req.query.month)) - 1 : now.getMonth();

  const currentRange = monthRange(yParam, mParam);
  const prevDate = new Date(yParam, mParam - 1, 1);
  const prevRange = monthRange(prevDate.getFullYear(), prevDate.getMonth());

  const [allSales, productList, allExpenses, allAdvances] = await Promise.all([
    salesCache.all(),
    productsCacheApi.all(),
    expensesCache.all(),
    advancesCache.all(),
  ]);

  const productsById = new Map<number, any>();
  for (const { id, raw } of productList) productsById.set(id, raw);

  const current = buildPeriodStats(
    `${currentRange.start.getFullYear()}-${String(currentRange.start.getMonth() + 1).padStart(2, "0")}`,
    currentRange,
    allSales,
    productsById,
    allExpenses,
    allAdvances,
  );
  const previous = buildPeriodStats(
    `${prevRange.start.getFullYear()}-${String(prevRange.start.getMonth() + 1).padStart(2, "0")}`,
    prevRange,
    allSales,
    productsById,
    allExpenses,
    allAdvances,
  );

  const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / Math.abs(b)) * 100);

  res.json({
    current,
    previous,
    deltas: {
      revenue: pct(current.revenue, previous.revenue),
      grossProfit: pct(current.grossProfit, previous.grossProfit),
      netProfit: pct(current.netProfit, previous.netProfit),
      salesCount: pct(current.salesCount, previous.salesCount),
      expenses: pct(current.expenses, previous.expenses),
      avgTicket: pct(current.avgTicket, previous.avgTicket),
    },
  });
});

router.get("/analytics/yearly-overview", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const now = new Date();
  const year = req.query.year ? parseInt(String(req.query.year)) : now.getFullYear();

  const [allSales, productList, allExpenses] = await Promise.all([
    salesCache.all(),
    productsCacheApi.all(),
    expensesCache.all(),
  ]);
  const productsById = new Map<number, any>();
  for (const { id, raw } of productList) productsById.set(id, raw);

  const months: any[] = [];
  for (let m = 0; m < 12; m++) {
    const range = monthRange(year, m);
    const periodSales = allSales
      .map((s) => ({ ...s.data, _date: tsToDate(s.data.createdAt) }))
      .filter((s) => s._date >= range.start && s._date < range.end);

    let revenue = 0;
    let grossProfit = 0;
    for (const sale of periodSales) {
      revenue += parseFloat(sale.total ?? "0");
      for (const item of (sale.items as any[]) ?? []) {
        const product = productsById.get(item.productId);
        const unitCost = product
          ? (product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice))
          : 0;
        grossProfit += (item.price - unitCost) * item.quantity;
      }
      grossProfit -= parseFloat(sale.discount ?? "0");
    }

    const mKey = monthKey(range.start);
    const monthExpenses = allExpenses
      .map((e) => e.data)
      .filter((e) => e.month === mKey)
      .reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);

    months.push({
      month: m + 1,
      label: ["جان", "فيف", "مار", "أفر", "ماي", "جوان", "جويل", "أوت", "سبت", "أكت", "نوف", "ديس"][m],
      revenue,
      grossProfit,
      expenses: monthExpenses,
      netProfit: grossProfit - monthExpenses,
      salesCount: periodSales.length,
    });
  }

  const totals = months.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      grossProfit: acc.grossProfit + m.grossProfit,
      expenses: acc.expenses + m.expenses,
      netProfit: acc.netProfit + m.netProfit,
      salesCount: acc.salesCount + m.salesCount,
    }),
    { revenue: 0, grossProfit: 0, expenses: 0, netProfit: 0, salesCount: 0 },
  );

  res.json({ year, months, totals });
});

export default router;
