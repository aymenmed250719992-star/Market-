import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const toProduct = (p: typeof productsTable.$inferSelect) => ({
  ...p,
  wholesalePrice: parseFloat(p.wholesalePrice),
  retailPrice: parseFloat(p.retailPrice),
  unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null,
  profitMargin: p.profitMargin ? parseFloat(p.profitMargin) : 15,
});

const CreateProductBody = z.object({
  barcode: z.string().optional(),
  cartonBarcode: z.string().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  wholesalePrice: z.number().positive(),
  unitWholesalePrice: z.number().positive().optional(),
  retailPrice: z.number().positive(),
  profitMargin: z.number().min(0).max(100).default(15),
  stock: z.number().int().min(0).default(0),
  shelfStock: z.number().int().min(0).default(0),
  warehouseStock: z.number().int().min(0).default(0),
  unit: z.enum(["piece", "carton", "kg"]).default("piece"),
  unitsPerCarton: z.number().int().positive().optional(),
  cartonSize: z.number().int().positive().optional(),
  expiryDate: z.string().optional(),
  supplier: z.string().optional(),
  lowStockThreshold: z.number().int().min(0).default(5),
  lowWarehouseThreshold: z.number().int().min(0).default(2),
});

const UpdateProductBody = CreateProductBody.partial();

// Auto-calculate retail price from carton wholesale price + profit margin
function calcRetailFromCarton(cartonWholesale: number, unitsPerCarton: number, margin: number): {
  unitWholesale: number;
  retail: number;
} {
  const unitWholesale = cartonWholesale / unitsPerCarton;
  const retail = Math.ceil(unitWholesale * (1 + margin / 100));
  return { unitWholesale, retail };
}

router.get("/products", async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let products = await db.select().from(productsTable).orderBy(productsTable.name);

  const { search, category, lowStock, expiringSoon } = req.query as Record<string, string | undefined>;

  if (search) {
    const s = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.category.toLowerCase().includes(s) ||
        (p.barcode && p.barcode.includes(s)) ||
        (p.cartonBarcode && p.cartonBarcode.includes(s))
    );
  }
  if (category) products = products.filter((p) => p.category === category);
  if (lowStock === "true") products = products.filter((p) => p.shelfStock <= (p.lowStockThreshold ?? 5));
  if (expiringSoon === "true") {
    products = products.filter(
      (p) => p.expiryDate && p.expiryDate >= today && p.expiryDate <= soonDate
    );
  }

  res.json(products.map(toProduct));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const d = parsed.data;
  let { wholesalePrice, retailPrice, unitWholesalePrice, profitMargin } = d;

  // Auto-calc unit price & retail if carton data provided
  if (d.unitsPerCarton && d.unitsPerCarton > 0) {
    const calc = calcRetailFromCarton(wholesalePrice, d.unitsPerCarton, profitMargin ?? 15);
    unitWholesalePrice = unitWholesalePrice ?? calc.unitWholesale;
    retailPrice = retailPrice ?? calc.retail;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...d,
      wholesalePrice: wholesalePrice.toString(),
      retailPrice: retailPrice.toString(),
      unitWholesalePrice: unitWholesalePrice?.toString() ?? null,
      profitMargin: (profitMargin ?? 15).toString(),
    })
    .returning();
  res.status(201).json(toProduct(product));
});

// Barcode lookup — tries both unit and carton barcode
router.get("/products/barcode/:barcode", async (req, res): Promise<void> => {
  const barcode = Array.isArray(req.params.barcode) ? req.params.barcode[0] : req.params.barcode;
  const products = await db
    .select()
    .from(productsTable)
    .where(or(eq(productsTable.barcode, barcode), eq(productsTable.cartonBarcode, barcode)));

  if (!products.length) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }

  const product = products[0];
  const isCarton = product.cartonBarcode === barcode && product.barcode !== barcode;
  res.json({ ...toProduct(product), isCartonScan: isCarton });
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  res.json(toProduct(product));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};

  // Get existing product to compute auto-pricing
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }

  if (d.name != null) updates.name = d.name;
  if (d.barcode !== undefined) updates.barcode = d.barcode;
  if (d.cartonBarcode !== undefined) updates.cartonBarcode = d.cartonBarcode;
  if (d.category != null) updates.category = d.category;
  if (d.unit != null) updates.unit = d.unit;
  if (d.unitsPerCarton !== undefined) updates.unitsPerCarton = d.unitsPerCarton;
  if (d.cartonSize !== undefined) updates.cartonSize = d.cartonSize;
  if (d.expiryDate !== undefined) updates.expiryDate = d.expiryDate;
  if (d.supplier !== undefined) updates.supplier = d.supplier;
  if (d.stock != null) updates.stock = d.stock;
  if (d.shelfStock != null) updates.shelfStock = d.shelfStock;
  if (d.warehouseStock != null) updates.warehouseStock = d.warehouseStock;
  if (d.lowStockThreshold != null) updates.lowStockThreshold = d.lowStockThreshold;
  if (d.lowWarehouseThreshold != null) updates.lowWarehouseThreshold = d.lowWarehouseThreshold;

  // Smart pricing: if wholesale changes, recalculate retail based on margin
  const newWholesale = d.wholesalePrice ?? parseFloat(existing.wholesalePrice);
  const newMargin = d.profitMargin ?? parseFloat(existing.profitMargin ?? "15");
  const unitsPerCarton = d.unitsPerCarton ?? existing.unitsPerCarton;

  if (d.wholesalePrice != null || d.profitMargin != null) {
    updates.wholesalePrice = newWholesale.toString();
    updates.profitMargin = newMargin.toString();

    if (unitsPerCarton && unitsPerCarton > 0) {
      // Auto-recalculate unit price and retail
      const calc = calcRetailFromCarton(newWholesale, unitsPerCarton, newMargin);
      updates.unitWholesalePrice = calc.unitWholesale.toString();
      // Only auto-update retail if retailPrice not explicitly provided
      if (d.retailPrice == null) {
        updates.retailPrice = calc.retail.toString();
      }
    }
  }

  if (d.retailPrice != null) updates.retailPrice = d.retailPrice.toString();
  if (d.unitWholesalePrice != null) updates.unitWholesalePrice = d.unitWholesalePrice.toString();

  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(eq(productsTable.id, id))
    .returning();

  res.json(toProduct(product));
});

// Move stock from warehouse to shelf (carton transfer)
router.post("/products/:id/restock", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { cartonsToMove } = req.body;

  if (typeof cartonsToMove !== "number" || cartonsToMove <= 0) {
    res.status(400).json({ error: "كمية الكراتين غير صحيحة" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }

  const unitsPerCarton = product.unitsPerCarton ?? product.cartonSize ?? 1;
  if (product.warehouseStock < cartonsToMove) {
    res.status(400).json({ error: "لا يوجد كافة الكراتين في المستودع" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({
      warehouseStock: product.warehouseStock - cartonsToMove,
      shelfStock: product.shelfStock + cartonsToMove * unitsPerCarton,
      stock: product.stock + cartonsToMove * unitsPerCarton,
    })
    .where(eq(productsTable.id, id))
    .returning();

  res.json(toProduct(updated));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning();
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  res.sendStatus(204);
});

export default router;
