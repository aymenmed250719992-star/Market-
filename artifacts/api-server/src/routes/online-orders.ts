import { Router, type IRouter } from "express";
import { db, customersTable, onlineOrdersTable, productsTable, salesTable, usersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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

const toOrder = (order: typeof onlineOrdersTable.$inferSelect) => ({
  ...order,
  subtotal: parseFloat(order.subtotal),
  deliveryFee: parseFloat(order.deliveryFee),
  total: parseFloat(order.total),
});

router.get("/online-orders", async (_req, res): Promise<void> => {
  const orders = await db.select().from(onlineOrdersTable).orderBy(desc(onlineOrdersTable.createdAt));
  res.json(orders.map(toOrder));
});

router.get("/online-orders/lookup", async (req, res): Promise<void> => {
  const phone = String(req.query.phone ?? "").trim();
  if (!phone) {
    res.status(400).json({ error: "رقم الهاتف مطلوب" });
    return;
  }

  const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
  const orders = await db.select().from(onlineOrdersTable).where(eq(onlineOrdersTable.phone, phone)).orderBy(desc(onlineOrdersTable.createdAt));
  const sales = customer
    ? await db.select().from(salesTable).where(eq(salesTable.customerId, customer.id)).orderBy(desc(salesTable.createdAt))
    : [];

  res.json({
    customer: customer ? { ...customer, creditLimit: parseFloat(customer.creditLimit), totalDebt: parseFloat(customer.totalDebt) } : null,
    orders: orders.map(toOrder),
    invoices: sales.map((sale) => ({
      ...sale,
      subtotal: parseFloat(sale.subtotal),
      discount: parseFloat(sale.discount),
      total: parseFloat(sale.total),
    })),
  });
});

router.post("/online-orders", async (req, res): Promise<void> => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الطلب غير صحيحة" });
    return;
  }

  const data = parsed.data;
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.phone, data.phone));
  const items = [];
  let subtotal = 0;

  for (const item of data.items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: "يوجد منتج غير متوفر في الطلب" });
      return;
    }
    if (product.stock < item.quantity) {
      res.status(400).json({ error: `الكمية غير كافية من ${product.name}` });
      return;
    }
    const price = parseFloat(product.retailPrice);
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;
    items.push({
      productId: product.id,
      productName: product.name,
      price,
      quantity: item.quantity,
      subtotal: lineTotal,
    });
  }

  const deliveryFee = data.paymentMethod === "store_pickup" ? 0 : 200;
  const total = subtotal + deliveryFee;

  const [order] = await db.insert(onlineOrdersTable).values({
    customerId: customer?.id ?? null,
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
  }).returning();

  res.status(201).json(toOrder(order));
});

router.patch("/online-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = updateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات التحديث غير صحيحة" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  if (parsed.data.assignedDistributorId !== undefined) {
    updates.assignedDistributorId = parsed.data.assignedDistributorId;
    updates.assignedDistributorName = null;
    if (parsed.data.assignedDistributorId) {
      const [distributor] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.assignedDistributorId));
      if (distributor) updates.assignedDistributorName = distributor.name;
    }
  }

  const [order] = await db.update(onlineOrdersTable).set(updates).where(eq(onlineOrdersTable.id, id)).returning();
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  res.json(toOrder(order));
});

export default router;