import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";

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
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Clock className="h-8 w-8" />
        إدارة الورديات
      </h1>

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
            <SelectValue placeholder="الكاشير" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الكاشير</SelectItem>
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
              <TableHead>الكاشير</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>وقت الفتح</TableHead>
              <TableHead>وقت الإغلاق</TableHead>
              <TableHead>الصندوق (فتح)</TableHead>
              <TableHead>مبيعات النظام</TableHead>
              <TableHead>الصندوق (إغلاق)</TableHead>
              <TableHead>عجز / فائض</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-4">جاري التحميل...</TableCell></TableRow>
            ) : filteredShifts.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-4 text-muted-foreground">لا توجد ورديات</TableCell></TableRow>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
