import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Tag, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Suggestion = {
  productId: number;
  productName: string;
  category: string;
  currentPrice: number;
  suggestedPrice: number;
  changePct: number;
  reason: string;
  type: "increase" | "decrease" | "clearance" | "review";
  priority: "high" | "medium" | "low";
  qtySold30d: number;
  marginPct: number;
  stockTotal: number;
};

type Response = {
  generatedAt: string;
  periodDays: number;
  totalProducts: number;
  productsWithSales: number;
  suggestions: Suggestion[];
};

const priorityStyle: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

const priorityLabel: Record<string, string> = {
  high: "أولوية عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

const typeLabel: Record<string, string> = {
  increase: "رفع سعر",
  decrease: "تخفيض",
  clearance: "تصفية",
  review: "مراجعة",
};

export default function PriceSuggestionsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/price-suggestions", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!user || user.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للأدمن فقط</div>;
  }

  const openApply = (s: Suggestion) => {
    setEditing(s);
    setEditPrice(String(s.suggestedPrice));
  };

  const applyPrice = async () => {
    if (!editing) return;
    const price = parseFloat(editPrice);
    if (!(price > 0)) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/products/${editing.productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ retailPrice: String(price) }),
      });
      if (res.ok) {
        setDismissed((prev) => new Set(prev).add(editing.productId));
        setEditing(null);
      } else {
        alert("تعذّر تحديث السعر");
      }
    } finally {
      setApplying(false);
    }
  };

  const filtered = (data?.suggestions ?? [])
    .filter((s) => !dismissed.has(s.productId))
    .filter((s) => filter === "all" || s.priority === filter);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold">اقتراحات الأسعار الذكية</h1>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="إجمالي اقتراحات" value={String(data.suggestions.length)} />
          <StatCard label="منتجات بمبيعات (30 يوم)" value={String(data.productsWithSales)} />
          <StatCard label="مجموع المنتجات" value={String(data.totalProducts)} />
          <StatCard label="فترة التحليل" value={`${data.periodDays} يوم`} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "high", "medium", "low"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === "all" ? "الكل" : priorityLabel[f]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Check className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <div className="font-bold">لا توجد اقتراحات حالياً</div>
            <div className="text-sm mt-1">أسعارك متوازنة مع حركة المبيعات والمخزون.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.productId} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${priorityStyle[s.priority]}`}>
                        {priorityLabel[s.priority]}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-muted">{typeLabel[s.type]}</span>
                      <span className="text-[10px] text-muted-foreground">{s.category}</span>
                    </div>
                    <div className="font-bold text-base truncate">{s.productName}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.reason}</div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">الحالي</div>
                      <div className="font-bold text-sm">{s.currentPrice.toLocaleString("en-US")}</div>
                    </div>
                    <div className="text-2xl text-muted-foreground">←</div>
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">المقترح</div>
                      <div className={`font-bold text-base ${s.suggestedPrice > s.currentPrice ? "text-green-500" : "text-blue-500"}`}>
                        {s.suggestedPrice.toLocaleString("en-US")}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-bold ${s.changePct >= 0 ? "text-green-500" : "text-blue-500"}`}>
                      {s.changePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 gap-2 flex-wrap">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                    <span>📦 المخزون: <b className="text-foreground">{s.stockTotal}</b></span>
                    <span>🛒 مباع/شهر: <b className="text-foreground">{s.qtySold30d}</b></span>
                    <span>💹 الهامش: <b className="text-foreground">{s.marginPct.toFixed(1)}%</b></span>
                    {s.priority === "high" && (
                      <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle className="h-3 w-3" /> عاجل</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDismissed((prev) => new Set(prev).add(s.productId))}
                      data-testid={`dismiss-${s.productId}`}
                    >
                      <X className="h-3 w-3 ml-1" />
                      تجاهل
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openApply(s)}
                      data-testid={`apply-${s.productId}`}
                    >
                      <Tag className="h-3 w-3 ml-1" />
                      تطبيق
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تطبيق سعر جديد — {editing?.productName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{editing?.reason}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">السعر الحالي</Label>
                <div className="font-bold text-lg">{editing?.currentPrice} دج</div>
              </div>
              <div>
                <Label className="text-xs">السعر الجديد</Label>
                <Input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  data-testid="input-new-price"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={applying}>إلغاء</Button>
            <Button onClick={applyPrice} disabled={applying || !(parseFloat(editPrice) > 0)} data-testid="confirm-price-change">
              {applying ? "جاري التطبيق..." : "تأكيد التغيير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
