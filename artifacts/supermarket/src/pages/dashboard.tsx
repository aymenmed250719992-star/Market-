import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetSalesChart, useGetTopProducts, useGetExpiringProducts, useListProducts, useListShortages, useListSales } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Package, AlertTriangle, Banknote, Users, ShoppingCart, TrendingUp, Clock, Warehouse } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">لوحة القيادة</h1>
      
      {user.role === "admin" && <AdminDashboard />}
      {user.role === "cashier" && <CashierDashboard />}
      {(user.role === "worker" || user.role === "buyer") && <WorkerDashboard />}
    </div>
  );
}

function AdminDashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: chartData, isLoading: chartLoading } = useGetSalesChart();
  const { data: topProducts, isLoading: topProductsLoading } = useGetTopProducts();
  const { data: expiringProducts, isLoading: expiringLoading } = useGetExpiringProducts();

  if (summaryLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="مبيعات اليوم" value={`${summary?.todayRevenue ?? 0} دج`} icon={Banknote} gradient="from-emerald-500/20 to-transparent" />
        <SummaryCard title="صافي ربح الشهر" value={`${(summary as any)?.monthNetProfit ?? 0} دج`} icon={TrendingUp} gradient="from-blue-500/20 to-transparent" />
        <SummaryCard title="نواقص معلقة" value={summary?.pendingShortages ?? 0} icon={AlertTriangle} alert={(summary?.pendingShortages ?? 0) > 0} gradient="from-red-500/20 to-transparent" />
        <SummaryCard title="منتجات تنتهي قريباً" value={summary?.expiringCount ?? 0} icon={Clock} alert={(summary?.expiringCount ?? 0) > 0} gradient="from-amber-500/20 to-transparent" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <SummaryCard 
          title="صافي الربح اليومي" 
          value={`${(summary as any)?.todayNetProfit ?? 0} دج`} 
          icon={TrendingUp} 
          alert={(summary as any)?.todayNetProfit < 0}
          className={(summary as any)?.todayNetProfit >= 0 ? "border-green-500/50 bg-green-500/5" : ""} 
          iconClassName={(summary as any)?.todayNetProfit >= 0 ? "text-green-600 bg-green-100" : ""}
        />
        <SummaryCard 
          title="رفوف منخفضة" 
          value={(summary as any)?.lowStockCount ?? 0} 
          icon={Warehouse} 
          alert={((summary as any)?.lowStockCount ?? 0) > 0}
          className="border-orange-500/50 bg-orange-500/5"
          iconClassName="text-orange-600 bg-orange-100"
        />
        <SummaryCard 
          title="ربح شهري إجمالي" 
          value={`${(summary as any)?.monthGrossProfit ?? 0} دج`} 
          icon={TrendingUp} 
        />
        <SummaryCard 
          title="مصاريف الشهر" 
          value={`${(summary as any)?.monthTotalExpenses ?? 0} دج`} 
          icon={Banknote} 
          className="border-amber-500/50 bg-amber-500/5"
          iconClassName="text-amber-600 bg-amber-100"
        />
        <SummaryCard title="ديون الكرني" value={`${(summary as any)?.totalDebt ?? 0} دج`} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>المبيعات والأرباح (7 أيام)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {chartLoading ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                <Area type="monotone" dataKey="revenue" name="المداخيل" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="profit" name="الربح الخام" stroke="hsl(var(--accent))" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المنتجات الأكثر مبيعاً</CardTitle>
          </CardHeader>
          <CardContent>
            {topProductsLoading ? <Skeleton className="w-full h-[300px]" /> : (
              <div className="space-y-4">
                {topProducts?.map(p => (
                  <div key={p.productId} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{p.productName}</div>
                      <div className="text-sm text-muted-foreground">{p.totalSold} وحدة</div>
                    </div>
                    <div className="font-bold text-primary">{p.revenue} دج</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CashierDashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: sales, isLoading: salesLoading } = useListSales({ cashierId: user?.id });

  if (summaryLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="مبيعات اليوم" value={`${summary?.todayRevenue ?? 0} دج`} icon={Banknote} />
        <SummaryCard title="عدد العمليات" value={summary?.todaySales ?? 0} icon={ShoppingCart} />
        <SummaryCard title="الكرني الإجمالي" value={`${summary?.totalDebt ?? 0} دج`} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>آخر المبيعات</CardTitle>
        </CardHeader>
        <CardContent>
          {salesLoading ? <Skeleton className="w-full h-[200px]" /> : (
            <div className="space-y-4">
              {sales?.slice(0, 5).map(s => (
                <div key={s.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{format(new Date(s.createdAt), "HH:mm - yyyy/MM/dd")}</div>
                    <div className="text-sm text-muted-foreground">{s.paymentMethod === 'cash' ? 'نقداً' : s.paymentMethod === 'karni' ? 'كرني' : 'محلي'}</div>
                  </div>
                  <div className="font-bold">{s.total} دج</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkerDashboard() {
  const { data: shortages, isLoading: shortagesLoading } = useListShortages();
  const { data: products, isLoading: productsLoading } = useListProducts({ lowStock: true });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            نواقص بانتظار المعالجة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shortagesLoading ? <Skeleton className="w-full h-[200px]" /> : (
            <div className="space-y-4">
              {shortages?.filter(s => s.status === 'pending').map(s => (
                <div key={s.id} className="border-b border-border pb-2 last:border-0">
                  <div className="font-medium">{s.productName}</div>
                  <div className="text-sm text-muted-foreground">الكمية: {s.quantity}</div>
                </div>
              ))}
              {shortages?.filter(s => s.status === 'pending').length === 0 && (
                <div className="text-muted-foreground">لا توجد نواقص معلقة</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-accent flex items-center gap-2">
            <Package className="h-5 w-5" />
            منتجات منخفضة المخزون
          </CardTitle>
        </CardHeader>
        <CardContent>
          {productsLoading ? <Skeleton className="w-full h-[200px]" /> : (
            <div className="space-y-4">
              {products?.map(p => (
                <div key={p.id} className="flex justify-between border-b border-border pb-2 last:border-0">
                  <div className="font-medium">{p.name}</div>
                  <div className={`font-bold ${p.stock === 0 ? 'text-destructive' : 'text-accent'}`}>{p.stock} {p.unit}</div>
                </div>
              ))}
              {products?.length === 0 && (
                <div className="text-muted-foreground">المخزون جيد</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, alert = false, className = "", iconClassName = "", gradient = "" }: { title: string, value: string | number, icon: any, alert?: boolean, className?: string, iconClassName?: string, gradient?: string }) {
  return (
    <Card className={`overflow-hidden ${alert ? "border-destructive/50 bg-destructive/5" : ""} ${className}`}>
      {gradient && <div className={`h-1 bg-gradient-to-l ${gradient}`} />}
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className={`text-2xl font-bold mt-2 ${alert ? "text-destructive" : ""}`}>{value}</h3>
        </div>
        <div className={`p-3 rounded-full ${alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"} ${iconClassName}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[120px] w-full" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-[400px] w-full md:col-span-2" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}