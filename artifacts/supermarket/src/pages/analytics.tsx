import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, BarChart3, ArrowRight, ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type PeriodStats = {
  label: string;
  monthKey: string;
  salesCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  discount: number;
  expenses: number;
  advances: number;
  netProfit: number;
  avgTicket: number;
  topProducts: { id: number; name: string; qty: number; revenue: number; profit: number }[];
  dailyRevenue: { day: string; revenue: number; profit: number }[];
};

type ComparisonData = {
  current: PeriodStats;
  previous: PeriodStats;
  deltas: Record<string, number>;
};

type YearlyData = {
  year: number;
  months: { month: number; label: string; revenue: number; grossProfit: number; expenses: number; netProfit: number; salesCount: number }[];
  totals: { revenue: number; grossProfit: number; expenses: number; netProfit: number; salesCount: number };
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const monthNames = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [yearly, setYearly] = useState<YearlyData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, yRes] = await Promise.all([
        fetch(`/api/analytics/monthly-comparison?year=${year}&month=${month}`, { credentials: "include" }),
        fetch(`/api/analytics/yearly-overview?year=${year}`, { credentials: "include" }),
      ]);
      if (cRes.ok) setComparison(await cRes.json());
      if (yRes.ok) setYearly(await yRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  if (!user || user.role !== "admin") {
    return <div className="p-6 text-center text-muted-foreground">هذه الصفحة للأدمن فقط</div>;
  }

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const Delta = ({ value }: { value: number }) => {
    const positive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold ${positive ? "text-green-500" : "text-red-500"}`}>
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {positive ? "+" : ""}{value.toFixed(1)}%
      </span>
    );
  };

  const dailyChartData = comparison
    ? comparison.current.dailyRevenue.map((d, i) => ({
        day: d.day,
        "هذا الشهر": Math.round(d.revenue),
        "الشهر السابق": comparison.previous.dailyRevenue[i] ? Math.round(comparison.previous.dailyRevenue[i].revenue) : 0,
      }))
    : [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">تحليلات المبيعات الذكية</h1>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-2 py-1">
          <Button variant="ghost" size="sm" onClick={goPrev} data-testid="button-prev-month">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="font-bold min-w-[140px] text-center" data-testid="text-current-period">
            {monthNames[month - 1]} {year}
          </span>
          <Button variant="ghost" size="sm" onClick={goNext} data-testid="button-next-month">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !comparison ? (
        <div className="text-center text-muted-foreground p-8">تعذّر تحميل البيانات</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="الإيرادات"
              value={fmt(comparison.current.revenue)}
              prev={fmt(comparison.previous.revenue)}
              delta={comparison.deltas.revenue}
              accent="text-blue-500"
            />
            <KpiCard
              title="الربح الإجمالي"
              value={fmt(comparison.current.grossProfit)}
              prev={fmt(comparison.previous.grossProfit)}
              delta={comparison.deltas.grossProfit}
              accent="text-emerald-500"
            />
            <KpiCard
              title="صافي الربح"
              value={fmt(comparison.current.netProfit)}
              prev={fmt(comparison.previous.netProfit)}
              delta={comparison.deltas.netProfit}
              accent={comparison.current.netProfit >= 0 ? "text-green-500" : "text-red-500"}
            />
            <KpiCard
              title="عدد المبيعات"
              value={fmt(comparison.current.salesCount)}
              prev={fmt(comparison.previous.salesCount)}
              delta={comparison.deltas.salesCount}
              accent="text-amber-500"
              currency=""
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">متوسط الفاتورة</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{fmt(comparison.current.avgTicket)} دج</div>
                <div className="text-xs text-muted-foreground mt-1">سابقاً: {fmt(comparison.previous.avgTicket)} دج</div>
                <div className="mt-1"><Delta value={comparison.deltas.avgTicket} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">تكلفة البضاعة</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{fmt(comparison.current.cost)} دج</div>
                <div className="text-xs text-muted-foreground mt-1">خصومات: {fmt(comparison.current.discount)} دج</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">المصاريف + السلف</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{fmt(comparison.current.expenses + comparison.current.advances)} دج</div>
                <div className="text-xs text-muted-foreground mt-1">سابقاً: {fmt(comparison.previous.expenses + comparison.previous.advances)} دج</div>
                <div className="mt-1"><Delta value={comparison.deltas.expenses} /></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإيرادات اليومية: {monthNames[month - 1]} مقابل الشهر السابق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-64">
                <ResponsiveContainer>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString("en-US")} دج`} />
                    <Legend />
                    <Line type="monotone" dataKey="هذا الشهر" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="الشهر السابق" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">أعلى 10 منتجات في {monthNames[month - 1]}</CardTitle>
            </CardHeader>
            <CardContent>
              {comparison.current.topProducts.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">لا توجد مبيعات في هذا الشهر</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-right py-2">المنتج</th>
                        <th className="text-right py-2">الكمية</th>
                        <th className="text-right py-2">الإيراد</th>
                        <th className="text-right py-2">الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.current.topProducts.map((p) => (
                        <tr key={p.id} className="border-b border-border/40">
                          <td className="py-2 font-medium">{p.name}</td>
                          <td className="py-2">{p.qty}</td>
                          <td className="py-2">{fmt(p.revenue)} دج</td>
                          <td className={`py-2 font-bold ${p.profit >= 0 ? "text-green-500" : "text-red-500"}`}>{fmt(p.profit)} دج</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {yearly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">نظرة سنوية {yearly.year} — الإيراد، الربح، المصاريف</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <SummaryBox label="إيراد سنوي" value={fmt(yearly.totals.revenue)} suffix="دج" color="text-blue-500" />
                  <SummaryBox label="ربح إجمالي" value={fmt(yearly.totals.grossProfit)} suffix="دج" color="text-emerald-500" />
                  <SummaryBox label="مصاريف سنوية" value={fmt(yearly.totals.expenses)} suffix="دج" color="text-orange-500" />
                  <SummaryBox label="صافي الربح" value={fmt(yearly.totals.netProfit)} suffix="دج" color={yearly.totals.netProfit >= 0 ? "text-green-500" : "text-red-500"} />
                </div>
                <div className="w-full h-72">
                  <ResponsiveContainer>
                    <BarChart data={yearly.months}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${v.toLocaleString("en-US")} دج`} />
                      <Legend />
                      <Bar dataKey="revenue" name="الإيراد" fill="#3b82f6" />
                      <Bar dataKey="grossProfit" name="الربح" fill="#10b981" />
                      <Bar dataKey="expenses" name="المصاريف" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  prev,
  delta,
  accent,
  currency = "دج",
}: {
  title: string;
  value: string;
  prev: string;
  delta: number;
  accent: string;
  currency?: string;
}) {
  const positive = delta >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-1">{title}</div>
        <div className={`text-2xl font-bold ${accent}`}>{value} {currency}</div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-muted-foreground">السابق: {prev} {currency}</span>
          <span className={`inline-flex items-center gap-1 font-bold ${positive ? "text-green-500" : "text-red-500"}`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? "+" : ""}{delta.toFixed(1)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryBox({ label, value, suffix, color }: { label: string; value: string; suffix: string; color: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value} {suffix}</div>
    </div>
  );
}
