import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";

const router: IRouter = Router();

function toProduct(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    wholesalePrice: parseFloat(data.wholesalePrice),
    retailPrice: parseFloat(data.retailPrice),
    unitWholesalePrice: data.unitWholesalePrice != null ? parseFloat(data.unitWholesalePrice) : null,
    profitMargin: data.profitMargin != null ? parseFloat(data.profitMargin) : 15,
  };
}

function calcRetailFromCarton(cartonWholesale: number, unitsPerCarton: number, margin: number) {
  const unitWholesale = cartonWholesale / unitsPerCarton;
  const retail = Math.ceil(unitWholesale * (1 + margin / 100));
  return { unitWholesale, retail };
}

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

router.get("/products", async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { search, category, lowStock, expiringSoon, limit, all } = req.query as Record<string, string | undefined>;
  const hasFilter = !!(search || (category && category !== "all") || lowStock === "true" || expiringSoon === "true");
  const maxLimit = parseInt(limit ?? "50", 10) || 50;

  const snap = await firestore.collection("products").orderBy("name").get();
  let products = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  if (search) {
    const s = search.toLowerCase();
    products = products.filter(({ raw: p }) =>
      p.name.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.includes(s)) ||
      (p.cartonBarcode && p.cartonBarcode.includes(s))
    );
  }
  if (category && category !== "all") products = products.filter(({ raw: p }) => p.category === category);
  if (lowStock === "true") products = products.filter(({ raw: p }) => p.shelfStock <= (p.lowStockThreshold ?? 5));
  if (expiringSoon === "true") {
    products = products.filter(({ raw: p }) => p.expiryDate && p.expiryDate >= today && p.expiryDate <= soonDate);
  }

  // Lightweight default: when no filter is active, only return up to maxLimit products
  // unless explicitly opted-in with `all=true`. This keeps the UI fast for 17k+ catalogs.
  if (!hasFilter && all !== "true") {
    products = products.slice(0, maxLimit);
  } else if (hasFilter) {
    products = products.slice(0, maxLimit * 4); // cap filtered results too
  }

  res.json(products.map(({ raw, id }) => toProduct(id, raw)));
});

