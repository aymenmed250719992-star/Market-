import { Router, type IRouter } from "express";
import { tsToDate } from "../lib/firebase";
import { salesCache } from "../lib/cache";
import { productsCacheApi } from "./products";
import { getRequestUser } from "../lib/audit";

const router: IRouter = Router();

interface ProductStats {
  id: number;
  name: string;
  category: string;
  shelfStock: number;
  warehouseStock: number;
  retailPrice: number;
  unitCost: number;
  marginPct: number;
  qtySold30d: number;
  revenue30d: number;
  profit30d: number;
  velocityPerDay: number;
}

router.get("/price-suggestions", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }

  const [allSales, productList] = await Promise.all([
    salesCache.all(),
    productsCacheApi.all(),
  ]);

  const now = Date.now();
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const recentSales = allSales
    .map((s) => s.data)
    .filter((s) => tsToDate(s.createdAt) >= cutoff);

  // Aggregate per product
  const agg = new Map<number, { qty: number; revenue: number; profit: number }>();
  for (const sale of recentSales) {
    for (const item of (sale.items as any[]) ?? []) {
      const row = agg.get(item.productId) ?? { qty: 0, revenue: 0, profit: 0 };
      row.qty += item.quantity;
      row.revenue += item.price * item.quantity;
      agg.set(item.productId, row);
    }
  }

  const products: ProductStats[] = productList.map(({ id, raw }) => {
    const retailPrice = parseFloat(raw.retailPrice ?? "0");
    const unitCost = raw.unitWholesalePrice
      ? parseFloat(raw.unitWholesalePrice)
      : parseFloat(raw.wholesalePrice ?? "0");
    const stat = agg.get(id) ?? { qty: 0, revenue: 0, profit: 0 };
    const profit = stat.revenue - unitCost * stat.qty;
    const marginPct = retailPrice > 0 ? ((retailPrice - unitCost) / retailPrice) * 100 : 0;
    return {
      id,
      name: raw.name,
      category: raw.category ?? "—",
      shelfStock: raw.shelfStock ?? 0,
      warehouseStock: raw.warehouseStock ?? 0,
      retailPrice,
      unitCost,
      marginPct,
      qtySold30d: stat.qty,
      revenue30d: stat.revenue,
      profit30d: profit,
      velocityPerDay: stat.qty / 30,
    };
  });

  type Suggestion = {
    productId: number;
    productName: string;
    category: string;
    currentPrice: number;
    suggestedPrice: number;
    changePct: number;
    reason: string;
    type: "increase" | "decrease" | "clearance" | "review";
    priority: "high" | "medium" | "low";
    qtySold30d: number;
    marginPct: number;
    stockTotal: number;
  };

  const suggestions: Suggestion[] = [];

  for (const p of products) {
    const totalStock = p.shelfStock + p.warehouseStock;
    if (p.retailPrice <= 0 || p.unitCost <= 0) continue;

    // 1) High demand + low margin → suggest price increase
    if (p.qtySold30d >= 20 && p.marginPct < 15) {
      const targetMargin = 25;
      const suggested = Math.round(p.unitCost / (1 - targetMargin / 100));
      if (suggested > p.retailPrice) {
        suggestions.push({
          productId: p.id,
          productName: p.name,
          category: p.category,
          currentPrice: p.retailPrice,
          suggestedPrice: suggested,
          changePct: ((suggested - p.retailPrice) / p.retailPrice) * 100,
          reason: `طلب مرتفع (${p.qtySold30d} وحدة/شهر) لكن هامش ربح منخفض (${p.marginPct.toFixed(1)}%). يمكنك رفع السعر للوصول لهامش 25%.`,
          type: "increase",
          priority: "high",
          qtySold30d: p.qtySold30d,
          marginPct: p.marginPct,
          stockTotal: totalStock,
        });
        continue;
      }
    }

    // 2) Slow mover with overstock → suggest discount/clearance
    if (p.qtySold30d <= 2 && totalStock >= 30) {
      const reduction = totalStock >= 100 ? 0.20 : 0.12;
      const suggested = Math.max(p.unitCost + 5, Math.round(p.retailPrice * (1 - reduction)));
      if (suggested < p.retailPrice) {
        const expiryNote = (raw_p: any) => {
          if (!raw_p.expiryDate) return "";
          const days = Math.ceil((new Date(raw_p.expiryDate).getTime() - now) / 86_400_000);
          if (days <= 60 && days > 0) return ` ⏰ ينتهي خلال ${days} يوم.`;
          return "";
        };
        suggestions.push({
          productId: p.id,
          productName: p.name,
          category: p.category,
          currentPrice: p.retailPrice,
          suggestedPrice: suggested,
          changePct: ((suggested - p.retailPrice) / p.retailPrice) * 100,
          reason: `حركة بطيئة (${p.qtySold30d} وحدة/شهر) مع مخزون كبير (${totalStock}). تخفيض ${(reduction * 100).toFixed(0)}% لتحريك المخزون.${expiryNote(productList.find((x) => x.id === p.id)?.raw)}`,
          type: totalStock >= 100 ? "clearance" : "decrease",
          priority: totalStock >= 100 ? "high" : "medium",
          qtySold30d: p.qtySold30d,
          marginPct: p.marginPct,
          stockTotal: totalStock,
        });
        continue;
      }
    }

    // 3) Selling below cost (loss leader) — alert
    if (p.retailPrice <= p.unitCost) {
      const suggested = Math.round(p.unitCost * 1.15);
      suggestions.push({
        productId: p.id,
        productName: p.name,
        category: p.category,
        currentPrice: p.retailPrice,
        suggestedPrice: suggested,
        changePct: ((suggested - p.retailPrice) / p.retailPrice) * 100,
        reason: `🚨 السعر الحالي (${p.retailPrice} دج) أقل من أو يساوي تكلفة الجملة (${p.unitCost.toFixed(0)} دج). تبيع بخسارة!`,
        type: "increase",
        priority: "high",
        qtySold30d: p.qtySold30d,
        marginPct: p.marginPct,
        stockTotal: totalStock,
      });
      continue;
    }

    // 4) Very high margin but slow → consider slight decrease to boost sales
    if (p.marginPct > 50 && p.qtySold30d < 10 && totalStock > 10) {
      const suggested = Math.round(p.retailPrice * 0.92);
      if (suggested > p.unitCost * 1.15) {
        suggestions.push({
          productId: p.id,
          productName: p.name,
          category: p.category,
          currentPrice: p.retailPrice,
          suggestedPrice: suggested,
          changePct: ((suggested - p.retailPrice) / p.retailPrice) * 100,
          reason: `هامش ربح عالٍ (${p.marginPct.toFixed(1)}%) لكن مبيعات ضعيفة (${p.qtySold30d} وحدة/شهر). تخفيض 8% قد يزيد الإقبال.`,
          type: "decrease",
          priority: "low",
          qtySold30d: p.qtySold30d,
          marginPct: p.marginPct,
          stockTotal: totalStock,
        });
      }
    }
  }

  // Sort: high priority first, then by potential profit impact
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  suggestions.sort((a, b) => {
    const pw = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (pw !== 0) return pw;
    return Math.abs(b.changePct) - Math.abs(a.changePct);
  });

  res.json({
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    totalProducts: products.length,
    productsWithSales: products.filter((p) => p.qtySold30d > 0).length,
    suggestions: suggestions.slice(0, 100),
  });
});

export default router;
