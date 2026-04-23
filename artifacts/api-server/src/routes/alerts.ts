import { Router, type IRouter } from "express";
import { productsCacheApi } from "./products";
import {
  onlineOrdersCache,
  shortagesCache,
  shiftsCache,
  tasksCache,
  customersCache,
} from "../lib/cache";
import { tsToDate } from "../lib/firebase";

const router: IRouter = Router();

router.get("/alerts", async (_req, res): Promise<void> => {
  const all = await productsCacheApi.all();

  // Low stock alerts
  let outOfStock = 0;
  let lowShelf = 0;
  let expiringSoon = 0;
  const now = Date.now();
  const SOON = 30 * 86_400_000;
  for (const { raw: p } of all) {
    const sh = Number(p.shelfStock ?? 0);
    const wh = Number(p.warehouseStock ?? 0);
    const lowTh = Number(p.lowStockThreshold ?? 5);
    if (sh === 0 && wh === 0) outOfStock++;
    else if (sh <= lowTh) lowShelf++;
    if (p.expiryDate) {
      const t = +new Date(p.expiryDate);
      if (t > now && t - now <= SOON) expiringSoon++;
    }
  }

  const orders = await onlineOrdersCache.all();
  const pendingOrders = orders.filter(({ data }: any) => data.status === "pending").length;

  const shorts = await shortagesCache.all();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayShortages = shorts.filter(({ data }: any) =>
    +tsToDate(data.createdAt) >= +todayStart && (data.status ?? "open") === "open").length;

  const shifts = await shiftsCache.all();
  const openShifts = shifts.filter(({ data }: any) => data.status === "open").length;

  const tasks = await tasksCache.all();
  const pendingTasks = tasks.filter(({ data }: any) => data.status === "pending").length;

  const customers = await customersCache.all();
  const debtCustomers = customers.filter(({ data }: any) => Number(data.balance ?? 0) > 0).length;
  const totalDebt = customers.reduce((s, { data }: any) => s + Math.max(0, Number(data.balance ?? 0)), 0);

  const alerts: Array<{ level: "critical" | "warning" | "info"; key: string; message: string; href?: string; count: number }> = [];

  if (outOfStock > 0) alerts.push({ level: "critical", key: "out_of_stock", message: `${outOfStock} منتج نفد كلياً`, href: "/stockout-prediction", count: outOfStock });
  if (lowShelf > 0) alerts.push({ level: "warning", key: "low_shelf", message: `${lowShelf} منتج منخفض على الرف`, href: "/stockout-prediction", count: lowShelf });
  if (expiringSoon > 0) alerts.push({ level: "warning", key: "expiring", message: `${expiringSoon} منتج صلاحيته خلال 30 يوم`, href: "/products", count: expiringSoon });
  if (pendingOrders > 0) alerts.push({ level: "warning", key: "pending_orders", message: `${pendingOrders} طلبية أونلاين تنتظر التحضير`, href: "/online-orders", count: pendingOrders });
  if (todayShortages > 0) alerts.push({ level: "warning", key: "today_shortages", message: `${todayShortages} عجز/تالف مسجّل اليوم`, href: "/shortages", count: todayShortages });
  if (pendingTasks > 0) alerts.push({ level: "info", key: "pending_tasks", message: `${pendingTasks} مهمة قيد الانتظار`, href: "/tasks", count: pendingTasks });
  if (openShifts > 0) alerts.push({ level: "info", key: "open_shifts", message: `${openShifts} وردية مفتوحة الآن`, href: "/shifts", count: openShifts });
  if (debtCustomers > 0) alerts.push({ level: "info", key: "debts", message: `${debtCustomers} زبون عليه دين بإجمالي ${Math.round(totalDebt)} دج`, href: "/customers", count: debtCustomers });

  res.json({
    alerts,
    summary: { outOfStock, lowShelf, expiringSoon, pendingOrders, todayShortages, openShifts, pendingTasks, debtCustomers, totalDebt: Math.round(totalDebt) },
  });
});

export default router;
