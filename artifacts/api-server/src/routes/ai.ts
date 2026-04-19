import { Router, type IRouter } from "express";
import { db, productsTable, tasksTable } from "@workspace/db";
import { z } from "zod";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const AiInventoryQueryBody = z.object({
  question: z.string().min(1),
  createTaskIfNeeded: z.boolean().optional().default(false),
  requesterId: z.number().int().optional(),
  requesterName: z.string().optional(),
});

function formatProduct(product: typeof productsTable.$inferSelect): string {
  const shelfStock = product.shelfStock ?? 0;
  const warehouseStock = product.warehouseStock ?? 0;
  const lowShelf = product.lowStockThreshold ?? 5;
  const lowWarehouse = product.lowWarehouseThreshold ?? 2;
  const notes: string[] = [];

  if (shelfStock === 0) notes.push("نفد من الرف");
  else if (shelfStock <= lowShelf) notes.push("مخزون الرف منخفض");

  if (warehouseStock === 0) notes.push("المستودع فارغ");
  else if (warehouseStock <= lowWarehouse) notes.push("مخزون المستودع منخفض");

  if (product.expiryDate) {
    const expiryDate = new Date(product.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
      notes.push(`ينتهي خلال ${daysUntilExpiry} يوم`);
    }
  }

  const status = notes.length ? ` — ${notes.join("، ")}` : "";
  return `${product.name}: الرف ${shelfStock}، المستودع ${warehouseStock}، السعر ${parseFloat(product.retailPrice)} دج${status}`;
}

