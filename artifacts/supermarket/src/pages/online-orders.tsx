import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag } from "lucide-react";
import { format } from "date-fns";
import { PaginationBar } from "@/components/pagination-bar";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "حدث خطأ");
  return data;
}

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  preparing: "قيد التحضير",
  delivering: "قيد التوصيل",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export default function OnlineOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({ queryKey: ["online-orders"], queryFn: () => fetchJson<any[]>("/api/online-orders") });
  const { data: users = [] } = useQuery({ queryKey: ["users-for-distributors"], queryFn: () => fetchJson<any[]>("/api/users") });
  const distributors = users.filter((user) => user.role === "distributor");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const total = orders.length;
  const pageRows = useMemo(
    () => orders.slice((page - 1) * pageSize, page * pageSize),
    [orders, page, pageSize],
  );

  const updateOrder = async (id: number, payload: Record<string, unknown>) => {
    try {
      await fetchJson(`/api/online-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      queryClient.invalidateQueries({ queryKey: ["online-orders"] });
      toast({ title: "تم التحديث", description: "تم تحديث الطلب بنجاح" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShoppingBag className="h-8 w-8" />
          طلبات الإنترنت
        </h1>
        <a href="/customer" target="_blank" rel="noreferrer">
          <Button variant="outline">فتح واجهة الزبون</Button>
        </a>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الطلب</TableHead>
              <TableHead>الزبون</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>المنتجات</TableHead>
              <TableHead>الدفع</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الموزع</TableHead>
              <TableHead>التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8">جاري التحميل...</TableCell></TableRow>
            ) : pageRows.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-bold">#{order.id}</TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell dir="ltr" className="text-right">{order.phone}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {order.items?.map((item: any) => (
                      <div key={`${order.id}-${item.productId}`} className="text-sm">{item.productName} × {item.quantity}</div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{order.paymentMethod === "cash_on_delivery" ? "عند الاستلام" : order.paymentMethod === "store_pickup" ? "من المتجر" : "كرني"}</TableCell>
                <TableCell>{order.total} دج</TableCell>
                <TableCell>
                  <Select value={order.status} onValueChange={(status) => updateOrder(order.id, { status })}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={order.assignedDistributorId?.toString() || "none"} onValueChange={(value) => updateOrder(order.id, { assignedDistributorId: value === "none" ? null : parseInt(value, 10) })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون موزع</SelectItem>
                      {distributors.map((distributor) => <SelectItem key={distributor.id} value={distributor.id.toString()}>{distributor.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}</TableCell>
              </TableRow>
            ))}
            {!isLoading && orders.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد طلبات بعد</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {!isLoading && total > 0 && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
}