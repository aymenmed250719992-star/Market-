import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { firestore } from "../lib/firebase";
import { productsCacheApi } from "./products";
import { getRequestUser } from "../lib/audit";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "dummy",
});

const ALLOWED_CATEGORIES = [
  "مشروبات", "حليب ومشتقاته", "حلويات وسكاكر", "بسكويت ومعجنات",
  "زيوت ودهون", "معلبات", "حبوب وأرز ومعكرونة", "توابل ومعقدات",
  "تنظيف منزلي", "نظافة شخصية", "ورقيات", "أطفال وحفاظات",
  "مياه", "شاي وقهوة", "مجمدات", "خضر وفواكه", "لحوم ودجاج",
  "خبز ومخبوزات", "صلصات ومخللات", "وجبات سريعة", "إكسسوارات", "أخرى",
];

const Status: { running: boolean; processed: number; updated: number; total: number; lastError?: string; finishedAt?: string } = {
  running: false, processed: 0, updated: 0, total: 0,
};

router.get("/auto-categorize/status", async (_req, res): Promise<void> => {
  res.json(Status);
});

router.post("/auto-categorize/start", async (req, res): Promise<void> => {
  const user = await getRequestUser(req);
  if (!user || user.data.role !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  if (Status.running) {
    res.json({ alreadyRunning: true, ...Status });
    return;
  }

  const onlyDefault = req.body?.onlyDefault !== false;
  const all = await productsCacheApi.all();
  const targets = all
    .map(({ raw: p }: any) => p)
    .filter((p: any) => !onlyDefault || !p.category || p.category === "عام" || p.category.trim() === "");

  Status.running = true;
  Status.processed = 0;
  Status.updated = 0;
  Status.total = targets.length;
  Status.lastError = undefined;
  Status.finishedAt = undefined;

  // Run in the background — chunks of 30 names per AI call
  (async () => {
    const CHUNK = 30;
    try {
      for (let i = 0; i < targets.length; i += CHUNK) {
        const batch = targets.slice(i, i + CHUNK);
        const list = batch.map((p: any, idx: number) => `${idx + 1}. ${p.name}`).join("\n");
        const sys = `أنت خبير في تصنيف منتجات السوبرماركت. لكل منتج اختر تصنيفاً واحداً فقط من القائمة:\n${ALLOWED_CATEGORIES.join("، ")}\nأجب فقط بـJSON من الشكل: {"results":[{"i":1,"c":"تصنيف"},...]} بدون أي شرح.`;
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.AI_MODEL ?? "gpt-5-mini",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: list },
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 1500,
          });
          const txt = completion.choices[0]?.message?.content?.trim() ?? "{}";
          const parsed = JSON.parse(txt);
          const results: { i: number; c: string }[] = parsed.results ?? [];
          for (const r of results) {
            const idx = (r.i ?? 0) - 1;
            const product = batch[idx];
            if (!product || !ALLOWED_CATEGORIES.includes(r.c)) continue;
            try {
              await firestore.collection("products").doc(String(product.id)).update({
                category: r.c, updatedAt: new Date(),
              });
              Status.updated++;
            } catch { /* ignore */ }
          }
        } catch (err: any) {
          Status.lastError = err?.message ?? String(err);
        }
        Status.processed = Math.min(i + CHUNK, targets.length);
      }
    } finally {
      Status.running = false;
      Status.finishedAt = new Date().toISOString();
    }
  })().catch(() => { Status.running = false; });

  res.json({ started: true, total: Status.total });
});

export default router;
