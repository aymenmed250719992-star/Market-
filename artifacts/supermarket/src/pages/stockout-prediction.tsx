import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, RefreshCw, PackageX, AlertTriangle, ArrowDown, Clock } from "lucide-react";

type Prediction = {
  productId: number;
  productName: string;
  category: string;
  shelfStock: number;
  warehouseStock: number;
  totalStock: number;
  qtySoldRecent: number;
  velocityPerDay: number;
  daysUntilStockout: number | null;
  daysUntilShelfEmpty: number | null;
  lastSaleDays: number | null;
  suggestedReorderQty: number;
  suggestedRestockShelf: number;
  status: "out_of_stock" | "critical" | "warning" | "low" | "ok" | "no_movement";
  severity: number;
};

type Response = {
  generatedAt: string;
  lookbackDays: number;
  horizonDays: number;
  counts: {
    out_of_stock: number;
    critical: number;
    warning: number;
    low: number;
    needs_shelf_restock: number;
  };
  predictions: Prediction[];
};

const statusStyle: Record<string, string> = {
  out_of_stock: "bg-red-600/15 text-red-500 border-red-500/40",
  critical: "bg-red-500/15 text-red-500 border-red-500/40",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  low: "bg-yellow-500/15 text-yellow-600 border-yellow-500/40",
  no_movement: "bg-muted text-muted-foreground border-border",
  ok: "bg-green-500/15 text-green-500 border-green-500/40",
};

const statusLabel: Record<string, string> = {
  out_of_stock: "نفذ كلياً",
  critical: "حرج",
  warning: "تحذير",
  low: "منخفض",
  no_movement: "بدون حركة",
  ok: "جيد",
};

export default function StockoutPredictionPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "out_of_stock" | "critical" | "warning" | "low" | "shelf">("all");
  const [creating, setCreating] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stockout-prediction", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!user || !["admin", "buyer"].includes(user.role)) {
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للأدمن والمشتري فقط</div>;
  }

  const createRestockTask = async (p: Prediction) => {
    setCreating(p.productId);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `نقل ${p.suggestedRestockShelf} وحدة من المستودع للرف: ${p.productName}`,
          description: `الرف به ${p.shelfStock} فقط. السرعة ~${p.velocityPerDay} وحدة/يوم. مقترح نقل ${p.suggestedRestockShelf} وحدة لتغطية أسبوع.`,
          type: "restock",
          points: 5,
          productId: p.productId,
          productName: p.productName,
        }),
      });
      if (res.ok) alert("تم إنشاء مهمة النقل بنجاح");
      else alert("تعذّر إنشاء المهمة");
    } finally {
      setCreating(null);
    }
  };

  const filtered = (data?.predictions ?? []).filter((p) => {
    if (filter === "all") return true;
    if (filter === "shelf") return p.suggestedRestockShelf > 0;
    return p.status === filter;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-6 w-6 text-red-500" />
          <h1 className="text-2xl font-bold">توقع نفاد المخزون</h1>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="نفذ كلياً" value={data.counts.out_of_stock} color="text-red-600" icon={<PackageX className="h-4 w-4" />} />
          <StatCard label="حرج (≤3 أيام)" value={data.counts.critical} color="text-red-500" icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="تحذير (≤7 أيام)" value={data.counts.warning} color="text-amber-500" icon={<Clock className="h-4 w-4" />} />
          <StatCard label="منخفض (≤14 يوم)" value={data.counts.low} color="text-yellow-600" icon={<TrendingDown className="h-4 w-4" />} />
          <StatCard label="يحتاج تعبئة رف" value={data.counts.needs_shelf_restock} color="text-blue-500" icon={<ArrowDown className="h-4 w-4" />} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {([
          ["all", "الكل"],
          ["out_of_stock", "نفذ"],
          ["critical", "حرج"],
          ["warning", "تحذير"],
          ["low", "منخفض"],
          ["shelf", "نقل للرف"],
        ] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد منتجات في هذه الفئة. كل شيء جيد.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={p.productId}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${statusStyle[p.status]}`}>
                        {statusLabel[p.status]}
                      </span>
                      {p.daysUntilStockout !== null && p.status !== "out_of_stock" && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted">
                          ينفد خلال ~{p.daysUntilStockout} يوم
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{p.category}</span>
                    </div>
                    <div className="font-bold text-sm truncate">{p.productName}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>📦 رف: <b className="text-foreground">{p.shelfStock}</b></span>
                      <span>🏬 مستودع: <b className="text-foreground">{p.warehouseStock}</b></span>
                      <span>⚡ سرعة: <b className="text-foreground">{p.velocityPerDay}</b>/يوم</span>
                      <span>🛒 مباع: <b className="text-foreground">{p.qtySoldRecent}</b> (30 يوم)</span>
                      {p.daysUntilShelfEmpty !== null && p.daysUntilShelfEmpty <= 3 && p.shelfStock > 0 && (
                        <span className="text-amber-500">رف ينفد خلال ~{p.daysUntilShelfEmpty} يوم</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {p.suggestedReorderQty > 0 && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">اطلب: </span>
                        <b className="text-primary">{p.suggestedReorderQty}</b> وحدة
                      </div>
                    )}
                    {p.suggestedRestockShelf > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createRestockTask(p)}
                        disabled={creating === p.productId}
                        data-testid={`restock-${p.productId}`}
                      >
                        <ArrowDown className="h-3 w-3 ml-1" />
                        مهمة نقل {p.suggestedRestockShelf} للرف
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={color}>{icon}</span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
