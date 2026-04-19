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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserMinus, Plus, Trash2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { format } from "date-fns";

export default function Advances() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [activeTab, setActiveTab] = useState("advances");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: advances = [], isLoading: advancesLoading } = useQuery({
    queryKey: ["advances", month],
    queryFn: async () => {
      const res = await fetch(`/api/advances?month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch advances");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const createAdvance = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create advance");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تمت الإضافة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["advances", month] });
      setIsModalOpen(false);
    }
  });

  const markDeducted = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/advances/${id}/mark-deducted`, {
        method: "PATCH",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تم خصم المبلغ من الراتب" });
      queryClient.invalidateQueries({ queryKey: ["advances", month] });
    }
  });

  const deleteAdvance = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/advances/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تم الحذف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["advances", month] });
    }
  });

  if (user?.role !== "admin") return null;

  const filteredAdvances = advances.filter((a: any) => activeTab === 'advances' ? a.type === 'advance' : a.type === 'penalty');

  const employeeSummaries = advances.reduce((acc: any, a: any) => {
    if (!acc[a.employeeId]) {
      acc[a.employeeId] = {
        name: a.employeeName,
        totalAdvances: 0,
        totalPenalties: 0,
        netDeduction: 0
      };
    }
    if (a.type === 'advance') {
      acc[a.employeeId].totalAdvances += a.amount;
      acc[a.employeeId].netDeduction += a.amount;
    } else {
      acc[a.employeeId].totalPenalties += a.amount;
      acc[a.employeeId].netDeduction += a.amount;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UserMinus className="h-8 w-8" />
          التسبقات والخصومات
        </h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة
        </Button>
      </div>

      <div className="flex gap-4 items-center bg-card p-4 rounded-lg border border-border w-fit">
        <Label className="font-bold whitespace-nowrap">الشهر:</Label>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-[200px]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.values(employeeSummaries).map((summary: any, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-md flex items-center gap-2">
                <Users className="h-4 w-4" />
                {summary.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">تسبقات:</span>
                <span className="font-bold text-orange-500">{summary.totalAdvances} دج</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">خصومات:</span>
                <span className="font-bold text-destructive">{summary.totalPenalties} دج</span>
              </div>
              <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                <span>إجمالي الخصم:</span>
                <span>{summary.netDeduction} دج</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {Object.keys(employeeSummaries).length === 0 && !advancesLoading && (
          <div className="text-muted-foreground col-span-full">لا توجد سجلات لهذا الشهر</div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="advances">التسبقات (Avance)</TabsTrigger>
          <TabsTrigger value="penalties">الخصومات (Pénalité)</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>المبلغ (دج)</TableHead>
                  <TableHead>السبب</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>حالة الخصم من الراتب</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advancesLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4">جاري التحميل...</TableCell></TableRow>
                ) : filteredAdvances.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">لا توجد سجلات</TableCell></TableRow>
                ) : filteredAdvances.map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-bold">{record.employeeName}</TableCell>
                    <TableCell className={`font-bold ${record.type === 'penalty' ? 'text-destructive' : 'text-orange-500'}`}>
                      {record.amount} دج
                    </TableCell>
                    <TableCell>{record.reason}</TableCell>
                    <TableCell>{format(new Date(record.createdAt), "yyyy/MM/dd")}</TableCell>
                    <TableCell>
                      {record.deductedFromPayroll ? (
                        <Badge className="bg-green-500 text-white">تم الخصم</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">معلق</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex justify-end gap-2">
                        {!record.deductedFromPayroll && (
                          <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => {
                            if (confirm("هل تم خصم هذا المبلغ من راتب الموظف؟")) {
                              markDeducted.mutate(record.id);
                            }
                          }}>
                            <CheckCircle2 className="h-4 w-4 ml-1" /> تم الخصم
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm("هل أنت متأكد من الحذف؟")) {
                            deleteAdvance.mutate(record.id);
                          }
                        }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Tabs>

      <CreateAdvanceModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={(data: any) => createAdvance.mutate(data)}
        isLoading={createAdvance.isPending}
        users={users}
        currentMonth={month}
      />
    </div>
  );
}

function CreateAdvanceModal({ open, onOpenChange, onSubmit, isLoading, users, currentMonth }: any) {
  const [formData, setFormData] = useState({
    employeeId: "",
    type: "advance",
    amount: "",
    reason: "",
    month: currentMonth
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      employeeId: parseInt(formData.employeeId),
      amount: parseFloat(formData.amount)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة تسبقة أو خصم</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>الموظف</Label>
            <Select value={formData.employeeId} onValueChange={v => setFormData({...formData, employeeId: v})} required>
              <SelectTrigger><SelectValue placeholder="اختر الموظف..." /></SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">تسبقة (Avance)</SelectItem>
                  <SelectItem value="penalty">خصم (Pénalité)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المبلغ (دج)</Label>
              <Input type="number" required min="1" step="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>السبب / الوصف</Label>
            <Input required value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} placeholder="مثال: غياب، طلب سلفة..." />
          </div>
          <div className="space-y-2">
            <Label>شهر الاستحقاق</Label>
            <Input type="month" required value={formData.month} onChange={e => setFormData({...formData, month: e.target.value})} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading || !formData.employeeId}>إضافة</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
