import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, FileText } from "lucide-react";

export default function EndOfDay() {
  const [data, setData] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async (d: string) => {
    const [dash, alerts] = await Promise.all([
      fetch(`/api/dashboard?date=${d}`, { credentials: "include" }).then((r) => r.ok ? r.json() : {}),
      fetch(`/api/alerts`, { credentials: "include" }).then((r) => r.ok ? r.json() : { summary: {} }),
    ]);
    setData({ dash, alerts: alerts.summary, date: d });
  };

  useEffect(() => { load(date); }, [date]);

  return (
    <div className="space-y-6 print:p-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" /> تقرير نهاية اليوم
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-muted/40 border border-border rounded-md px-3 py-2 text-sm"
          />
          <Button onClick={() => window.print()} data-testid="button-print-eod">
            <Printer className="ml-2 h-4 w-4" /> طباعة / حفظ PDF
          </Button>
        </div>
      </div>

      <div className="bg-white text-black p-8 rounded-lg shadow print:shadow-none print:bg-white" id="eod-report">
        <header className="border-b-2 border-black pb-4 mb-6">
          <h2 className="text-3xl font-extrabold text-center">تقرير نهاية اليوم</h2>
          <div className="text-center text-sm mt-2">{new Date(date).toLocaleDateString("ar-DZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </header>

        {!data && <div className="text-center py-12">جاري التحميل...</div>}

        {data && (
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2">المبيعات</h3>
              <div className="grid grid-cols-2 gap-3">
                <Row label="عدد الفواتير" value={data.dash?.salesCount ?? 0} />
                <Row label="إجمالي الإيراد" value={`${Math.round(Number(data.dash?.totalRevenue ?? 0))} دج`} />
                <Row label="صافي الربح" value={`${Math.round(Number(data.dash?.totalProfit ?? 0))} دج`} />
                <Row label="متوسط الفاتورة" value={`${Math.round(Number(data.dash?.avgSale ?? 0))} دج`} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2">المخزون</h3>
              <div className="grid grid-cols-2 gap-3">
                <Row label="منتجات نافدة" value={data.alerts?.outOfStock ?? 0} />
                <Row label="منتجات منخفضة على الرف" value={data.alerts?.lowShelf ?? 0} />
                <Row label="صلاحية قريبة (30 يوم)" value={data.alerts?.expiringSoon ?? 0} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2">العمليات</h3>
              <div className="grid grid-cols-2 gap-3">
                <Row label="مهام معلّقة" value={data.alerts?.pendingTasks ?? 0} />
                <Row label="ورديات مفتوحة" value={data.alerts?.openShifts ?? 0} />
                <Row label="عجز/تلف اليوم" value={data.alerts?.todayShortages ?? 0} />
                <Row label="طلبيات أونلاين تنتظر" value={data.alerts?.pendingOrders ?? 0} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2">الحسابات الجارية</h3>
              <div className="grid grid-cols-2 gap-3">
                <Row label="زبائن عليهم دين" value={data.alerts?.debtCustomers ?? 0} />
                <Row label="إجمالي الديون" value={`${data.alerts?.totalDebt ?? 0} دج`} />
              </div>
            </section>

            <footer className="pt-6 mt-8 border-t border-gray-300 text-xs text-center text-gray-600">
              تقرير مولّد آلياً من نظام إدارة السوبرماركت — {new Date().toLocaleString("ar-DZ")}
            </footer>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #eod-report, #eod-report * { visibility: visible; }
          #eod-report { position: absolute; inset: 0; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between border-b border-dotted border-gray-300 py-1">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
