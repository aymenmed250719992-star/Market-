import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Gift, Search, Award, Sparkles, ArrowDownCircle, ArrowUpCircle, Phone } from "lucide-react";
import { format } from "date-fns";

type Customer = {
  id: number;
  name: string;
  phone?: string;
  loyaltyPoints: number;
  totalDebt?: number;
  creditLimit?: number;
};

type HistoryEvent = {
  id: number;
  action: "earn" | "redeem" | string;
  points: number;
  amount: number;
  balance: number | null;
  note: string | null;
  userName: string | null;
  createdAt: string;
};

type Reward = {
  id: string;
  cost: number;
  title: string;
  description: string;
  icon: string;
};

// Static catalog — easy to edit, no DB needed
const REWARDS: Reward[] = [
  { id: "v50", cost: 50, title: "قسيمة خصم ٥٠ دج", description: "قابلة للاستعمال في أي مشترى", icon: "🎟️" },
  { id: "v100", cost: 100, title: "قسيمة خصم ١٠٠ دج", description: "خصم ١٠٠ دج على فاتورتك القادمة", icon: "🏷️" },
  { id: "delivery", cost: 150, title: "توصيل مجاني", description: "توصيل مجاني للطلب القادم", icon: "🚚" },
  { id: "v500", cost: 500, title: "قسيمة خصم ٥٠٠ دج", description: "خصم كبير على مشترياتك", icon: "💎" },
  { id: "gift", cost: 1000, title: "هدية مفاجأة", description: "اختر هدية من المتجر بقيمة ١٠٠٠ دج", icon: "🎁" },
];

export default function LoyaltyRewards() {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const q = phone.trim();
    if (!q) {
      toast({ variant: "destructive", title: "أدخل رقم هاتف الزبون" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/customers", { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل الزبائن");
      const all: Customer[] = await res.json();
      const found = all.find(
        (c) => c.phone && String(c.phone).replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      );
      if (!found) {
        setCustomer(null);
        setHistory([]);
        toast({ variant: "destructive", title: "لا يوجد زبون بهذا الرقم" });
        return;
      }
      setCustomer(found);
      const histRes = await fetch(`/api/customers/${found.id}/loyalty-history`, { credentials: "include" });
      setHistory(histRes.ok ? await histRes.json() : []);
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    if (!customer) return;
    const [cRes, hRes] = await Promise.all([
      fetch(`/api/customers/${customer.id}`, { credentials: "include" }),
      fetch(`/api/customers/${customer.id}/loyalty-history`, { credentials: "include" }),
    ]);
    if (cRes.ok) setCustomer(await cRes.json());
    if (hRes.ok) setHistory(await hRes.json());
  };

  const redeem = async (reward: Reward) => {
    if (!customer) return;
    if (customer.loyaltyPoints < reward.cost) {
      toast({ variant: "destructive", title: "النقاط غير كافية", description: `يحتاج ${reward.cost} نقطة` });
      return;
    }
    if (!confirm(`استبدال ${reward.cost} نقطة مقابل: ${reward.title}؟`)) return;
    const res = await fetch(`/api/customers/${customer.id}/redeem-points`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: reward.cost, note: reward.title }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الاستبدال", description: e.error ?? "حاول مرة أخرى" });
      return;
    }
    toast({ title: "تم الاستبدال بنجاح", description: `تم خصم ${reward.cost} نقطة` });
    refreshAll();
  };

  const totalEarned = history.filter((e) => e.action === "earn").reduce((s, e) => s + e.points, 0);
  const totalRedeemed = history.filter((e) => e.action === "redeem").reduce((s, e) => s + e.points, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Gift className="h-8 w-8 text-primary" />
        مكافآت الولاء
      </h1>

      {/* Lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            البحث عن زبون
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="رقم هاتف الزبون"
                dir="ltr"
                className="text-right pr-10"
                data-testid="input-loyalty-phone"
              />
            </div>
            <Button onClick={search} disabled={loading} data-testid="button-loyalty-search">
              {loading ? "جاري البحث…" : "بحث"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {customer && (
        <>
          {/* Balance summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-2 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Award className="h-4 w-4" /> الزبون
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.name}</div>
                <div className="text-sm text-muted-foreground" dir="ltr">{customer.phone}</div>
                <div className="mt-3 text-4xl font-bold text-primary flex items-center gap-2">
                  <Sparkles className="h-7 w-7" />
                  {customer.loyaltyPoints} <span className="text-sm font-normal text-muted-foreground">نقطة</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ≈ {customer.loyaltyPoints} دج خصم متاح
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">إجمالي المكتسب</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500 flex items-center gap-2">
                  <ArrowUpCircle className="h-6 w-6" /> {totalEarned}
                </div>
                <div className="text-xs text-muted-foreground mt-1">من جميع المشتريات</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">إجمالي المستبدل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500 flex items-center gap-2">
                  <ArrowDownCircle className="h-6 w-6" /> {totalRedeemed}
                </div>
                <div className="text-xs text-muted-foreground mt-1">عبر المكافآت</div>
              </CardContent>
            </Card>
          </div>

          {/* Rewards catalog */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Gift className="h-5 w-5" />
                كتالوج المكافآت
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {REWARDS.map((r) => {
                  const canAfford = customer.loyaltyPoints >= r.cost;
                  return (
                    <div
                      key={r.id}
                      className={`border rounded-lg p-4 transition-all ${
                        canAfford
                          ? "border-primary/40 bg-card hover:shadow-lg hover:border-primary"
                          : "border-border bg-muted/30 opacity-60"
                      }`}
                      data-testid={`reward-${r.id}`}
                    >
                      <div className="text-4xl mb-2">{r.icon}</div>
                      <div className="font-bold">{r.title}</div>
                      <div className="text-xs text-muted-foreground mb-3">{r.description}</div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary flex items-center gap-1">
                          <Sparkles className="h-4 w-4" /> {r.cost} نقطة
                        </span>
                        <Button
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => redeem(r)}
                          data-testid={`button-redeem-${r.id}`}
                        >
                          {canAfford ? "استبدل" : "غير متاح"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">سجل النقاط</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>النقاط</TableHead>
                    <TableHead>الرصيد</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead>بواسطة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد حركات بعد
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.slice(0, 50).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{format(new Date(e.createdAt), "yyyy/MM/dd HH:mm")}</TableCell>
                        <TableCell>
                          {e.action === "earn" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-bold">
                              <ArrowUpCircle className="h-3.5 w-3.5" /> اكتساب
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-orange-500 text-xs font-bold">
                              <ArrowDownCircle className="h-3.5 w-3.5" /> استبدال
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`font-bold ${e.action === "earn" ? "text-emerald-500" : "text-orange-500"}`}>
                          {e.action === "earn" ? "+" : "−"}{e.points}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.balance ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.note ?? (e.action === "earn" && e.amount ? `شراء ${e.amount} دج` : "—")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.userName ?? "النظام"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