function buildLocalInventoryAnswer(
  question: string,
  products: Array<typeof productsTable.$inferSelect>,
): { answer: string; products: Array<typeof productsTable.$inferSelect> } {
  const normalizedQuestion = question.toLowerCase();
  const asksLowStock =
    normalizedQuestion.includes("قليل") ||
    normalizedQuestion.includes("منخفض") ||
    normalizedQuestion.includes("ناقص") ||
    normalizedQuestion.includes("نفد") ||
    normalizedQuestion.includes("مخزون");
  const asksExpiry =
    normalizedQuestion.includes("انتهاء") ||
    normalizedQuestion.includes("تنتهي") ||
    normalizedQuestion.includes("الصلاحية");

  let selected = products.filter((product) => {
    const lowShelf = product.shelfStock <= (product.lowStockThreshold ?? 5);
    const lowWarehouse = product.warehouseStock <= (product.lowWarehouseThreshold ?? 2);
    const productMentioned =
      normalizedQuestion.includes(product.name.toLowerCase()) ||
      normalizedQuestion.includes(product.category.toLowerCase());

    if (productMentioned) return true;
    if (asksLowStock && (lowShelf || lowWarehouse)) return true;
    if (asksExpiry && product.expiryDate) {
      const expiryDate = new Date(product.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
    }
    return false;
  });

  if (!selected.length && asksLowStock) {
    selected = products
      .filter(
        (product) =>
          product.shelfStock <= (product.lowStockThreshold ?? 5) ||
          product.warehouseStock <= (product.lowWarehouseThreshold ?? 2),
      )
      .slice(0, 5);
  }

  if (!selected.length) {
    selected = products.slice(0, 5);
  }

  const lines = selected.slice(0, 5).map(formatProduct);

  const answer = lines.length
    ? `حسب بيانات المخزون الحالية:\n${lines.map((line) => `- ${line}`).join("\n")}\n\nإذا كان مخزون الرف منخفضًا والمستودع يحتوي بضاعة، أنصح بنقل كراتين إلى الرف قبل طلب شراء جديد.`
    : "لا توجد منتجات مطابقة في المخزون الحالي.";

  return { answer, products: selected.slice(0, 5) };
}

router.post("/ai/inventory-query", async (req, res): Promise<void> => {
  const parsed = AiInventoryQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "سؤال غير صحيح" });
    return;
  }

  const products = await db.select().from(productsTable).orderBy(productsTable.name);

  const inventoryContext = products
    .map(
      (p) =>
        `- ${p.name} (${p.category}): رفوف=${p.shelfStock}/${p.unit}، مستودع=${p.warehouseStock} كرتون، سعر=${parseFloat(p.retailPrice)} دج${
          p.unitsPerCarton ? `، وحدات/كرتون=${p.unitsPerCarton}` : ""
        }${p.expiryDate ? `، انتهاء=${p.expiryDate}` : ""}${
          p.shelfStock === 0 ? " [⚠️ نفذ من الرف]" : p.shelfStock <= (p.lowStockThreshold ?? 5) ? " [⚠️ مخزون رف منخفض]" : ""
        }${p.warehouseStock === 0 ? " [🚫 مستودع فارغ]" : p.warehouseStock <= (p.lowWarehouseThreshold ?? 2) ? " [⚠️ مستودع منخفض]" : ""}`
    )
    .join("\n");

  const systemPrompt = `أنت مساعد ذكاء اصطناعي لسوبرماركت جزائري. أنت تعرف حالة المخزون كاملاً بمستويين: الرفوف (shelf) والمستودع (warehouse).

المخزون الحالي (رفوف + مستودع):
${inventoryContext}

قواعد الإجابة:
- أجب دائماً بالعربية
- كن دقيقاً ومختصراً
- فرّق بين مخزون الرف ومخزون المستودع عند الحاجة
- إذا الرف منخفض لكن المستودع به بضاعة، اقترح نقل كرتون من المستودع
- إذا كلاهما فارغ، اقترح طلب إعادة تخزين من المورد
- اذكر الكميات والأسعار بوضوح (دج)
- نبه لتواريخ الانتهاء القريبة إذا كانت ذات صلة
- إذا أُنشئت مهمة نقل، أعلم المستخدم
- العملة هي الدينار الجزائري (دج)

إذا الرف منخفض والمستودع به كراتين، أضف في نهاية إجابتك:
[ACTION:RESTOCK:product_id:cartons_to_move]
(هذا تنسيق آلي للنظام فقط، لا تشرحه للمستخدم)`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: parsed.data.question },
      ],
    });

    let answer = completion.choices[0]?.message?.content?.trim() ?? "";

    // Parse action tags and create tasks
    const actionMatch = answer.match(/\[ACTION:RESTOCK:(\d+):(\d+)\]/);
    let taskCreated = null;

    if (!answer) {
      const fallback = buildLocalInventoryAnswer(parsed.data.question, products);
      res.json({
        answer: fallback.answer,
        products: fallback.products.map((p) => ({
          ...p,
          wholesalePrice: parseFloat(p.wholesalePrice),
          retailPrice: parseFloat(p.retailPrice),
          unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null,
        })),
        taskCreated: null,
      });
      return;
    }

    if (actionMatch && parsed.data.createTaskIfNeeded) {
      const productId = parseInt(actionMatch[1]);
      const cartonsToMove = parseInt(actionMatch[2]);
      const product = products.find((p) => p.id === productId);

      if (product) {
        const [task] = await db
          .insert(tasksTable)
          .values({
            title: `نقل كرتون من المستودع للرف: ${product.name}`,
            description: `الرف منخفض. يرجى نقل ${cartonsToMove} كرتون من المستودع إلى الرف.`,
            type: "restock",
            status: "pending",
            points: 5,
            productId,
            productName: product.name,
            reportedById: parsed.data.requesterId ?? null,
            reportedByName: parsed.data.requesterName ?? "القابض",
          })
          .returning();
        taskCreated = task;
      }

      // Remove action tag from answer
      answer = answer.replace(/\[ACTION:RESTOCK:\d+:\d+\]/, "").trim();
    } else {
      answer = answer.replace(/\[ACTION:RESTOCK:\d+:\d+\]/, "").trim();
    }

    // Find relevant products mentioned
    const question = parsed.data.question.toLowerCase();
    const relevantProducts = products
      .filter(
        (p) =>
          question.includes(p.name.toLowerCase()) ||
          question.includes(p.category.toLowerCase())
      )
      .slice(0, 5)
      .map((p) => ({
        ...p,
        wholesalePrice: parseFloat(p.wholesalePrice),
        retailPrice: parseFloat(p.retailPrice),
        unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null,
      }));

    res.json({
      answer,
      products: relevantProducts,
      taskCreated,
    });
  } catch (err) {
    req.log.error({ err }, "AI query failed");
    const fallback = buildLocalInventoryAnswer(parsed.data.question, products);
    res.json({
      answer: fallback.answer,
      products: fallback.products.map((p) => ({
        ...p,
        wholesalePrice: parseFloat(p.wholesalePrice),
        retailPrice: parseFloat(p.retailPrice),
        unitWholesalePrice: p.unitWholesalePrice ? parseFloat(p.unitWholesalePrice) : null,
      })),
      taskCreated: null,
    });
  }
});

export default router;
