import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { salesCache, customersCache, usersCache } from "../lib/cache";
import { CreateSaleBody, ListSalesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function toSale(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    subtotal: parseFloat(data.subtotal),
    discount: parseFloat(data.discount),
    total: parseFloat(data.total),
    items: data.items as any[],
  };
}

router.get("/sales", async (req, res): Promise<void> => {
  const params = ListSalesQueryParams.safeParse(req.query);
  let sales = await salesCache.all();
  sales.sort((a, b) => +tsToDate(b.data.createdAt) - +tsToDate(a.data.createdAt));

  if (params.success) {
    if (params.data.cashierId) sales = sales.filter(({ data }) => data.cashierId === params.data.cashierId);
    if (params.data.customerId) sales = sales.filter(({ data }) => data.customerId === params.data.customerId);
    if (params.data.from) {
      const from = new Date(params.data.from as string);
      sales = sales.filter(({ data }) => tsToDate(data.createdAt) >= from);
    }
    if (params.data.to) {
      const to = new Date(params.data.to as string);
      sales = sales.filter(({ data }) => tsToDate(data.createdAt) <= to);
    }
  }
  res.json(sales.map(({ id, data }) => toSale(id, data)));
});

// Lazy import to avoid circular deps with products router (its cache lives there)
async function getProductsCache() {
  const mod = await import("./products");
  return mod.productsCacheApi;
}

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const productsApi = await getProductsCache();
  const saleItems: any[] = [];
  let subtotal = 0;

  // Validate first, then write — so we don't mutate stock partially.
  const productUpdates: Array<{ id: number; updates: Record<string, any> }> = [];

  for (const item of parsed.data.items) {
    const product = await productsApi.get(item.productId);
    if (!product) {
      res.status(400).json({ error: `المنتج ${item.productId} غير موجود` });
      return;
    }
    const price = parseFloat(product.retailPrice);
    const qty = item.quantity;
    const currentStock = Number(product.stock ?? 0);
    const currentShelfStock = Number(product.shelfStock ?? currentStock);
    if (currentShelfStock < qty || currentStock < qty) {
      res.status(400).json({ error: `الكمية غير كافية من ${product.name}` });
      return;
    }
    const lineTotal = price * qty;
    subtotal += lineTotal;
    saleItems.push({
      productId: item.productId,
      productName: product.name,
      price,
      quantity: qty,
      unit: item.unit,
      subtotal: lineTotal,
    });
    productUpdates.push({
      id: item.productId,
      updates: {
        stock: Math.max(0, currentStock - qty),
        shelfStock: Math.max(0, currentShelfStock - qty),
        updatedAt: new Date(),
      },
    });
  }

  const discount = parsed.data.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  const cashier = await usersCache.get(parsed.data.cashierId);
  const cashierName = cashier?.name ?? "قابض";

  let customerName: string | null = null;
  if (parsed.data.customerId) {
    const customer = await customersCache.get(parsed.data.customerId);
    if (customer) {
      customerName = customer.name;
      if (parsed.data.paymentMethod === "karni") {
        const currentDebt = parseFloat(customer.totalDebt);
        const creditLimit = parseFloat(customer.creditLimit);
        if (currentDebt + total > creditLimit) {
          res.status(400).json({ error: "تجاوز حد الدين المسموح به للزبون" });
          return;
        }
        await customersCache.update(parsed.data.customerId, {
          totalDebt: (currentDebt + total).toString(),
          updatedAt: new Date(),
        });
      }
    }
  }

  // Apply stock changes (now that all validations passed)
  for (const u of productUpdates) {
    await productsApi.update(u.id, u.updates);
  }

  const id = await nextId("sales");
  const now = new Date();
  const data = {
    cashierId: parsed.data.cashierId,
    cashierName,
    customerId: parsed.data.customerId ?? null,
    customerName,
    items: saleItems,
    subtotal: subtotal.toString(),
    discount: discount.toString(),
    total: total.toString(),
    paid: parsed.data.paymentMethod !== "karni",
    paymentMethod: parsed.data.paymentMethod,
    createdAt: now,
  };
  await salesCache.set(id, data);
  res.status(201).json(toSale(id, data));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const idNum = parseInt(req.params.id as string, 10);
  const data = await salesCache.get(idNum);
  if (!data) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.json(toSale(idNum, data));
});

export default router;
// firestore import retained for future use but unused now — silence unused warning by referencing it once.
void firestore;
