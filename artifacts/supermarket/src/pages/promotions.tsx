import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { format } from "date-fns";

type Promotion = {
  id: number;
  title: string;
  description?: string | null;
  discountType: "percent" | "amount";
  discountValue: number;
  startsAt?: string | null;
  endsAt?: string | null;
  active: boolean;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

const empty = {
  title: "",
  description: "",
  discountType: "percent" as "percent" | "amount",
  discountValue: 10,
  startsAt: "",
  endsAt: "",
  active: true,
  imageUrl: "",
};

export default function Promotions() {
  const { toast } = useToast();
  const [list, setList] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/promotions", { credentials: "include" });
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isActiveNow = (p: Promotion) => {
    if (!p.active) return false;
    const now = Date.now();
    if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
    if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
    return true;
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description ?? "",
      discountType: p.discountType,
      discountValue: p.discountValue,
      startsAt: p.startsAt ? p.startsAt.slice(0, 16) : "",
      endsAt: p.endsAt ? p.endsAt.slice(0, 16) : "",
      active: p.active,
      imageUrl: p.imageUrl ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "العنوان مطلوب" });
      return;
    }
    const payload = {
      ...form,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      discountValue: Number(form.discountValue),
    };
    const url = editingId ? `/api/promotions/${editingId}` : "/api/promotions";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "تعذر الحفظ" });
      return;
    }
    toast({ title: editingId ? "تم تحديث العرض" : "تم إنشاء العرض" });
    setOpen(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا العرض؟")) return;
    await fetch(`/api/promotions/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "تم الحذف" });
    load();
  };

  const toggleActive = async (p: Promotion) => {
    await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const activeCount = useMemo(() => list.filter(isActiveNow).length, [list]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          العروض الترويجية
        </h1>
        <Button onClick={openCreate} className="gap-2" data-testid="button-new-promotion">
          <Plus className="h-4 w-4" /> عرض جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">إجمالي العروض</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{list.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">عروض نشطة الآن</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-500">{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">منتهية / مجدولة</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-muted-foreground">{list.length - activeCount}</div></CardContent>
        </Card>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>العنوان</TableHead>
              <TableHead>الخصم</TableHead>
              <TableHead>تبدأ</TableHead>
              <TableHead>تنتهي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">جاري التحميل…</TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  لا توجد عروض بعد. أنشئ أول عرض لجذب الزبائن!
                </TableCell>
              </TableRow>
            ) : list.map((p) => (
              <TableRow key={p.id} data-testid={`promotion-row-${p.id}`}>
                <TableCell className="font-bold">{p.title}</TableCell>
                <TableCell>
                  {p.discountType === "percent" ? `${p.discountValue}%` : `${p.discountValue} دج`}
                </TableCell>
                <TableCell className="text-xs">{p.startsAt ? format(new Date(p.startsAt), "yyyy/MM/dd HH:mm") : "—"}</TableCell>
                <TableCell className="text-xs">{p.endsAt ? format(new Date(p.endsAt), "yyyy/MM/dd HH:mm") : "—"}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      isActiveNow(p)
                        ? "bg-emerald-500/20 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`toggle-active-${p.id}`}
                  >
                    {isActiveNow(p) ? "نشط" : p.active ? "مجدول/منتهي" : "متوقف"}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" onClick={() => openEdit(p)} data-testid={`edit-promotion-${p.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => remove(p.id)} data-testid={`delete-promotion-${p.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل العرض" : "عرض جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>عنوان العرض</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: تخفيض ٢٠٪ على الزيوت" data-testid="input-promotion-title" />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="تفاصيل العرض…" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع الخصم</Label>
                <select
                  className="w-full bg-background border border-border rounded-md p-2"
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "amount" })}
                >
                  <option value="percent">نسبة مئوية ٪</option>
                  <option value="amount">مبلغ ثابت (دج)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>قيمة الخصم</Label>
                <Input type="number" min={0} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>يبدأ من (اختياري)</Label>
                <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>ينتهي في (اختياري)</Label>
                <Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>رابط صورة (اختياري)</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." dir="ltr" className="text-left" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="active-switch">تفعيل العرض</Label>
              <Switch id="active-switch" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save} data-testid="button-save-promotion">{editingId ? "حفظ التعديلات" : "إنشاء العرض"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
