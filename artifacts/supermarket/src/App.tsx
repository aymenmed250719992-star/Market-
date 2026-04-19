import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import POS from "@/pages/pos";
import Customers from "@/pages/customers";
import Employees from "@/pages/employees";
import Salaries from "@/pages/salaries";
import Shortages from "@/pages/shortages";
import Reports from "@/pages/reports";
import Shifts from "@/pages/shifts";
import Tasks from "@/pages/tasks";
import Expenses from "@/pages/expenses";
import Advances from "@/pages/advances";
import CustomerPortal from "@/pages/customer-portal";
import OnlineOrders from "@/pages/online-orders";
import DistributorPortal from "@/pages/distributor-portal";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

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
      <Route path="/customer" component={CustomerPortal} />
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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
