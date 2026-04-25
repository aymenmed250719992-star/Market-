import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListSales, useListUsers, useListCustomers } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Banknote, ShoppingCart, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/pagination-bar";

export default function Reports() {
  const { user } = useAuth();
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashierId, setCashierId] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const { data: sales, isLoading: salesLoading } = useListSales({
    from: dateFrom || undefined,
    to: dateTo || undefined,
    cashierId: cashierId !== "all" ? parseInt(cashierId) : undefined,
    customerId: customerId !== "all" ? parseInt(customerId) : undefined,
  });

  const { data: cashiers } = useListUsers();
  const { data: customers } = useListCustomers();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const total = sales?.length || 0;
  const pageRows = useMemo(
    () => (sales || []).slice((page - 1) * pageSize, page * pageSize),
    [sales, page, pageSize],
  );
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, cashierId, customerId]);

  const totalRevenue = sales?.reduce((sum, sale) => sum + sale.total, 0) || 0;
  const totalDiscount = sales?.reduce((sum, sale) => sum + sale.discount, 0) || 0;
  const karniSales = sales?.filter(s => s.paymentMethod === 'karni').reduce((sum, s) => sum + s.total, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-8 w-8" />
          تقارير المبيعات
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" /> إجمالي المداخيل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalRevenue} دج</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> عدد العمليات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sales?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> مبيعات الكرني
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{karniSales} دج</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">إجمالي التخفيضات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{totalDiscount} دج</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {user?.role === 'admin' && (
          <div className="space-y-2">
            <Label>القابض</Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر القابض" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {cashiers?.filter(c => c.role === 'cashier' || c.role === 'admin').map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>الزبون</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الزبون" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {customers?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>القابض</TableHead>
              <TableHead>الزبون</TableHead>
              <TableHead>طريقة الدفع</TableHead>
              <TableHead>التخفيض</TableHead>
              <TableHead>الإجمالي (دج)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salesLoading ? (
              [1,2,3,4,5].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : pageRows.map((sale) => (
              <TableRow key={sale.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedSale(sale)}>
                <TableCell>#{sale.id}</TableCell>
                <TableCell>{format(new Date(sale.createdAt), "yyyy/MM/dd HH:mm")}</TableCell>
                <TableCell>{sale.cashierName}</TableCell>
                <TableCell>{sale.customerName || '-'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    sale.paymentMethod === 'cash' ? 'bg-primary/20 text-primary' :
                    sale.paymentMethod === 'karni' ? 'bg-destructive/20 text-destructive' :
                    'bg-secondary text-secondary-foreground'
                  }`}>
                    {sale.paymentMethod === 'cash' ? 'نقداً' : sale.paymentMethod === 'karni' ? 'كرني' : 'محلي'}
                  </span>
                </TableCell>
                <TableCell className="text-destructive">{sale.discount > 0 ? `-${sale.discount}` : '-'}</TableCell>
                <TableCell className="font-bold">{sale.total}</TableCell>
              </TableRow>
            ))}
            {!salesLoading && sales?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  لا توجد مبيعات في هذه الفترة
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!salesLoading && total > 0 && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      <Dialog open={!!selectedSale} onOpenChange={(open) => !open && setSelectedSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل البيع #{selectedSale?.id}</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4 mt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">التاريخ:</span>
                <span className="font-bold">{format(new Date(selectedSale.createdAt), "yyyy/MM/dd HH:mm")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">القابض:</span>
                <span className="font-bold">{selectedSale.cashierName}</span>
              </div>
              {selectedSale.customerName && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الزبون:</span>
                  <span className="font-bold">{selectedSale.customerName}</span>
                </div>
              )}
              
              <div className="border-t border-b border-border py-4 my-4 space-y-2">
                <div className="font-bold mb-2">المنتجات:</div>
                {selectedSale.items.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <div>
                      <span>{item.productName}</span>
                      <span className="text-muted-foreground mx-2">({item.quantity} {item.unit} × {item.price})</span>
                    </div>
                    <span className="font-bold">{item.subtotal} دج</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">المجموع الفرعي:</span>
                  <span>{selectedSale.subtotal} دج</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>التخفيض:</span>
                    <span>- {selectedSale.discount} دج</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-primary mt-2">
                  <span>الإجمالي:</span>
                  <span>{selectedSale.total} دج</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}