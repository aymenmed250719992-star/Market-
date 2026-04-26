import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Truck,
  Plus,
  Send,
  PackageCheck,
  XCircle,
  Trash2,
  Search,
  ArrowRight,
  Phone,
  FileText,
} from "lucide-react";
import { format } from "date-fns";

type Product = {
  id: number;
  name: string;
  barcode?: string | null;
  cost?: number;
  stock?: number;
};

type POItem = {
  productId: number;
  productName: string;
  barcode?: string | null;
  unitCost: number;
  orderedQty: number;
  receivedQty: number;
};

type PurchaseOrder = {
  id: number;
  supplierName: string;
  supplierPhone?: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  items: POItem[];
  totalCost: number;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string | null;
};

const STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  draft: "مسودة",
  sent: "مرسل",
  partial: "استلام جزئي",
  received: "مستلم",
  cancelled: "ملغى",
};

const STATUS_VARIANT: Record<PurchaseOrder["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/20 text-blue-500",
  partial: "bg-amber-500/20 text-amber-500",
  received: "bg-emerald-500/20 text-emerald-500",
  cancelled: "bg-red-500/20 text-red-500",
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [active, setActive] = useState<PurchaseOrder | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [search, setSearch] = useState("");
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadAll = async () => {
    setLoading(true);
    try {
      const [oRes, pRes] = await Promise.all([
        fetch("/api/purchase-orders", { credentials: "include" }),
        fetch("/api/products", { credentials: "include" }),
      ]);
      const o = oRes.ok ? await oRes.json() : [];
      const p = pRes.ok ? await pRes.json() : [];
      setOrders(o);
      setProducts(p);
      if (active) {
        const refreshed = o.find((x: PurchaseOrder) => x.id === active.id);
        if (refreshed) setActive(refreshed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CREATE order
  const createOrder = async () => {
    if (!newSupplier.trim()) {
      toast({ variant: "destructive", title: "اسم المورد مطلوب" });
      return;
    }
    const res = await fetch("/api/purchase-orders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: newSupplier, supplierPhone: newPhone || null, notes: newNotes || null }),
    });
    if (res.ok) {
      const o: PurchaseOrder = await res.json();
      toast({ title: "تم إنشاء طلب الشراء", description: `طلب رقم ${o.id}` });
      setCreateOpen(false);
      setNewSupplier(""); setNewPhone(""); setNewNotes("");
      await loadAll();
      setActive(o);
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الإنشاء", description: e.error });
    }
  };

  // ADD item
  const addItem = async () => {
    if (!active || !pickedProduct) return;
    const qn = Number(qty), cn = Number(unitCost);
    if (!qn || qn <= 0) { toast({ variant: "destructive", title: "كمية غير صالحة" }); return; }
    if (!Number.isFinite(cn) || cn < 0) { toast({ variant: "destructive", title: "سعر شراء غير صالح" }); return; }
    const res = await fetch(`/api/purchase-orders/${active.id}/items`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: pickedProduct.id, orderedQty: qn, unitCost: cn }),
    });
    if (res.ok) {
      setPickedProduct(null); setQty(""); setUnitCost(""); setSearch("");
      await loadAll();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل إضافة المنتج", description: e.error });
    }
  };

  const removeItem = async (productId: number) => {
    if (!active) return;
    const res = await fetch(`/api/purchase-orders/${active.id}/items/${productId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) await loadAll();
  };

  const sendOrder = async () => {
    if (!active) return;
    if (!confirm(`إرسال الطلب رقم ${active.id} إلى ${active.supplierName}؟`)) return;
    const res = await fetch(`/api/purchase-orders/${active.id}/send`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: "تم إرسال الطلب" });
      // Optionally open WhatsApp
      if (active.supplierPhone) {
        const lines = active.items.map((i) => `• ${i.productName} × ${i.orderedQty}`).join("\n");
        const msg = encodeURIComponent(
          `طلب شراء رقم ${active.id}\nالمورد: ${active.supplierName}\n\nالمنتجات:\n${lines}\n\nالإجمالي: ${active.totalCost.toLocaleString()} دج`,
        );
        let phone = active.supplierPhone.replace(/\D/g, "");
        if (phone.startsWith("0")) phone = "213" + phone.slice(1);
        if (confirm("هل تريد إرسال الطلب عبر واتساب؟")) {
          window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
        }
      }
      await loadAll();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الإرسال", description: e.error });
    }
  };

  const receiveAll = async () => {
    if (!active) return;
    if (!confirm("تأكيد استلام كل المنتجات المتبقية وتحديث المخزون تلقائياً؟")) return;
    const res = await fetch(`/api/purchase-orders/${active.id}/receive`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiveAll: true }),
    });
    if (res.ok) {
      toast({ title: "تم استلام الطلب وتحديث المخزون" });
      await loadAll();
    }
  };

  const receivePartial = async (productId: number, qty: number) => {
    if (!active || !qty || qty <= 0) return;
    const res = await fetch(`/api/purchase-orders/${active.id}/receive`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipts: [{ productId, qty }] }),
    });
    if (res.ok) await loadAll();
  };

  const cancelOrder = async () => {
    if (!active) return;
    if (!confirm("إلغاء طلب الشراء؟")) return;
    const res = await fetch(`/api/purchase-orders/${active.id}/cancel`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) { toast({ title: "تم الإلغاء" }); await loadAll(); }
  };

  // Filtered product picker
  const filteredProducts = search.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode ?? "").includes(search),
      ).slice(0, 8)
    : [];

  if (loading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل…</div>;

  // ─── DETAIL VIEW ───
  if (active) {
    const totalCost = active.items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
    const totalReceived = active.items.reduce((s, i) => s + i.receivedQty, 0);
    const totalOrdered = active.items.reduce((s, i) => s + i.orderedQty, 0);
    const isEditable = active.status === "draft";
    const isReceivable = active.status === "sent" || active.status === "partial";

    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setActive(null)} className="gap-1">
            <ArrowRight className="h-4 w-4" /> رجوع
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> طلب رقم {active.id}
          </h1>
          <span className={`text-xs font-bold px-2 py-1 rounded ${STATUS_VARIANT[active.status]}`}>
            {STATUS_LABEL[active.status]}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div>{active.supplierName}</div>
                {active.supplierPhone && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1 font-normal mt-1">
                    <Phone className="h-3 w-3" /> {active.supplierPhone}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {isEditable && (
                  <Button onClick={sendOrder} className="gap-2" data-testid="button-send-order">
                    <Send className="h-4 w-4" /> إرسال الطلب
                  </Button>
                )}
                {isReceivable && (
                  <Button onClick={receiveAll} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="button-receive-all">
                    <PackageCheck className="h-4 w-4" /> استلام الكل
                  </Button>
                )}
                {active.status !== "received" && active.status !== "cancelled" && (
                  <Button variant="outline" onClick={cancelOrder} className="gap-2 text-red-500 border-red-500/30">
                    <XCircle className="h-4 w-4" /> إلغاء
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {active.notes && (
              <div className="bg-muted/30 p-3 rounded-md text-sm flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                {active.notes}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <Stat label="المنتجات" value={active.items.length} />
              <Stat label="مجموع الكميات" value={totalOrdered} />
              <Stat label="المستلم" value={totalReceived} color="text-emerald-500" />
              <Stat label="إجمالي التكلفة" value={totalCost} suffix="دج" color="text-primary" />
            </div>

            {isEditable && (
              <div className="bg-card border-2 border-dashed border-border rounded-lg p-4 space-y-3">
                <Label className="text-base font-bold flex items-center gap-2">
                  <Plus className="h-4 w-4" /> إضافة منتج
                </Label>
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPickedProduct(null); }}
                    placeholder="ابحث بالاسم أو الباركود..."
                    className="pr-10"
                    data-testid="input-product-search"
                  />
                  {filteredProducts.length > 0 && !pickedProduct && (
                    <div className="mt-1 border border-border rounded-md max-h-48 overflow-y-auto bg-background">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPickedProduct(p);
                            setSearch(p.name);
                            setUnitCost(String(p.cost ?? ""));
                          }}
                          className="w-full text-right px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0"
                        >
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.barcode} • مخزون: {p.stock ?? 0} • تكلفة: {p.cost ?? 0} دج
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {pickedProduct && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">الكمية</Label>
                      <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs">سعر شراء الوحدة (دج)</Label>
                      <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                    </div>
                    <Button onClick={addItem} className="col-span-2 gap-2">
                      <Plus className="h-4 w-4" /> إضافة للطلب
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="border border-border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead className="text-center">المطلوب</TableHead>
                    <TableHead className="text-center">المستلم</TableHead>
                    <TableHead className="text-center">سعر الوحدة</TableHead>
                    <TableHead className="text-center">الإجمالي</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.items.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لم تُضف منتجات بعد</TableCell></TableRow>
                  ) : active.items.map((it) => {
                    const remaining = it.orderedQty - it.receivedQty;
                    return (
                      <TableRow key={it.productId}>
                        <TableCell className="font-medium">
                          {it.productName}
                          {it.barcode && <div className="text-xs text-muted-foreground">{it.barcode}</div>}
                        </TableCell>
                        <TableCell className="text-center font-bold">{it.orderedQty}</TableCell>
                        <TableCell className="text-center">
                          <span className={it.receivedQty >= it.orderedQty ? "text-emerald-500 font-bold" : "text-amber-500"}>
                            {it.receivedQty}
                          </span>
                          {remaining > 0 && <div className="text-xs text-muted-foreground">باق {remaining}</div>}
                        </TableCell>
                        <TableCell className="text-center">{it.unitCost.toLocaleString()} دج</TableCell>
                        <TableCell className="text-center font-bold text-primary">
                          {(it.unitCost * it.orderedQty).toLocaleString()} دج
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {isReceivable && remaining > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => {
                                  const v = prompt(`كم وحدة استلمت من "${it.productName}"؟ (متبقي ${remaining})`, String(remaining));
                                  const q = Number(v);
                                  if (q > 0) receivePartial(it.productId, q);
                                }}
                              >
                                استلام
                              </Button>
                            )}
                            {isEditable && (
                              <Button size="icon" variant="ghost" onClick={() => removeItem(it.productId)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" /> طلبات الشراء من الموردين
        </h1>
        <Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-order">
          <Plus className="h-4 w-4" /> طلب جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">عدد الأصناف</TableHead>
                <TableHead className="text-center">الإجمالي</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد طلبات شراء بعد</TableCell></TableRow>
              ) : orders.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setActive(o)}
                  data-testid={`row-order-${o.id}`}
                >
                  <TableCell className="font-bold">#{o.id}</TableCell>
                  <TableCell>
                    {o.supplierName}
                    {o.supplierPhone && <div className="text-xs text-muted-foreground">{o.supplierPhone}</div>}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${STATUS_VARIANT[o.status]}`}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{o.items.length}</TableCell>
                  <TableCell className="text-center font-bold text-primary">{o.totalCost.toLocaleString()} دج</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(o.createdAt), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>طلب شراء جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المورد *</Label>
              <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="مثال: مؤسسة الأمل للتوزيع" data-testid="input-supplier-name" />
            </div>
            <div>
              <Label>هاتف المورد (اختياري)</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="0555xxxxxx" dir="ltr" />
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="مثلا: تسليم قبل نهاية الأسبوع" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button onClick={createOrder} data-testid="button-create-order">إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, color, suffix }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ?? ""}`}>
        {value.toLocaleString()} {suffix && <span className="text-sm font-normal">{suffix}</span>}
      </div>
    </div>
  );
}
