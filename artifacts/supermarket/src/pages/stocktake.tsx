import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Camera, Search, Plus, Trash2, CheckCircle2, AlertTriangle, Lock, Play, Sparkles } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { AICountCamera } from "@/components/AICountCamera";
import { format } from "date-fns";

type Product = {
  id: number;
  name: string;
  barcode?: string;
  stock?: number;
};

type StocktakeItem = {
  productId: number;
  productName: string;
  barcode?: string | null;
  expectedQty: number;
  actualQty: number;
  difference: number;
};

type Stocktake = {
  id: number;
  title: string;
  status: "open" | "closed";
  items: StocktakeItem[];
  startedBy?: string | null;
  closedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  closedAt?: string | null;
};

export default function Stocktake() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Stocktake[]>([]);
  const [active, setActive] = useState<Stocktake | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [aiCounterOpen, setAiCounterOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/api/stocktakes", { credentials: "include" }),
        fetch("/api/products", { credentials: "include" }),
      ]);
      if (sRes.ok) setSessions(await sRes.json());
      if (pRes.ok) setProducts(await pRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const startNew = async () => {
    const res = await fetch("/api/stocktakes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "تعذر إنشاء جلسة جرد" });
      return;
    }
    const created: Stocktake = await res.json();
    setActive(created);
    setSessions((s) => [created, ...s]);
    toast({ title: "بدأت جلسة جرد جديدة" });
  };

  const openSession = async (id: number) => {
    const res = await fetch(`/api/stocktakes/${id}`, { credentials: "include" });
    if (res.ok) setActive(await res.json());
  };

  const findProductByBarcode = (code: string): Product | null => {
    return products.find((p) => p.barcode && String(p.barcode) === code) || null;
  };

  const handleScanned = (code: string) => {
    setScannerOpen(false);
    const p = findProductByBarcode(code);
    if (!p) {
      toast({ variant: "destructive", title: "لم يُعثر على منتج بهذا الباركود", description: code });
      return;
    }
    setSelectedProduct(p);
    setActualQty(String(p.stock ?? 0));
    setSearch("");
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          (p.barcode && String(p.barcode).includes(q)),
      )
      .slice(0, 8);
  }, [search, products]);

  const submitItem = async () => {
    if (!active || !selectedProduct) return;
    const qty = Number(actualQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast({ variant: "destructive", title: "أدخل كمية صحيحة" });
      return;
    }
    const res = await fetch(`/api/stocktakes/${active.id}/items`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: selectedProduct.id, actualQty: qty }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الإضافة", description: e.error });
      return;
    }
    const updated: Stocktake = await res.json();
    setActive(updated);
    setSelectedProduct(null);
    setActualQty("");
    setSearch("");
    toast({ title: "تم تسجيل العنصر" });
  };

  const removeItem = async (productId: number) => {
    if (!active) return;
    const res = await fetch(`/api/stocktakes/${active.id}/items/${productId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setActive(await res.json());
  };

  const closeSession = async (applyAdjustments: boolean) => {
    if (!active) return;
    const msg = applyAdjustments
      ? `إغلاق الجلسة وتعديل ${active.items.filter((i) => i.difference !== 0).length} منتج بناءً على الجرد؟`
      : "إغلاق الجلسة بدون تعديل المخزون؟";
    if (!confirm(msg)) return;
    const res = await fetch(`/api/stocktakes/${active.id}/close`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applyAdjustments }),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "فشل إغلاق الجلسة" });
      return;
    }
    const result = await res.json();
    toast({
      title: "تم إغلاق الجلسة",
      description: applyAdjustments ? `تم تعديل ${result.adjustedCount} منتج` : "تم الحفظ بدون تعديل",
    });
    setActive(null);
    loadAll();
  };

  const stats = useMemo(() => {
    if (!active) return { total: 0, ok: 0, over: 0, short: 0, lossValue: 0 };
    const items = active.items;
    return {
      total: items.length,
      ok: items.filter((i) => i.difference === 0).length,
      over: items.filter((i) => i.difference > 0).length,
      short: items.filter((i) => i.difference < 0).length,
      lossValue: items.filter((i) => i.difference < 0).reduce((s, i) => s + Math.abs(i.difference), 0),
    };
  }, [active]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ClipboardList className="h-8 w-8 text-primary" />
          الجرد والتدقيق
        </h1>
        {!active && (
          <Button onClick={startNew} className="gap-2" data-testid="button-new-stocktake">
            <Plus className="h-4 w-4" /> جلسة جرد جديدة
          </Button>
        )}
      </div>

      {!active ? (
        <Card>
          <CardHeader><CardTitle>جلسات الجرد السابقة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العنوان</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>عدد المنتجات</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>بدأها</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">جاري التحميل…</TableCell></TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      لا توجد جلسات جرد بعد. ابدأ أول جلسة!
                    </TableCell>
                  </TableRow>
                ) : sessions.map((s) => (
                  <TableRow key={s.id} data-testid={`stocktake-row-${s.id}`}>
                    <TableCell className="font-bold">{s.title}</TableCell>
                    <TableCell>
                      {s.status === "open" ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded">مفتوحة</span>
                      ) : (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">مغلقة</span>
                      )}
                    </TableCell>
                    <TableCell>{s.items?.length ?? 0}</TableCell>
                    <TableCell className="text-xs">{format(new Date(s.createdAt), "yyyy/MM/dd HH:mm")}</TableCell>
                    <TableCell className="text-xs">{s.startedBy ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openSession(s.id)} className="gap-1" data-testid={`open-stocktake-${s.id}`}>
                        {s.status === "open" ? <><Play className="h-3.5 w-3.5" /> متابعة</> : "عرض"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active session header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {active.title}
                  {active.status === "open" ? (
                    <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-1 rounded">مفتوحة</span>
                  ) : (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">مغلقة</span>
                  )}
                </CardTitle>
                <Button variant="outline" onClick={() => setActive(null)}>عودة للقائمة</Button>
              </div>
            </CardHeader>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="منتجات مجرودة" value={stats.total} />
            <Stat label="مطابق" value={stats.ok} color="text-emerald-500" />
            <Stat label="زيادة" value={stats.over} color="text-blue-500" />
            <Stat label="نقص" value={stats.short} color="text-orange-500" />
            <Stat label="إجمالي النقص" value={stats.lossValue} color="text-destructive" suffix=" وحدة" />
          </div>

          {active.status === "open" && (
            <Card>
              <CardHeader><CardTitle className="text-lg">إضافة منتج للجرد</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setScannerOpen(true)} className="gap-2" data-testid="button-scan-stocktake">
                    <Camera className="h-4 w-4" /> مسح الباركود
                  </Button>
                  <div className="flex-1 relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setSelectedProduct(null); }}
                      placeholder="ابحث بالاسم أو الباركود…"
                      className="pr-10"
                      data-testid="input-product-search"
                    />
                  </div>
                </div>

                {filteredProducts.length > 0 && !selectedProduct && (
                  <div className="border border-border rounded-md max-h-64 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedProduct(p); setActualQty(String(p.stock ?? 0)); setSearch(""); }}
                        className="w-full text-right px-3 py-2 hover:bg-muted/60 flex justify-between items-center border-b border-border last:border-0"
                      >
                        <span>
                          <div className="font-bold">{p.name}</div>
                          {p.barcode && <div className="text-xs text-muted-foreground" dir="ltr">{p.barcode}</div>}
                        </span>
                        <span className="text-xs text-muted-foreground">المخزون: {p.stock ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedProduct && (
                  <div className="border border-primary/40 rounded-md p-4 bg-primary/5 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">{selectedProduct.name}</div>
                        {selectedProduct.barcode && <div className="text-xs text-muted-foreground" dir="ltr">{selectedProduct.barcode}</div>}
                        <div className="text-sm mt-1">المخزون المتوقع: <span className="font-bold">{selectedProduct.stock ?? 0}</span></div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(null); setActualQty(""); }}>
                        إلغاء
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>الكمية الفعلية المعدودة</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={actualQty}
                          onChange={(e) => setActualQty(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && submitItem()}
                          autoFocus
                          className="text-2xl font-bold text-center"
                          data-testid="input-actual-qty"
                        />
                        <Button onClick={submitItem} className="px-6" data-testid="button-submit-item">
                          تسجيل
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setAiCounterOpen(true)}
                        className="w-full gap-2 border-primary/40 hover:bg-primary/10"
                        data-testid="button-ai-count"
                      >
                        <Sparkles className="h-4 w-4 text-primary" />
                        احسب بالذكاء الاصطناعي عبر صورة
                      </Button>
                      {actualQty !== "" && Number.isFinite(Number(actualQty)) && (
                        <DiffPreview expected={Number(selectedProduct.stock ?? 0)} actual={Number(actualQty)} />
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-lg">المنتجات المجرودة</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الباركود</TableHead>
                    <TableHead>المتوقع</TableHead>
                    <TableHead>الفعلي</TableHead>
                    <TableHead>الفرق</TableHead>
                    {active.status === "open" && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={active.status === "open" ? 6 : 5} className="text-center py-8 text-muted-foreground">
                        لا توجد منتجات بعد — استعمل المسح أو البحث للبدء
                      </TableCell>
                    </TableRow>
                  ) : active.items.map((it) => (
                    <TableRow key={it.productId}>
                      <TableCell className="font-bold">{it.productName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground" dir="ltr">{it.barcode ?? "—"}</TableCell>
                      <TableCell>{it.expectedQty}</TableCell>
                      <TableCell className="font-bold">{it.actualQty}</TableCell>
                      <TableCell>
                        <DiffBadge diff={it.difference} />
                      </TableCell>
                      {active.status === "open" && (
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(it.productId)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {active.status === "open" && active.items.length > 0 && (
            <div className="flex flex-wrap gap-3 justify-end">
              <Button variant="outline" onClick={() => closeSession(false)} className="gap-2" data-testid="button-close-no-adjust">
                <Lock className="h-4 w-4" /> إغلاق بدون تعديل المخزون
              </Button>
              <Button onClick={() => closeSession(true)} className="gap-2" data-testid="button-close-and-adjust">
                <CheckCircle2 className="h-4 w-4" /> تطبيق التعديلات وإغلاق الجلسة
              </Button>
            </div>
          )}
        </>
      )}

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScanned} />
      <AICountCamera
        open={aiCounterOpen}
        onClose={() => setAiCounterOpen(false)}
        productName={selectedProduct?.name}
        onCount={(n) => {
          setActualQty(String(n));
          toast({ title: "تم استعمال العدد من الذكاء الاصطناعي", description: `${n} وحدة` });
        }}
      />
    </div>
  );
}

function Stat({ label, value, color, suffix }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={`text-2xl font-bold ${color ?? ""}`}>{value}{suffix ?? ""}</div>
      </CardContent>
    </Card>
  );
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return <span className="inline-flex items-center gap-1 text-emerald-500 text-xs font-bold">
      <CheckCircle2 className="h-3.5 w-3.5" /> مطابق
    </span>;
  }
  if (diff > 0) {
    return <span className="text-blue-500 font-bold">+{diff}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-orange-500 font-bold">
    <AlertTriangle className="h-3.5 w-3.5" /> {diff}
  </span>;
}

function DiffPreview({ expected, actual }: { expected: number; actual: number }) {
  const diff = actual - expected;
  if (diff === 0) return <div className="text-sm text-emerald-500 font-bold">✓ المخزون مطابق</div>;
  if (diff > 0) return <div className="text-sm text-blue-500 font-bold">زيادة قدرها {diff} وحدة</div>;
  return <div className="text-sm text-orange-500 font-bold">نقص قدره {Math.abs(diff)} وحدة</div>;
}
