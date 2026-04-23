import { Router, type IRouter } from "express";
import { tsToDate } from "../lib/firebase";
import { salesCache } from "../lib/cache";
import { productsCacheApi } from "./products";
import { getRequestUser } from "../lib/audit";

const router: IRouter = Router();

router.get("/stockout-prediction", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || !["admin", "buyer"].includes(user.data.role)) {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const lookbackDays = req.query.days ? parseInt(String(req.query.days)) : 30;
  const horizonDays = req.query.horizon ? parseInt(String(req.query.horizon)) : 14;

  const [allSales, productList] = await Promise.all([
    salesCache.all(),
    productsCacheApi.all(),
  ]);

  const now = Date.now();
  const cutoff = new Date(now - lookbackDays * 24 * 60 * 60 * 1000);
  const recentSales = allSales
    .map((s) => s.data)
    .filter((s) => tsToDate(s.createdAt) >= cutoff);

  // Aggregate qty sold per product, plus daily distribution for trend
  const agg = new Map<number, { qty: number; days: Set<string>; lastSaleDays: number }>();
  for (const sale of recentSales) {
    const date = tsToDate(sale.createdAt);
    const dayKey = date.toISOString().slice(0, 10);
    const daysAgo = Math.floor((now - date.getTime()) / 86_400_000);
    for (const item of (sale.items as any[]) ?? []) {
      const row = agg.get(item.productId) ?? { qty: 0, days: new Set<string>(), lastSaleDays: 999 };
      row.qty += item.quantity;
      row.days.add(dayKey);
      if (daysAgo < row.lastSaleDays) row.lastSaleDays = daysAgo;
      agg.set(item.productId, row);
    }
  }

  type Prediction = {
    productId: number;
    productName: string;
    category: string;
    shelfStock: number;
    warehouseStock: number;
    totalStock: number;
    qtySoldRecent: number;
    activeDays: number;
    velocityPerDay: number;
    daysUntilStockout: number | null;
    daysUntilShelfEmpty: number | null;
    lastSaleDays: number | null;
    suggestedReorderQty: number;
    suggestedRestockShelf: number;
    status: "out_of_stock" | "critical" | "warning" | "low" | "ok" | "no_movement";
    severity: number;
  };

  const predictions: Prediction[] = [];

  for (const { id, raw } of productList) {
    const shelfStock = raw.shelfStock ?? 0;
    const warehouseStock = raw.warehouseStock ?? 0;
    const totalStock = shelfStock + warehouseStock;
    const stat = agg.get(id);
    const qty = stat?.qty ?? 0;
    const activeDays = stat?.days.size ?? 0;
    const lastSaleDays = stat ? stat.lastSaleDays : null;
    const velocity = qty / lookbackDays;

    const daysUntilStockout = velocity > 0 ? Math.floor(totalStock / velocity) : null;
    const daysUntilShelfEmpty = velocity > 0 ? Math.floor(shelfStock / velocity) : null;

    let status: Prediction["status"] = "ok";
    let severity = 0;
    if (totalStock === 0) { status = "out_of_stock"; severity = 100; }
    else if (velocity === 0) { status = "no_movement"; severity = 0; }
    else if (daysUntilStockout !== null && daysUntilStockout <= 3) { status = "critical"; severity = 90 - daysUntilStockout; }
    else if (daysUntilStockout !== null && daysUntilStockout <= 7) { status = "warning"; severity = 70 - daysUntilStockout; }
    else if (daysUntilStockout !== null && daysUntilStockout <= horizonDays) { status = "low"; severity = 50 - daysUntilStockout; }

    // Suggest reorder = enough stock for 30 days + safety buffer (1 week of velocity)
    const targetDays = 30;
    const safetyDays = 7;
    const suggestedReorderQty = velocity > 0
      ? Math.max(0, Math.ceil(velocity * (targetDays + safetyDays)) - totalStock)
      : 0;

    // Suggest move to shelf if shelf low but warehouse has stock
    const lowShelfThreshold = raw.lowStockThreshold ?? 5;
    const suggestedRestockShelf = (shelfStock <= lowShelfThreshold && warehouseStock > 0)
      ? Math.min(warehouseStock, Math.max(lowShelfThreshold * 3, Math.ceil(velocity * 7)))
      : 0;

    if (status !== "ok" || suggestedRestockShelf > 0) {
      predictions.push({
        productId: id,
        productName: raw.name,
        category: raw.category ?? "—",
        shelfStock,
        warehouseStock,
        totalStock,
        qtySoldRecent: qty,
        activeDays,
        velocityPerDay: parseFloat(velocity.toFixed(2)),
        daysUntilStockout,
        daysUntilShelfEmpty,
        lastSaleDays,
        suggestedReorderQty,
        suggestedRestockShelf,
        status,
        severity,
      });
    }
  }

  predictions.sort((a, b) => b.severity - a.severity);

  const counts = {
    out_of_stock: predictions.filter((p) => p.status === "out_of_stock").length,
    critical: predictions.filter((p) => p.status === "critical").length,
    warning: predictions.filter((p) => p.status === "warning").length,
    low: predictions.filter((p) => p.status === "low").length,
    needs_shelf_restock: predictions.filter((p) => p.suggestedRestockShelf > 0).length,
  };

  res.json({
    generatedAt: new Date().toISOString(),
    lookbackDays,
    horizonDays,
    counts,
    predictions: predictions.slice(0, 200),
  });
});

export default router;
