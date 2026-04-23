import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

// JSON error handler — converts thrown errors (incl. Firestore quota errors) into Arabic JSON
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const msg = String(err?.message ?? err ?? "");
  const isQuota = err?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg);
  const status = isQuota ? 503 : err?.status ?? err?.statusCode ?? 500;
  const userMessage = isQuota
    ? "تم تجاوز حصة Firebase اليومية. الخدمة غير متاحة مؤقتاً، حاول مجدداً لاحقاً."
    : "حدث خطأ في الخادم، يرجى المحاولة مرة أخرى.";
  if (req.log) req.log.error({ err, url: req.url }, "request failed");
  if (!res.headersSent) {
    res.status(status).json({ error: userMessage, code: isQuota ? "QUOTA_EXCEEDED" : "INTERNAL" });
  }
});

export default app;