router.get("/products/categories", async (_req, res): Promise<void> => {
  const snap = await firestore.collection("products").get();
  const categories = new Set<string>();
  snap.docs.forEach((d) => {
    const c = d.data().category;
    if (c) categories.add(c);
  });
  res.json(Array.from(categories).sort());
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const d = parsed.data;
  let { wholesalePrice, retailPrice, unitWholesalePrice, profitMargin } = d;
  if (d.unitsPerCarton && d.unitsPerCarton > 0) {
    const calc = calcRetailFromCarton(wholesalePrice, d.unitsPerCarton, profitMargin ?? 15);
    unitWholesalePrice = unitWholesalePrice ?? calc.unitWholesale;
    retailPrice = retailPrice ?? calc.retail;
  }
  const id = await nextId("products");
  const now = new Date();
  const data = {
    ...d,
    wholesalePrice: wholesalePrice.toString(),
    retailPrice: retailPrice.toString(),
    unitWholesalePrice: unitWholesalePrice?.toString() ?? null,
    profitMargin: (profitMargin ?? 15).toString(),
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection("products").doc(String(id)).set(data);
  res.status(201).json(toProduct(id, data));
});

router.get("/products/barcode/:barcode", async (req, res): Promise<void> => {
  const barcode = req.params.barcode as string;
  const [byUnit, byCarton] = await Promise.all([
    firestore.collection("products").where("barcode", "==", barcode).limit(1).get(),
    firestore.collection("products").where("cartonBarcode", "==", barcode).limit(1).get(),
  ]);
  const doc = !byUnit.empty ? byUnit.docs[0] : !byCarton.empty ? byCarton.docs[0] : null;
  if (!doc) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const p = doc.data();
  const isCarton = p.cartonBarcode === barcode && p.barcode !== barcode;
  res.json({ ...toProduct(parseInt(doc.id, 10), p), isCartonScan: isCarton });
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const snap = await firestore.collection("products").doc(req.params.id as string).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  res.json(toProduct(parseInt(snap.id, 10), snap.data()!));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const snap = await firestore.collection("products").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const existing = snap.data()!;
  const d = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

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

  const newWholesale = d.wholesalePrice ?? parseFloat(existing.wholesalePrice);
  const newMargin = d.profitMargin ?? parseFloat(existing.profitMargin ?? "15");
  const unitsPerCarton = d.unitsPerCarton ?? existing.unitsPerCarton;

  if (d.wholesalePrice != null || d.profitMargin != null) {
    updates.wholesalePrice = newWholesale.toString();
    updates.profitMargin = newMargin.toString();
    if (unitsPerCarton && unitsPerCarton > 0) {
      const calc = calcRetailFromCarton(newWholesale, unitsPerCarton, newMargin);
      updates.unitWholesalePrice = calc.unitWholesale.toString();
      if (d.retailPrice == null) updates.retailPrice = calc.retail.toString();
    }
  }
  if (d.retailPrice != null) updates.retailPrice = d.retailPrice.toString();
  if (d.unitWholesalePrice != null) updates.unitWholesalePrice = d.unitWholesalePrice.toString();

  await firestore.collection("products").doc(id).update(updates);
  const updated = await firestore.collection("products").doc(id).get();
  res.json(toProduct(parseInt(updated.id, 10), updated.data()!));
});

router.post("/products/:id/restock", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { cartonsToMove } = req.body;
  if (typeof cartonsToMove !== "number" || cartonsToMove <= 0) {
    res.status(400).json({ error: "كمية الكراتين غير صحيحة" });
    return;
  }
  const snap = await firestore.collection("products").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const product = snap.data()!;
  const unitsPerCarton = product.unitsPerCarton ?? product.cartonSize ?? 1;
  if (product.warehouseStock < cartonsToMove) {
    res.status(400).json({ error: "لا يوجد كافة الكراتين في المستودع" });
    return;
  }
  const updates = {
    warehouseStock: product.warehouseStock - cartonsToMove,
    shelfStock: product.shelfStock + cartonsToMove * unitsPerCarton,
    stock: product.stock + cartonsToMove * unitsPerCarton,
    updatedAt: new Date(),
  };
  await firestore.collection("products").doc(id).update(updates);
  const updated = await firestore.collection("products").doc(id).get();
  res.json(toProduct(parseInt(updated.id, 10), updated.data()!));
});

const AddStockBody = z.object({
  quantity: z.number().positive(),
  location: z.enum(["shelf", "warehouse"]).default("shelf"),
  supplier: z.string().optional(),
});

router.post("/products/:id/add-stock", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = AddStockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صحيحة" });
    return;
  }
  const { quantity, location, supplier } = parsed.data;
  const ref = firestore.collection("products").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const p = snap.data()!;
  const currentShelf = Number(p.shelfStock ?? 0);
  const currentWarehouse = Number(p.warehouseStock ?? 0);
  const currentTotal = Number(p.stock ?? currentShelf + currentWarehouse);
  const updates: Record<string, unknown> = {
    stock: currentTotal + quantity,
    shelfStock: location === "shelf" ? currentShelf + quantity : currentShelf,
    warehouseStock: location === "warehouse" ? currentWarehouse + quantity : currentWarehouse,
    updatedAt: new Date(),
  };
  if (supplier && supplier.trim()) updates.supplier = supplier.trim();
  await ref.update(updates);
  const updated = await ref.get();
  res.json(toProduct(parseInt(updated.id, 10), updated.data()!));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const snap = await firestore.collection("products").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  await firestore.collection("products").doc(id).delete();
  res.sendStatus(204);
});

export default router;
