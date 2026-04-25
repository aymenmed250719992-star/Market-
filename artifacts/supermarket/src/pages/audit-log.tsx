import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, RefreshCw } from "lucide-react";
import { PaginationBar } from "@/components/pagination-bar";

type AuditEntry = {
  id: number;
  action: string;
  entity: string;
  entityId?: string | number | null;
  details?: Record<string, any> | null;
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  ip?: string | null;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  redeem: "استبدال",
  export: "تصدير",
  import: "استيراد",
};

const entityLabels: Record<string, string> = {
  sale: "بيع",
  return: "إرجاع",
  loyalty: "نقاط ولاء",
  backup: "نسخة احتياطية",
  product: "منتج",
  customer: "زبون",
  user: "مستخدم",
};

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const total = logs.length;
  const pageRows = useMemo(
    () => logs.slice((page - 1) * pageSize, page * pageSize),
    [logs, page, pageSize],
  );

  useEffect(() => { setPage(1); }, [filterEntity, filterAction]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEntity) params.set("entity", filterEntity);
      if (filterAction) params.set("action", filterAction);
      const res = await fetch(`/api/audit?${params.toString()}`, { credentials: "include" });
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterEntity, filterAction]);

  if (user?.role !== "admin") {
    return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة للأدمن فقط</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ScrollText className="h-8 w-8" />
          سجل التدقيق
        </h1>
        <Button variant="outline" onClick={load} data-testid="button-refresh-audit">
          <RefreshCw className="ml-2 h-4 w-4" /> تحديث
        </Button>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>الكيان</Label>
          <select
            className="w-full bg-background border border-border rounded-md p-2"
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            data-testid="select-entity"
          >
            <option value="">الكل</option>
            <option value="sale">بيع</option>
            <option value="return">إرجاع</option>
            <option value="loyalty">نقاط ولاء</option>
            <option value="backup">نسخة احتياطية</option>
            <option value="product">منتج</option>
            <option value="customer">زبون</option>
            <option value="user">مستخدم</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>الإجراء</Label>
          <select
            className="w-full bg-background border border-border rounded-md p-2"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            data-testid="select-action"
          >
            <option value="">الكل</option>
            <option value="create">إنشاء</option>
            <option value="update">تعديل</option>
            <option value="delete">حذف</option>
            <option value="redeem">استبدال</option>
            <option value="export">تصدير</option>
            <option value="import">استيراد</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>المستخدم</TableHead>
              <TableHead>الإجراء</TableHead>
              <TableHead>الكيان</TableHead>
              <TableHead>المعرف</TableHead>
              <TableHead>التفاصيل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  لا يوجد سجلات
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((log) => (
                <TableRow key={log.id} data-testid={`audit-row-${log.id}`}>
                  <TableCell dir="ltr" className="text-right text-xs">{new Date(log.createdAt).toLocaleString("ar-DZ")}</TableCell>
                  <TableCell>
                    <div className="font-bold">{log.userName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{log.userRole}</div>
                  </TableCell>
                  <TableCell>
                    <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">
                      {actionLabels[log.action] ?? log.action}
                    </span>
                  </TableCell>
                  <TableCell>{entityLabels[log.entity] ?? log.entity}</TableCell>
                  <TableCell className="text-xs">{log.entityId ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-md">
                    {log.details ? (
                      <code className="block bg-muted p-2 rounded text-xs whitespace-pre-wrap break-all">
                        {JSON.stringify(log.details, null, 0)}
                      </code>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && total > 0 && (
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
