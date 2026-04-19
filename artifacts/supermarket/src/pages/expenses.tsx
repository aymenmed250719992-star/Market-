import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Plus, Trash2, Banknote, TrendingDown } from "lucide-react";
import { format } from "date-fns";

export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", month],
    queryFn: async () => {
      const res = await fetch(`/api/expenses?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
  });

  const { data: netProfit } = useQuery({
    queryKey: ["net-profit", month],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/net-profit?month=${month}`, { credentials: "include" });
      if (!res.ok) return { grossProfit: 0, totalExpenses: 0, netProfit: 0 };
      return res.json();
    },
  });

  const createExpense = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create expense");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تمت إضافة المصروف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["expenses", month] });
      queryClient.invalidateQueries({ queryKey: ["net-profit", month] });
      setIsModalOpen(false);
    }
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete expense");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تم حذف المصروف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["expenses", month] });
      queryClient.invalidateQueries({ queryKey: ["net-profit", month] });
    }
  });

  if (user?.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Banknote className="h-8 w-8" />
          إدارة المصاريف
        </h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة مصروف
        </Button>
      </div>

      <div className="flex gap-4 items-center bg-card p-4 rounded-lg border border-border w-fit">
        <Label className="font-bold whitespace-nowrap">الشهر:</Label>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-[200px]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">إجمالي الأرباح (قبل المصاريف)</p>
            <h3 className="text-2xl font-bold mt-2">{netProfit?.grossProfit || 0} دج</h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">إجمالي المصاريف</p>
            <h3 className="text-2xl font-bold mt-2 text-destructive">{netProfit?.totalExpenses || 0} دج</h3>
          </CardContent>
        </Card>
        <Card className={(netProfit?.netProfit || 0) >= 0 ? 'bg-green-500/10 border-green-500/50' : 'bg-destructive/10 border-destructive/50'}>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">صافي الربح</p>
            <h3 className={`text-2xl font-bold mt-2 ${(netProfit?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {netProfit?.netProfit || 0} دج
            </h3>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>المبلغ الإجمالي</TableHead>
              <TableHead>المبلغ اليومي</TableHead>
              <TableHead>ملاحظات</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-4">جاري التحميل...</TableCell></TableRow>
            ) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">لا توجد مصاريف لهذا الشهر</TableCell></TableRow>
            ) : expenses.map((exp: any) => (
              <TableRow key={exp.id}>
                <TableCell className="font-bold">{exp.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{exp.category}</Badge>
                </TableCell>
                <TableCell>
                  {exp.type === 'monthly' ? 'شهري' : exp.type === 'daily' ? 'يومي' : 'مرة واحدة'}
                </TableCell>
                <TableCell className="font-bold">{exp.amount} دج</TableCell>
                <TableCell className="text-muted-foreground">{exp.dailyAmount ? `${exp.dailyAmount} دج` : '-'}</TableCell>
                <TableCell>{exp.notes || '-'}</TableCell>
                <TableCell className="text-left">
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (confirm("هل أنت متأكد من حذف هذا المصروف؟")) {
                      deleteExpense.mutate(exp.id);
                    }
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateExpenseModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen}
        onSubmit={(data: any) => createExpense.mutate(data)}
        isLoading={createExpense.isPending}
        currentMonth={month}
      />
    </div>
  );
}

function CreateExpenseModal({ open, onOpenChange, onSubmit, isLoading, currentMonth }: any) {
  const [formData, setFormData] = useState({
    name: "",
    category: "إيجار",
    amount: "",
    month: currentMonth,
    type: "monthly",
    notes: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount),
      daysInMonth: new Date(new Date(formData.month).getFullYear(), new Date(formData.month).getMonth() + 1, 0).getDate()
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مصروف جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>الاسم / الوصف</Label>
            <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="مثال: إيجار المحل" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="إيجار">إيجار</SelectItem>
                  <SelectItem value="ضرائب">ضرائب</SelectItem>
                  <SelectItem value="كهرباء">كهرباء</SelectItem>
                  <SelectItem value="ماء">ماء</SelectItem>
                  <SelectItem value="رواتب">رواتب</SelectItem>
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري ثابت</SelectItem>
                  <SelectItem value="daily">يومي متكرر</SelectItem>
                  <SelectItem value="one_time">مرة واحدة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المبلغ (دج)</Label>
              <Input type="number" required min="0" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Input type="month" required value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading}>إضافة</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
