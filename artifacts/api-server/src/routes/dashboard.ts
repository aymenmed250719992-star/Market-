import { Router, type IRouter } from "express";
import { firestore, tsToDate } from "../lib/firebase";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayDate = today.toISOString().slice(0, 10);
  const currentMonth = todayDate.slice(0, 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [salesSnap, productsSnap, customersSnap, shortagesSnap, expensesSnap, advancesSnap] = await Promise.all([
    firestore.collection("sales").get(),
    firestore.collection("products").get(),
    firestore.collection("customers").get(),
    firestore.collection("shortages").get(),
    firestore.collection("expenses").get(),
    firestore.collection("advances").get(),
  ]);

  const allSales = salesSnap.docs.map((d) => d.data());
  const products = productsSnap.docs.map((d) => ({ ...d.data(), id: parseInt(d.id, 10) }));
  const customers = customersSnap.docs.map((d) => d.data());
  const shortages = shortagesSnap.docs.map((d) => d.data());
  const expenses = expensesSnap.docs.map((d) => d.data());
  const advances = advancesSnap.docs.map((d) => d.data());

  const todaySalesList = allSales.filter((s) => tsToDate(s.createdAt) >= today);
  const monthSalesList = allSales.filter((s) => tsToDate(s.createdAt) >= monthStart);

  const todayRevenue = todaySalesList.reduce((sum, s) => sum + parseFloat(s.total), 0);
  const monthRevenue = monthSalesList.reduce((sum, s) => sum + parseFloat(s.total), 0);

  let monthGrossProfit = 0;
  let monthWholesaleCost = 0;
  for (const sale of monthSalesList) {
    const items = sale.items as any[];
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        const unitCost = product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice);
        monthGrossProfit += (item.price - unitCost) * item.quantity;
        monthWholesaleCost += unitCost * item.quantity;
      }
    }
    monthGrossProfit -= parseFloat(sale.discount);
  }

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthExpenses = expenses.filter((e) => e.month === currentMonth);
  const totalDailyExpenses = monthExpenses.reduce((sum, e) => {
    if (e.type === "one_time") return sum;
    const daily = e.dailyAmount ? parseFloat(e.dailyAmount) : parseFloat(e.amount) / (e.daysInMonth ?? daysInMonth);
    return sum + daily;
  }, 0);
  const monthTotalExpenses = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const monthAdvances = advances.filter((a) => a.month === currentMonth);
  const totalAdvances = monthAdvances.filter((a) => a.type === "advance").reduce((s, a) => s + parseFloat(a.amount), 0);
  const totalPenalties = monthAdvances.filter((a) => a.type === "penalty").reduce((s, a) => s + parseFloat(a.amount), 0);

  const monthNetProfit = monthGrossProfit - monthTotalExpenses - totalAdvances;

  let todayGrossProfit = 0;
  for (const sale of todaySalesList) {
    const items = sale.items as any[];
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        const unitCost = product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice);
        todayGrossProfit += (item.price - unitCost) * item.quantity;
      }
    }
    todayGrossProfit -= parseFloat(sale.discount);
  }
  const todayNetProfit = todayGrossProfit - totalDailyExpenses;
  const totalDebt = customers.reduce((sum, c) => sum + parseFloat(c.totalDebt), 0);

  res.json({
    todaySales: todaySalesList.length,
    todayRevenue,
    todayNetProfit,
    totalProducts: products.length,
    lowStockCount: products.filter((p) => p.shelfStock <= (p.lowStockThreshold ?? 5)).length,
    lowWarehouseCount: products.filter((p) => p.warehouseStock <= (p.lowWarehouseThreshold ?? 2)).length,
    expiringCount: products.filter((p) => p.expiryDate && p.expiryDate >= todayDate && p.expiryDate <= soonDate).length,
    totalDebt,
    pendingShortages: shortages.filter((s) => s.status === "pending").length,
    monthRevenue,
    monthGrossProfit,
    monthNetProfit,
    monthWholesaleCost,
    monthTotalExpenses,
    totalAdvances,
    totalPenalties,
    totalDailyExpenses,
  });
});

