import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  useListShortages, 
  useCreateShortage, 
  useResolveShortage, 
  useListProducts,
  getListShortagesQueryKey, 
  ShortageReportType,
  CreateShortageBodyType
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Check, X, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Shortages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canResolve = user?.role === "admin" || user?.role === "buyer";
  
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const { data: shortages, isLoading } = useListShortages();
  const { data: products } = useListProducts();
  
  const createShortage = useCreateShortage();
  const resolveShortage = useResolveShortage();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: "none",
    productName: "",
    type: "shortage" as CreateShortageBodyType,
    quantity: "",
    notes: ""
  });

  const handleProductSelect = (val: string) => {
    if (val === "none") {
      setFormData({ ...formData, productId: "none", productName: "" });
    } else {
      const p = products?.find(p => p.id.toString() === val);
      setFormData({ ...formData, productId: val, productName: p?.name || "" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.productId === "none" && !formData.productName) {
      toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد المنتج أو كتابة اسمه" });
      return;
    }
    
    try {
      await createShortage.mutateAsync({
        data: {
          productId: formData.productId !== "none" ? parseInt(formData.productId) : null,
          productName: formData.productName,
          type: formData.type,
          quantity: formData.quantity ? parseFloat(formData.quantity) : null,
          notes: formData.notes || null
        }
      });
      toast({ title: "تم التسجيل", description: "تم تسجيل التقرير بنجاح" });
      queryClient.invalidateQueries({ queryKey: getListShortagesQueryKey() });
      setIsModalOpen(false);
      setFormData({ productId: "none", productName: "", type: "shortage", quantity: "", notes: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const handleResolve = async (id: number, status: "resolved" | "dismissed") => {
    try {
      await resolveShortage.mutateAsync({
        id,
        data: { status }
      });
      toast({ title: "تم التحديث", description: "تم تحديث حالة التقرير" });
      queryClient.invalidateQueries({ queryKey: getListShortagesQueryKey() });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const filteredShortages = shortages?.filter(s => statusFilter === "all" || s.status === statusFilter);

  const typeLabels: Record<string, string> = {
    shortage: "نقص",
    damage: "تالف",
    expired: "منتهي الصلاحية"
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          النواقص والتوالف
        </h1>
        <Button onClick={() => setIsModalOpen(true)} data-testid="button-add-shortage">
          <Plus className="ml-2 h-4 w-4" /> تقرير جديد
        </Button>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border flex items-center gap-4">
        <Label>الحالة:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="اختر الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="pending">قيد الانتظار</SelectItem>
            <SelectItem value="resolved">معالج</SelectItem>
            <SelectItem value="dismissed">ملغى</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>تاريخ</TableHead>
              <TableHead>المنتج</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الكمية</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>الملاحظات</TableHead>
              <TableHead>الحالة</TableHead>
              {canResolve && <TableHead className="text-left">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1,2,3].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  {canResolve && <TableCell><Skeleton className="h-8 w-24" /></TableCell>}
                </TableRow>
              ))
            ) : filteredShortages?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{format(new Date(s.createdAt), "yyyy/MM/dd HH:mm")}</TableCell>
                <TableCell className="font-bold">{s.productName}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    s.type === 'shortage' ? 'bg-primary/20 text-primary' : 
                    s.type === 'damage' ? 'bg-destructive/20 text-destructive' :
                    'bg-accent/20 text-accent'
                  }`}>
                    {typeLabels[s.type] || s.type}
                  </span>
                </TableCell>
                <TableCell>{s.quantity || '-'}</TableCell>
                <TableCell>{s.reportedByName}</TableCell>
                <TableCell className="max-w-[200px] truncate">{s.notes || '-'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    s.status === 'pending' ? 'bg-accent/20 text-accent' : 
                    s.status === 'resolved' ? 'bg-primary/20 text-primary' :
                    'bg-secondary text-secondary-foreground'
                  }`}>
                    {s.status === 'pending' ? 'قيد الانتظار' : s.status === 'resolved' ? 'معالج' : 'ملغى'}
                  </span>
                </TableCell>
                {canResolve && (
                  <TableCell className="text-left">
                    {s.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="text-primary hover:text-primary" onClick={() => handleResolve(s.id, 'resolved')} data-testid={`button-resolve-${s.id}`}>
                          <Check className="h-4 w-4 ml-1" /> معالجة
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleResolve(s.id, 'dismissed')} data-testid={`button-dismiss-${s.id}`}>
                          <X className="h-4 w-4 ml-1" /> إلغاء
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!isLoading && filteredShortages?.length === 0 && (
              <TableRow>
                <TableCell colSpan={canResolve ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  لا توجد تقارير
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل نقص أو تالف</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>المنتج (اختر من القائمة أو اكتب الاسم)</Label>
              <Select value={formData.productId} onValueChange={handleProductSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر منتج..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">منتج غير مسجل / منتج آخر</SelectItem>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {formData.productId === "none" && (
              <div className="space-y-2">
                <Label>اسم المنتج</Label>
                <Input required value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} />
              </div>
            )}

            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shortage">نقص في المخزون</SelectItem>
                  <SelectItem value="damage">منتج تالف</SelectItem>
                  <SelectItem value="expired">منتهي الصلاحية</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الكمية (اختياري)</Label>
              <Input type="number" step="0.01" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createShortage.isPending}>
                تسجيل التقرير
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}