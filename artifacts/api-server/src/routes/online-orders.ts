import { Router, type IRouter } from "express";
import { firestore, nextId, tsToDate } from "../lib/firebase";
import { z } from "zod";

const router: IRouter = Router();

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(4),
  address: z.string().optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash_on_delivery", "karni", "store_pickup"]).default("cash_on_delivery"),
  items: z.array(orderItemSchema).min(1),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "delivering", "completed", "cancelled"]).optional(),
  assignedDistributorId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function toOrder(id: number, data: any) {
  return {
    ...data,
    id,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    subtotal: parseFloat(data.subtotal),
    deliveryFee: parseFloat(data.deliveryFee),
    total: parseFloat(data.total),
  };
}

router.get("/online-orders", async (_req, res): Promise<void> => {
  const snap = await firestore.collection("online_orders").orderBy("createdAt", "desc").get();
  res.json(snap.docs.map((d) => toOrder(parseInt(d.id, 10), d.data())));
});

router.get("/online-orders/lookup", async (req, res): Promise<void> => {
  const phone = String(req.query.phone ?? "").trim();
  if (!phone) {
    res.status(400).json({ error: "رقم الهاتف مطلوب" });
    return;
  }

  const [customerSnap, ordersSnap] = await Promise.all([
    firestore.collection("customers").where("phone", "==", phone).limit(1).get(),
    firestore.collection("online_orders").where("phone", "==", phone).orderBy("createdAt", "desc").get(),
  ]);

  const customer = !customerSnap.empty ? customerSnap.docs[0] : null;
  let invoices: any[] = [];
  if (customer) {
    const salesSnap = await firestore.collection("sales")
      .where("customerId", "==", parseInt(customer.id, 10))
      .orderBy("createdAt", "desc")
      .get();
    invoices = salesSnap.docs.map((d) => {
      const s = d.data();
      return {
        ...s,
        id: parseInt(d.id, 10),
        createdAt: tsToDate(s.createdAt),
        subtotal: parseFloat(s.subtotal),
        discount: parseFloat(s.discount),
        total: parseFloat(s.total),
      };
    });
  }

  res.json({
    customer: customer ? {
      ...customer.data(),
      id: parseInt(customer.id, 10),
      createdAt: tsToDate(customer.data().createdAt),
      updatedAt: tsToDate(customer.data().updatedAt),
      creditLimit: parseFloat(customer.data().creditLimit),
      totalDebt: parseFloat(customer.data().totalDebt),
    } : null,
    orders: ordersSnap.docs.map((d) => toOrder(parseInt(d.id, 10), d.data())),
    invoices,
  });
});

router.post("/online-orders", async (req, res): Promise<void> => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الطلب غير صحيحة" });
    return;
  }

  const data = parsed.data;
  const customerSnap = await firestore.collection("customers").where("phone", "==", data.phone).limit(1).get();
  const customer = !customerSnap.empty ? customerSnap.docs[0] : null;

  const items = [];
  let subtotal = 0;

  for (const item of data.items) {
    const productSnap = await firestore.collection("products").doc(String(item.productId)).get();
    if (!productSnap.exists) {
      res.status(400).json({ error: "يوجد منتج غير متوفر في الطلب" });
      return;
    }
    const product = productSnap.data()!;
    if (product.stock < item.quantity) {
      res.status(400).json({ error: `الكمية غير كافية من ${product.name}` });
      return;
    }
    const price = parseFloat(product.retailPrice);
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;
    items.push({ productId: item.productId, productName: product.name, price, quantity: item.quantity, subtotal: lineTotal });
  }

  const deliveryFee = data.paymentMethod === "store_pickup" ? 0 : 200;
  const total = subtotal + deliveryFee;
  const id = await nextId("online_orders");
  const now = new Date();
  const orderData = {
    customerId: customer ? parseInt(customer.id, 10) : null,
    customerName: data.customerName,
    phone: data.phone,
    address: data.address ?? null,
    notes: data.notes ?? null,
    items,
    subtotal: subtotal.toString(),
    deliveryFee: deliveryFee.toString(),
    total: total.toString(),
    paymentMethod: data.paymentMethod,
    status: "pending",
    assignedDistributorId: null,
    assignedDistributorName: null,
    createdAt: now,
    updatedAt: now,
  };
  await firestore.collection("online_orders").doc(String(id)).set(orderData);
  res.status(201).json(toOrder(id, orderData));
});

router.patch("/online-orders/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = updateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات التحديث غير صحيحة" });
    return;
  }

  const snap = await firestore.collection("online_orders").doc(id).get();
  if (!snap.exists) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  if (parsed.data.assignedDistributorId !== undefined) {
    updates.assignedDistributorId = parsed.data.assignedDistributorId;
    updates.assignedDistributorName = null;
    if (parsed.data.assignedDistributorId) {
      const distSnap = await firestore.collection("users").doc(String(parsed.data.assignedDistributorId)).get();
      if (distSnap.exists) updates.assignedDistributorName = distSnap.data()!.name;
    }
  }

  await firestore.collection("online_orders").doc(id).update(updates);
  const updated = await firestore.collection("online_orders").doc(id).get();
  res.json(toOrder(parseInt(updated.id, 10), updated.data()!));
});

export default router;
