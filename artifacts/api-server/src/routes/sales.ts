import { Router, type IRouter } from "express";
import { db, salesTable, productsTable, customersTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateSaleBody, ListSalesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const toSale = (s: typeof salesTable.$inferSelect) => ({
  ...s,
  subtotal: parseFloat(s.subtotal),
  discount: parseFloat(s.discount),
  total: parseFloat(s.total),
  items: s.items as any[],
});

router.get("/sales", async (req, res): Promise<void> => {
  const params = ListSalesQueryParams.safeParse(req.query);
  let sales = await db.select().from(salesTable).orderBy(sql`${salesTable.createdAt} desc`);

  if (params.success) {
    if (params.data.cashierId) {
      sales = sales.filter((s) => s.cashierId === params.data.cashierId);
    }
    if (params.data.customerId) {
      sales = sales.filter((s) => s.customerId === params.data.customerId);
    }
    if (params.data.from) {
      const from = new Date(params.data.from as string);
      sales = sales.filter((s) => new Date(s.createdAt) >= from);
    }
    if (params.data.to) {
      const to = new Date(params.data.to as string);
      sales = sales.filter((s) => new Date(s.createdAt) <= to);
    }
  }

  res.json(sales.map(toSale));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Build sale items with prices
  const saleItems: any[] = [];
  let subtotal = 0;

  for (const item of parsed.data.items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(400).json({ error: `المنتج ${item.productId} غير موجود` });
      return;
    }
    const price = parseFloat(product.retailPrice);
    const qty = item.quantity;
    const lineTotal = price * qty;
    subtotal += lineTotal;
    saleItems.push({
      productId: product.id,
      productName: product.name,
      price,
      quantity: qty,
      unit: item.unit,
      subtotal: lineTotal,
    });

    // Update stock
    await db
      .update(productsTable)
      .set({ stock: product.stock - Math.floor(qty) })
      .where(eq(productsTable.id, product.id));
  }

  const discount = parsed.data.discount ?? 0;
  const total = Math.max(0, subtotal - discount);

  // Get cashier name
  let cashierName = "قابض";
  const [cashierUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.cashierId));
  if (cashierUser) cashierName = cashierUser.name;

  let customerName: string | null = null;

  if (parsed.data.customerId) {
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, parsed.data.customerId));
    if (customer) {
      customerName = customer.name;
      if (parsed.data.paymentMethod === "karni") {
        const currentDebt = parseFloat(customer.totalDebt);
        const creditLimit = parseFloat(customer.creditLimit);
        if (currentDebt + total > creditLimit) {
          res.status(400).json({ error: "تجاوز حد الدين المسموح به للزبون" });
          return;
        }
        await db
          .update(customersTable)
          .set({ totalDebt: (currentDebt + total).toString() })
          .where(eq(customersTable.id, customer.id));
      }
    }
  }

  const [sale] = await db
    .insert(salesTable)
    .values({
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
    })
    .returning();

  res.status(201).json(toSale(sale));
});

router.get("/sales/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) {
    res.status(404).json({ error: "Sale not found" });
    return;
  }
  res.json(toSale(sale));
});

export default router;
