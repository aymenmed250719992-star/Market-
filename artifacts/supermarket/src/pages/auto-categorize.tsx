import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Play, Loader2 } from "lucide-react";

export default function AutoCategorize() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/auto-categorize/status", { credentials: "include" });
    if (res.ok) setStatus(await res.json());
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  if (user?.role !== "admin") {
    return <div className="text-center py-12 text-muted-foreground">للأدمن فقط</div>;
  }

  const start = async (onlyDefault: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auto-categorize/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyDefault }),
      });
      const j = await res.json();
      if (j.alreadyRunning) toast({ title: "العملية شغّالة بالفعل" });
      else toast({ title: "بدأت العملية", description: `${j.total} منتج للمعالجة` });
      refresh();
    } finally { setBusy(false); }
  };

  const pct = status?.total ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Sparkles className="h-8 w-8" /> تصنيف ذكي للمنتجات
      </h1>
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          المساعد الذكي يصنّف منتجاتك تلقائياً (مشروبات، حليب، تنظيف، ...) بدلاً من "عام".
          تستهلك هذه العملية رصيد المساعد بحدود 1$ لكل 5,000 منتج تقريباً.
        </p>
        {status && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>الحالة:</span>
              <span className={`font-bold ${status.running ? "text-amber-500" : "text-emerald-500"}`}>
                {status.running ? "قيد التشغيل..." : status.finishedAt ? "اكتملت" : "غير مشغّل"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>المعالج:</span>
              <span className="font-bold">{status.processed} / {status.total}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>المحدّثة:</span>
              <span className="font-bold text-emerald-500">{status.updated}</span>
            </div>
            <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            {status.lastError && (
              <div className="text-rose-500 text-xs">آخر خطأ: {status.lastError}</div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => start(true)} disabled={busy || status?.running} data-testid="button-start-default">
            {busy || status?.running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
            تصنيف منتجات "عام" فقط
          </Button>
          <Button variant="outline" onClick={() => start(false)} disabled={busy || status?.running}>
            إعادة تصنيف الكل
          </Button>
        </div>
      </div>
    </div>
  );
}
