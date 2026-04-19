import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Truck, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "حدث خطأ");
  return data;
}

export default function DistributorPortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [form, setForm] = useState({
    productName: "",
    category: "",
    wholesalePrice: "",
    minimumQuantity: "1",
    availableQuantity: "0",
    deliveryDays: "1",
    notes: "",
    status: "active",
  });

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["distributor-offers", isAdmin ? "all" : "mine"],
    queryFn: () => fetchJson<any[]>(`/api/distributor-offers${isAdmin ? "" : "?mine=true"}`),
  });

  const submitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchJson("/api/distributor-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          wholesalePrice: parseFloat(form.wholesalePrice),
          minimumQuantity: parseInt(form.minimumQuantity, 10),
          availableQuantity: parseInt(form.availableQuantity, 10),
          deliveryDays: parseInt(form.deliveryDays, 10),
        }),
      });
      setForm({ productName: "", category: "", wholesalePrice: "", minimumQuantity: "1", availableQuantity: "0", deliveryDays: "1", notes: "", status: "active" });
      queryClient.invalidateQueries({ queryKey: ["distributor-offers"] });
      toast({ title: "تم نشر العرض", description: "تمت إضافة عرض التوريد بنجاح" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await fetchJson(`/api/distributor-offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      queryClient.invalidateQueries({ queryKey: ["distributor-offers"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Truck className="h-8 w-8" />
        {isAdmin ? "عروض الموزعين" : "واجهة الموزع"}
      </h1>

      {!isAdmin && (
        <form onSubmit={submitOffer} className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2"><Plus className="h-5 w-5" /> نشر عرض توريد</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>اسم المنتج</Label>
              <Input required value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>سعر الجملة</Label>
              <Input required type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>أقل كمية</Label>
              <Input type="number" value={form.minimumQuantity} onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>الكمية المتاحة</Label>
              <Input type="number" value={form.availableQuantity} onChange={(e) => setForm({ ...form, availableQuantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>أيام التوصيل</Label>
              <Input type="number" value={form.deliveryDays} onChange={(e) => setForm({ ...form, deliveryDays: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <Button type="submit">نشر العرض</Button>
        </form>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المنتج</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>الموزع</TableHead>
              <TableHead>سعر الجملة</TableHead>
              <TableHead>أقل كمية</TableHead>
              <TableHead>المتوفر</TableHead>
              <TableHead>التوصيل</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            ) : offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-bold">{offer.productName}</TableCell>
                <TableCell>{offer.category}</TableCell>
                <TableCell>{offer.distributorName}</TableCell>
                <TableCell>{offer.wholesalePrice} دج</TableCell>
                <TableCell>{offer.minimumQuantity}</TableCell>
                <TableCell>{offer.availableQuantity}</TableCell>
                <TableCell>{offer.deliveryDays} يوم</TableCell>
                <TableCell>
                  <Select value={offer.status} onValueChange={(status) => updateStatus(offer.id, status)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">نشط</SelectItem>
                      <SelectItem value="paused">متوقف</SelectItem>
                      <SelectItem value="archived">مؤرشف</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && offers.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد عروض بعد</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}