import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { InstallPrompt } from "@/components/install-prompt";
import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";

// Eager (entry pages, light)
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

// Lazy-loaded route pages — loaded on demand for faster initial paint
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Products = lazy(() => import("@/pages/products"));
const POS = lazy(() => import("@/pages/pos"));
const Customers = lazy(() => import("@/pages/customers"));
const Employees = lazy(() => import("@/pages/employees"));
const Salaries = lazy(() => import("@/pages/salaries"));
const Shortages = lazy(() => import("@/pages/shortages"));
const Reports = lazy(() => import("@/pages/reports"));
const Shifts = lazy(() => import("@/pages/shifts"));
const Tasks = lazy(() => import("@/pages/tasks"));
const Expenses = lazy(() => import("@/pages/expenses"));
const Advances = lazy(() => import("@/pages/advances"));
const CustomerPortal = lazy(() => import("@/pages/customer-portal"));
const Register = lazy(() => import("@/pages/register"));
const OnlineOrders = lazy(() => import("@/pages/online-orders"));
const DistributorPortal = lazy(() => import("@/pages/distributor-portal"));
const AuditLog = lazy(() => import("@/pages/audit-log"));
const Backup = lazy(() => import("@/pages/backup"));
const Returns = lazy(() => import("@/pages/returns"));
const Analytics = lazy(() => import("@/pages/analytics"));
const PriceSuggestions = lazy(() => import("@/pages/price-suggestions"));
const StockoutPrediction = lazy(() => import("@/pages/stockout-prediction"));
const AutoCategorize = lazy(() => import("@/pages/auto-categorize"));
const Labels = lazy(() => import("@/pages/labels"));
const OffersPublic = lazy(() => import("@/pages/offers-public"));
const EndOfDay = lazy(() => import("@/pages/end-of-day"));
const SecurityPin = lazy(() => import("@/pages/security-pin"));

function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> جاري التحميل…
    </div>
  );
}

const queryClient = new QueryClient();

const roleHome: Record<string, string> = {
  admin: "/dashboard",
  cashier: "/dashboard",
  buyer: "/dashboard",
  worker: "/dashboard",
  customer: "/customer",
  distributor: "/distributor",
};

function ProtectedRoute({ component: Component, roles }: { component: any, roles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    } else if (!isLoading && user && roles && !roles.includes(user.role)) {
      setLocation(roleHome[user.role] || "/dashboard");
    }
  }, [user, isLoading, setLocation, roles]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center">جاري التحميل...</div>;
  }

  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      setLocation(user ? (roleHome[user.role] || "/dashboard") : "/customer");
    }
  }, [user, isLoading, setLocation]);

  return <div className="flex h-full items-center justify-center">جاري التحميل...</div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/customer" component={CustomerPortal} />
      <Route path="/offers" component={OffersPublic} />
      <Route path="/" component={HomeRedirect} />
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} roles={["admin", "cashier", "buyer", "worker"]} />
      </Route>
      <Route path="/products">
        <ProtectedRoute component={Products} roles={["admin", "buyer", "worker"]} />
      </Route>
      <Route path="/pos">
        <ProtectedRoute component={POS} roles={["cashier"]} />
      </Route>
      <Route path="/customers">
        <ProtectedRoute component={Customers} roles={["admin", "cashier"]} />
      </Route>
      <Route path="/employees">
        <ProtectedRoute component={Employees} roles={["admin"]} />
      </Route>
      <Route path="/salaries">
        <ProtectedRoute component={Salaries} roles={["admin"]} />
      </Route>
      <Route path="/shortages">
        <ProtectedRoute component={Shortages} roles={["admin", "buyer", "worker"]} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={Reports} roles={["admin", "cashier"]} />
      </Route>
      <Route path="/shifts">
        <ProtectedRoute component={Shifts} roles={["admin"]} />
      </Route>
      <Route path="/tasks">
        <ProtectedRoute component={Tasks} roles={["admin", "cashier", "buyer", "worker"]} />
      </Route>
      <Route path="/expenses">
        <ProtectedRoute component={Expenses} roles={["admin"]} />
      </Route>
      <Route path="/advances">
        <ProtectedRoute component={Advances} roles={["admin"]} />
      </Route>
      <Route path="/online-orders">
        <ProtectedRoute component={OnlineOrders} roles={["admin", "cashier"]} />
      </Route>
      <Route path="/distributor">
        <ProtectedRoute component={DistributorPortal} roles={["admin", "distributor"]} />
      </Route>
      <Route path="/returns">
        <ProtectedRoute component={Returns} roles={["admin", "cashier"]} />
      </Route>
      <Route path="/audit">
        <ProtectedRoute component={AuditLog} roles={["admin"]} />
      </Route>
      <Route path="/backup">
        <ProtectedRoute component={Backup} roles={["admin"]} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={Analytics} roles={["admin"]} />
      </Route>
      <Route path="/price-suggestions">
        <ProtectedRoute component={PriceSuggestions} roles={["admin"]} />
      </Route>
      <Route path="/stockout-prediction">
        <ProtectedRoute component={StockoutPrediction} roles={["admin", "buyer"]} />
      </Route>
      <Route path="/auto-categorize">
        <ProtectedRoute component={AutoCategorize} roles={["admin"]} />
      </Route>
      <Route path="/labels">
        <ProtectedRoute component={Labels} roles={["admin", "buyer", "worker"]} />
      </Route>
      <Route path="/end-of-day">
        <ProtectedRoute component={EndOfDay} roles={["admin", "cashier"]} />
      </Route>
      <Route path="/security-pin">
        <ProtectedRoute component={SecurityPin} roles={["admin"]} />
      </Route>
      <Route>
        <Layout>
          <NotFound />
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Router />
            </Suspense>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
        <InstallPrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
