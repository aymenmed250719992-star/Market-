import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Undo2, Search } from "lucide-react";

type SaleItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
};

type Sale = {
  id: number;
  cashierName: string;
  customerName: string | null;
  customerId: number | null;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
  createdAt: string;
};

type ReturnEntry = {
  id: number;
  saleId: number;
  customerName: string | null;
  cashierName: string;
  items: SaleItem[];
  total: number;
  reason: string | null;
  refundMethod: string;
  createdAt: string;
};

export default function Returns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saleId, setSaleId] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [previous, setPrevious] = useState<ReturnEntry[]>([]);
  const [history, setHistory] = useState<ReturnEntry[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    const res = await fetch("/api/returns", { credentials: "include" });
    if (res.ok) setHistory(await res.json());
  };

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  const lookupSale = async () => {
    if (!saleId) return;
    setBusy(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`/api/sales/${saleId}`, { credentials: "include" }),
        fetch(`/api/returns/by-sale/${saleId}`, { credentials: "include" }),
      ]);
      if (!sRes.ok) {
        toast({ variant: "destructive", title: "خطأ", description: "الفاتورة غير موجودة" });
        setSale(null);
        return;
      }
      const s = await sRes.json();
      setSale(s);
      setPrevious(rRes.ok ? await rRes.json() : []);
      setQtyMap({});
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  const remainingFor = (productId: number, quantity: number) => {
    const used = previous
      .flatMap((r) => r.items)
      .filter((it) => it.productId === productId)
      .reduce((sum, it) => sum + Number(it.quantity), 0);
    return quantity - used;
  };

  const submit = async () => {
    if (!sale) return;
    const items = Object.entries(qtyMap)
      .map(([pid, qty]) => ({ productId: Number(pid), quantity: parseFloat(qty) || 0 }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast({ variant: "destructive", title: "خطأ", description: "حدد كمية للإرجاع" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId: sale.id, items, reason: reason || undefined }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "فشل الإرجاع");
      toast({
        title: "تم الإرجاع",
        description: `استرداد ${result.total} دج (${result.refundMethod === "karni" ? "خصم من الكارني" : "نقداً"})`,
      });
      setSale(null);
      setSaleId("");
      setQtyMap({});
      loadHistory();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!user || !["admin", "cashier"].includes(user.role)) {
    return <div className="text-center text-muted-foreground py-12">غير مسموح</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Undo2 className="h-8 w-8" />
        مرتجعات المبيعات
      </h1>

      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="رقم الفاتورة..."
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
            type="number"
            data-testid="input-sale-id"
          />
          <Button onClick={lookupSale} disabled={busy || !saleId} data-testid="button-lookup-sale">
            <Search className="ml-2 h-4 w-4" /> بحث
          </Button>
        </div>

        {sale && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">الفاتورة</div>
                <div className="font-bold">#{sale.id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">المجموع</div>
                <div className="font-bold">{sale.total} دج</div>
              </div>
              <div>
                <div className="text-muted-foreground">الزبون</div>
                <div className="font-bold">{sale.customerName ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">الدفع</div>
                <div className="font-bold">{sale.paymentMethod === "karni" ? "كارني" : sale.paymentMethod}</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>السعر</TableHead>
                  <TableHead>المباع</TableHead>
                  <TableHead>المرجع سابقاً</TableHead>
                  <TableHead>المتاح للإرجاع</TableHead>
                  <TableHead>كمية الإرجاع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item) => {
                  const remaining = remainingFor(item.productId, item.quantity);
                  return (
                    <TableRow key={item.productId}>
                      <TableCell className="font-bold">{item.productName}</TableCell>
                      <TableCell>{item.price} دج</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.quantity - remaining}</TableCell>
                      <TableCell className={remaining === 0 ? "text-muted-foreground" : "font-bold text-primary"}>
                        {remaining}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          step="0.01"
                          disabled={remaining === 0}
                          value={qtyMap[item.productId] ?? ""}
                          onChange={(e) => setQtyMap({ ...qtyMap, [item.productId]: e.target.value })}
                          className="w-24"
                          data-testid={`input-return-qty-${item.productId}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="space-y-2">
              <Label>سبب الإرجاع (اختياري)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="منتج تالف، رغبة الزبون..." data-testid="input-reason" />
            </div>

            <Button onClick={submit} disabled={busy} className="w-full" data-testid="button-submit-return">
              <Undo2 className="ml-2 h-4 w-4" /> تأكيد الإرجاع
            </Button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">سجل المرتجعات</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>رقم</TableHead>
              <TableHead>الفاتورة</TableHead>
              <TableHead>الزبون</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>طريقة الاسترداد</TableHead>
              <TableHead>السبب</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  لا توجد مرتجعات
                </TableCell>
              </TableRow>
            ) : (
              history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString("ar-DZ")}</TableCell>
                  <TableCell>#{r.id}</TableCell>
                  <TableCell>#{r.saleId}</TableCell>
                  <TableCell>{r.customerName ?? "—"}</TableCell>
                  <TableCell className="font-bold">{r.total} دج</TableCell>
                  <TableCell>{r.refundMethod === "karni" ? "كارني" : "نقدي"}</TableCell>
                  <TableCell className="text-xs">{r.reason ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