router.get("/dashboard/sales-chart", async (_req, res): Promise<void> => {
  const productsSnap = await firestore.collection("products").get();
  const products = productsSnap.docs.map((d) => ({ ...d.data(), id: parseInt(d.id, 10) }));

  const days: Record<string, { revenue: number; profit: number; netProfit: number; count: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toISOString().slice(0, 10)] = { revenue: 0, profit: 0, netProfit: 0, count: 0 };
  }

  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const salesSnap = await firestore.collection("sales").get();
  const recent = salesSnap.docs.map((d) => d.data()).filter((s) => tsToDate(s.createdAt) >= since);

  for (const sale of recent) {
    const key = tsToDate(sale.createdAt).toISOString().slice(0, 10);
    if (days[key]) {
      days[key].revenue += parseFloat(sale.total);
      days[key].count += 1;
      for (const item of sale.items as any[]) {
        const product = products.find((p) => p.id === item.productId);
        if (product) {
          const unitCost = product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice);
          days[key].profit += (item.price - unitCost) * item.quantity;
        }
      }
      days[key].profit -= parseFloat(sale.discount);
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const expensesSnap = await firestore.collection("expenses").get();
  const monthExpenses = expensesSnap.docs.map((d) => d.data()).filter((e) => e.month === currentMonth);
  const totalDailyExpenses = monthExpenses.reduce((sum, e) => {
    if (e.type === "one_time") return sum;
    const daily = e.dailyAmount ? parseFloat(e.dailyAmount) : parseFloat(e.amount) / 30;
    return sum + daily;
  }, 0);

  for (const key of Object.keys(days)) {
    days[key].netProfit = days[key].profit - totalDailyExpenses;
  }

  res.json(Object.entries(days).map(([date, data]) => ({ date, ...data })));
});

router.get("/dashboard/top-products", async (_req, res): Promise<void> => {
  const salesSnap = await firestore.collection("sales").get();
  const totals: Record<number, { productName: string; totalSold: number; revenue: number }> = {};
  for (const doc of salesSnap.docs) {
    const sale = doc.data();
    for (const item of sale.items as any[]) {
      if (!totals[item.productId]) totals[item.productId] = { productName: item.productName, totalSold: 0, revenue: 0 };
      totals[item.productId].totalSold += item.quantity;
      totals[item.productId].revenue += item.subtotal;
    }
  }
  res.json(
    Object.entries(totals)
      .map(([id, data]) => ({ productId: parseInt(id), ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  );
});

router.get("/dashboard/expiring-products", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snap = await firestore.collection("products").get();
  res.json(
    snap.docs
      .filter((d) => { const p = d.data(); return p.expiryDate && p.expiryDate >= today && p.expiryDate <= soonDate; })
      .map((d) => {
        const p = d.data();
        return { ...p, id: parseInt(d.id, 10), wholesalePrice: parseFloat(p.wholesalePrice), retailPrice: parseFloat(p.retailPrice), unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null };
      })
  );
});

router.get("/dashboard/net-profit", async (req, res): Promise<void> => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const [salesSnap, productsSnap, expensesSnap, advancesSnap] = await Promise.all([
    firestore.collection("sales").get(),
    firestore.collection("products").get(),
    firestore.collection("expenses").get(),
    firestore.collection("advances").get(),
  ]);

  const products = productsSnap.docs.map((d) => ({ ...d.data(), id: parseInt(d.id, 10) }));
  const monthStart = new Date(month + "-01");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
  const monthSales = salesSnap.docs.map((d) => d.data()).filter((s) => {
    const d = tsToDate(s.createdAt);
    return d >= monthStart && d <= monthEnd;
  });

  let grossProfit = 0; let revenue = 0; let wholesaleCost = 0;
  for (const sale of monthSales) {
    for (const item of sale.items as any[]) {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        const unitCost = product.unitWholesalePrice ? parseFloat(product.unitWholesalePrice) : parseFloat(product.wholesalePrice);
        wholesaleCost += unitCost * item.quantity;
        revenue += item.price * item.quantity;
      }
    }
    grossProfit = revenue - wholesaleCost - parseFloat(sale.discount);
  }

  const monthExpenses = expensesSnap.docs.map((d) => d.data()).filter((e) => e.month === month);
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const monthAdvances = advancesSnap.docs.map((d) => d.data()).filter((a) => a.month === month && a.type === "advance");
  const totalAdvances = monthAdvances.reduce((sum, a) => sum + parseFloat(a.amount), 0);
  const monthPenalties = advancesSnap.docs.map((d) => d.data()).filter((a) => a.month === month && a.type === "penalty");
  const totalPenalties = monthPenalties.reduce((sum, a) => sum + parseFloat(a.amount), 0);

  res.json({
    month, revenue, wholesaleCost, grossProfit, totalExpenses, totalAdvances, totalPenalties,
    netProfit: grossProfit - totalExpenses - totalAdvances + totalPenalties,
    expenseBreakdown: monthExpenses.map((e) => ({ name: e.name, amount: parseFloat(e.amount) })),
  });
});

export default router;
