import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
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
  const snap = await firestore.collection("sales").orderBy("createdAt", "desc").get();
  let sales = snap.docs.map((d) => ({ raw: d.data(), id: parseInt(d.id, 10) }));

  if (params.success) {
    if (params.data.cashierId) {
      sales = sales.filter(({ raw }) => raw.cashierId === params.data.cashierId);
    }
    if (params.data.customerId) {
      sales = sales.filter(({ raw }) => raw.customerId === params.data.customerId);
    }
    if (params.data.from) {
      const from = new Date(params.data.from as string);
      sales = sales.filter(({ raw }) => tsToDate(raw.createdAt) >= from);
    }
    if (params.data.to) {
      const to = new Date(params.data.to as string);
      sales = sales.filter(({ raw }) => tsToDate(raw.createdAt) <= to);
    }
  }
  res.json(sales.map(({ raw, id }) => toSale(id, raw)));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const saleItems: any[] = [];
  let subtotal = 0;

  for (const item of parsed.data.items) {
    const productSnap = await firestore.collection("products").doc(String(item.productId)).get();
    if (!productSnap.exists) {
      res.status(400).json({ error: `المنتج ${item.productId} غير موجود` });
      return;
    }
    const product = productSnap.data()!;
    const price = parseFloat(product.retailPrice);
    const qty = item.quantity;
    const lineTotal = price * qty;
    subtotal += lineTotal;
    saleItems.push({
      productId: parseInt(productSnap.id, 10),
      productName: product.name,
      price,
      quantity: qty,
      unit: item.unit,
      subtotal: lineTotal,
    });
    await firestore.collection("products").doc(productSnap.id).update({
      stock: product.stock - Math.floor(qty),
      updatedAt: new Date(),
    });
  }

  const discount = parsed.data.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  let cashierName = "قابض";
  const cashierSnap = await firestore.collection("users").doc(String(parsed.data.cashierId)).get();
  if (cashierSnap.exists) cashierName = cashierSnap.data()!.name;

  let customerName: string | null = null;
  if (parsed.data.customerId) {
    const customerSnap = await firestore.collection("customers").doc(String(parsed.data.customerId)).get();
    if (customerSnap.exists) {
      const customer = customerSnap.data()!;
      customerName = customer.name;
      if (parsed.data.paymentMethod === "karni") {
        const currentDebt = parseFloat(customer.totalDebt);
        const creditLimit = parseFloat(customer.creditLimit);
        if (currentDebt + total > creditLimit) {
          res.status(400).json({ error: "تجاوز حد الدين المسموح به للزبون" });
          return;
        }
        await firestore.collection("customers").doc(String(parsed.data.customerId)).update({
          totalDebt: (currentDebt + total).toString(),
          updatedAt: new Date(),
        });
      }
    }
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
  await firestore.collection("sales").doc(String(id)).set(data);
  res.status(201).json(toSale(id, data));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const snap = await firestore.collection("sales").doc(req.params.id as string).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.json(toSale(parseInt(snap.id, 10), snap.data()!));
});

export default router;
