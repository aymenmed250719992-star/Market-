import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListSalaries, useCreateSalaryRecord, useListUsers, getListSalariesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Salaries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentMonth = format(new Date(), "yyyy-MM");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  
  const { data: salaries, isLoading: salariesLoading } = useListSalaries({ month: selectedMonth });
  const { data: users, isLoading: usersLoading } = useListUsers();
  
  const createSalary = useCreateSalaryRecord();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    month: currentMonth,
    baseSalary: "",
    bonus: "0",
    deduction: "0",
    paid: true,
    notes: ""
  });

  const handleUserSelect = (userId: string) => {
    const selectedUser = users?.find(u => u.id.toString() === userId);
    setFormData({
      ...formData,
      userId,
      baseSalary: selectedUser?.baseSalary?.toString() || "0"
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSalary.mutateAsync({
        data: {
          userId: parseInt(formData.userId),
          month: formData.month,
          baseSalary: parseFloat(formData.baseSalary),
          bonus: parseFloat(formData.bonus) || 0,
          deduction: parseFloat(formData.deduction) || 0,
          paid: formData.paid,
          notes: formData.notes || null
        }
      });
      toast({ title: "تمت الإضافة", description: "تم تسجيل الراتب بنجاح" });
      queryClient.invalidateQueries({ queryKey: getListSalariesQueryKey() });
      setIsModalOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const netSalary = parseFloat(formData.baseSalary || "0") + parseFloat(formData.bonus || "0") - parseFloat(formData.deduction || "0");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Banknote className="h-8 w-8" />
          سجل الرواتب
        </h1>
        <Button onClick={() => setIsModalOpen(true)} data-testid="button-add-salary">
          <Plus className="ml-2 h-4 w-4" /> تسجيل راتب
        </Button>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border flex items-center gap-4">
        <Label className="whitespace-nowrap">شهر الراتب:</Label>
        <Input 
          type="month" 
          value={selectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)} 
          className="max-w-[200px]"
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الموظف</TableHead>
              <TableHead>الشهر</TableHead>
              <TableHead>الراتب الأساسي</TableHead>
              <TableHead>المكافآت</TableHead>
              <TableHead>الخصومات</TableHead>
              <TableHead>الصافي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>تاريخ الدفع</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salariesLoading ? (
              [1,2,3].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : salaries?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-bold">{s.userName}</TableCell>
                <TableCell>{s.month}</TableCell>
                <TableCell>{s.baseSalary} دج</TableCell>
                <TableCell className="text-primary">{s.bonus > 0 ? `+${s.bonus}` : '-'} دج</TableCell>
                <TableCell className="text-destructive">{s.deduction > 0 ? `-${s.deduction}` : '-'} دج</TableCell>
                <TableCell className="font-bold">{s.netSalary} دج</TableCell>
                <TableCell>
                  {s.paid ? (
                    <span className="text-primary bg-primary/10 px-2 py-1 rounded text-xs font-bold">مدفوع</span>
                  ) : (
                    <span className="text-destructive bg-destructive/10 px-2 py-1 rounded text-xs font-bold">غير مدفوع</span>
                  )}
                </TableCell>
                <TableCell>{s.paidAt ? format(new Date(s.paidAt), "yyyy/MM/dd") : '-'}</TableCell>
              </TableRow>
            ))}
            {!salariesLoading && salaries?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  لا توجد رواتب مسجلة لهذا الشهر
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل راتب جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>الموظف</Label>
              <Select required value={formData.userId} onValueChange={handleUserSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  {users?.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الشهر</Label>
                <Input required type="month" value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>الراتب الأساسي (دج)</Label>
                <Input required type="number" value={formData.baseSalary} onChange={e => setFormData({...formData, baseSalary: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>مكافآت (دج)</Label>
                <Input type="number" value={formData.bonus} onChange={e => setFormData({...formData, bonus: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>خصومات (دج)</Label>
                <Input type="number" value={formData.deduction} onChange={e => setFormData({...formData, deduction: e.target.value})} />
              </div>
            </div>

            <div className="bg-muted p-4 rounded-md flex justify-between items-center text-lg">
              <span>الصافي:</span>
              <span className="font-bold">{isNaN(netSalary) ? 0 : netSalary} دج</span>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createSalary.isPending}>
                تسجيل
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}