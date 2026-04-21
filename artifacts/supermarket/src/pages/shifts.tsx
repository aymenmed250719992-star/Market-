import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListUsers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, TrendingDown, TrendingUp, Plus, LockKeyhole } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Shift {
  id: number;
  cashierId: number;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  status: 'open' | 'closed';
  startingFloat: number;
  closingCash: number | null;
  systemTotal: number | null;
  deficit: number | null;
  totalSales: number;
}

export default function Shifts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cashierFilter, setCashierFilter] = useState<string>("all");

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ["shifts"],
    queryFn: async () => {
      const res = await fetch("/api/shifts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
  });

  const { data: users = [] } = useListUsers();
  const cashierUsers = users.filter((u: any) => u.role === "cashier");

  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [openCashierId, setOpenCashierId] = useState<string>("");
  const [openStartingFloat, setOpenStartingFloat] = useState<string>("0");
  const [submitting, setSubmitting] = useState(false);

  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closeShiftId, setCloseShiftId] = useState<number | null>(null);
  const [closeCash, setCloseCash] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openCashierId) {
      toast({ variant: "destructive", title: "خطأ", description: "اختر القابض" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/shifts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cashierId: parseInt(openCashierId, 10),
          startingFloat: parseFloat(openStartingFloat || "0"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "تعذّر فتح الوردية");
      toast({ title: "تم فتح الوردية", description: `الوردية #${body.shift?.id} مفتوحة باسم ${body.user?.name}` });
      setOpenModalVisible(false);
      setOpenCashierId("");
      setOpenStartingFloat("0");
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (closeShiftId == null) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shiftId: closeShiftId,
          closingCash: parseFloat(closeCash || "0"),
          notes: closeNotes || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "تعذّر إغلاق الوردية");
      toast({ title: "تم إغلاق الوردية", description: `الوردية #${closeShiftId} مغلقة` });
      setCloseModalVisible(false);
      setCloseShiftId(null);
      setCloseCash("");
      setCloseNotes("");
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredShifts = shifts.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (cashierFilter !== "all" && s.cashierId.toString() !== cashierFilter) return false;
    return true;
  });

  const cashiers = Array.from(new Set(shifts.map(s => JSON.stringify({ id: s.cashierId, name: s.cashierName })))).map(s => JSON.parse(s));

  const totalOpenShifts = shifts.filter(s => s.status === 'open').length;
  const todayShifts = shifts.filter(s => new Date(s.openedAt).toDateString() === new Date().toDateString());
  const totalDeficit = todayShifts.reduce((sum, s) => sum + (s.deficit && s.deficit < 0 ? Math.abs(s.deficit) : 0), 0);
  const totalSurplus = todayShifts.reduce((sum, s) => sum + (s.deficit && s.deficit > 0 ? s.deficit : 0), 0);

  if (user?.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="h-8 w-8" />
          إدارة الورديات
        </h1>
        <Button onClick={() => setOpenModalVisible(true)} data-testid="button-open-shift">
          <Plus className="ml-2 h-4 w-4" /> فتح وردية لقابض
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">ورديات مفتوحة</p>
              <h3 className="text-2xl font-bold mt-2">{totalOpenShifts}</h3>
            </div>
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">عجز اليوم (ناقص)</p>
              <h3 className="text-2xl font-bold mt-2 text-destructive">{totalDeficit} دج</h3>
            </div>
            <div className="p-3 rounded-full bg-destructive/10 text-destructive">
              <TrendingDown className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">فائض اليوم (زائد)</p>
              <h3 className="text-2xl font-bold mt-2 text-green-600">{totalSurplus} دج</h3>
            </div>
            <div className="p-3 rounded-full bg-green-100 text-green-600 dark:bg-green-900/20">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 bg-card p-4 rounded-lg border border-border">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="open">مفتوحة</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cashierFilter} onValueChange={setCashierFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="القابض" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل القابضين</SelectItem>
            {cashiers.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الوردية</TableHead>
              <TableHead>القابض</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>وقت الفتح</TableHead>
              <TableHead>وقت الإغلاق</TableHead>
              <TableHead>الصندوق (فتح)</TableHead>
              <TableHead>مبيعات النظام</TableHead>
              <TableHead>الصندوق (إغلاق)</TableHead>
              <TableHead>عجز / فائض</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-4">جاري التحميل...</TableCell></TableRow>
            ) : filteredShifts.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-4 text-muted-foreground">لا توجد ورديات</TableCell></TableRow>
            ) : filteredShifts.map((shift) => (
              <TableRow key={shift.id}>
                <TableCell className="font-mono">#{shift.id}</TableCell>
                <TableCell className="font-bold">{shift.cashierName}</TableCell>
                <TableCell>
                  <Badge variant={shift.status === 'open' ? 'default' : 'secondary'} className={shift.status === 'open' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}>
                    {shift.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                  </Badge>
                </TableCell>
                <TableCell dir="ltr" className="text-right">{format(new Date(shift.openedAt), "yyyy/MM/dd HH:mm")}</TableCell>
                <TableCell dir="ltr" className="text-right">{shift.closedAt ? format(new Date(shift.closedAt), "yyyy/MM/dd HH:mm") : '-'}</TableCell>
                <TableCell>{shift.startingFloat} دج</TableCell>
                <TableCell>{shift.systemTotal !== null ? `${shift.systemTotal} دج` : '-'}</TableCell>
                <TableCell>{shift.closingCash !== null ? `${shift.closingCash} دج` : '-'}</TableCell>
                <TableCell>
                  {shift.deficit !== null ? (
                    <span className={`font-bold ${shift.deficit > 0 ? 'text-green-600' : shift.deficit < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {shift.deficit > 0 ? '+' : ''}{shift.deficit} دج
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-left">
                  {shift.status === 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setCloseShiftId(shift.id); setCloseCash(""); setCloseNotes(""); setCloseModalVisible(true); }}
                      data-testid={`button-close-shift-${shift.id}`}
                    >
                      <LockKeyhole className="ml-1 h-3 w-3" /> إغلاق
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openModalVisible} onOpenChange={setOpenModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>فتح وردية لقابض</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOpenShift} className="space-y-4">
            <div className="space-y-2">
              <Label>القابض</Label>
              <Select value={openCashierId} onValueChange={setOpenCashierId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر القابض" />
                </SelectTrigger>
                <SelectContent>
                  {cashierUsers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">لا يوجد موظفون بدور قابض</div>
                  ) : cashierUsers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الصندوق الافتتاحي (دج)</Label>
              <Input type="number" step="0.01" value={openStartingFloat} onChange={(e) => setOpenStartingFloat(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenModalVisible(false)}>إلغاء</Button>
              <Button type="submit" disabled={submitting}>فتح الوردية</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeModalVisible} onOpenChange={setCloseModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إغلاق الوردية #{closeShiftId}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCloseShift} className="space-y-4">
            <div className="space-y-2">
              <Label>الصندوق المغلق (دج)</Label>
              <Input required type="number" step="0.01" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} />
              <p className="text-xs text-muted-foreground">سيتم احتساب العجز/الفائض تلقائياً مقارنة بمبيعات النقد + الصندوق الافتتاحي.</p>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات (اختياري)</Label>
              <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseModalVisible(false)}>إلغاء</Button>
              <Button type="submit" disabled={submitting}>تأكيد الإغلاق</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
