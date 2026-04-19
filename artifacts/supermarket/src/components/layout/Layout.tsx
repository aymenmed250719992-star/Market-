import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  UsersRound,
  Banknote,
  AlertTriangle,
  History,
  LogOut,
  Moon,
  Sun,
  Clock,
  Target,
  Banknote as BanknoteIcon,
  UserMinus,
  Globe2,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  if (!user) return <>{children}</>;

  const navItems = [
    { href: "/dashboard", label: "لوحة القيادة", icon: LayoutDashboard, roles: ["admin", "cashier", "buyer", "worker"] },
    { href: "/pos", label: "نقطة البيع", icon: ShoppingCart, roles: ["cashier"] },
    { href: "/products", label: "المنتجات", icon: Package, roles: ["admin", "buyer", "worker"] },
    { href: "/tasks", label: "المهام", icon: Target, roles: ["admin", "cashier", "buyer", "worker"] },
    { href: "/customers", label: "الزبائن والكرني", icon: Users, roles: ["admin", "cashier"] },
    { href: "/online-orders", label: "طلبات الإنترنت", icon: Globe2, roles: ["admin", "cashier"] },
    { href: "/distributor", label: "عروض الموزعين", icon: Truck, roles: ["admin", "distributor"] },
    { href: "/shifts", label: "الورديات", icon: Clock, roles: ["admin"] },
    { href: "/expenses", label: "المصاريف", icon: BanknoteIcon, roles: ["admin"] },
    { href: "/advances", label: "التسبقات والخصومات", icon: UserMinus, roles: ["admin"] },
    { href: "/employees", label: "الموظفين", icon: UsersRound, roles: ["admin"] },
    { href: "/salaries", label: "الرواتب", icon: Banknote, roles: ["admin"] },
    { href: "/shortages", label: "النواقص والتوالف", icon: AlertTriangle, roles: ["admin", "buyer", "worker"] },
    { href: "/reports", label: "التقارير", icon: History, roles: ["admin", "cashier"] },
  ];

  const visibleNavItems = navItems.filter((item) => item.roles.includes(user.role));

  const roleLabels: Record<string, string> = {
    admin: "أدمن",
    cashier: "قابض",
    buyer: "مشتري",
    worker: "عامل",
    customer: "زبون",
    distributor: "موزع",
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden print:bg-white print:text-black">
      {/* Sidebar */}
      <aside className="w-64 border-l border-border bg-sidebar flex flex-col print:hidden">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <span className="text-xl font-bold flex items-center gap-2">
            <span>🏪</span>
            <span>متجر الجزائر</span>
          </span>
        </div>

        <div className="p-4 border-b border-border">
          <div className="font-semibold">{user.name}</div>
          <div className="text-sm text-muted-foreground">{roleLabels[user.role] || user.role}</div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {visibleNavItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <Button
                    variant={location === item.href ? "secondary" : "ghost"}
                    className={`w-full justify-start gap-3 ${location === item.href ? "bg-secondary text-secondary-foreground" : ""}`}
                    data-testid={`nav-${item.href.replace("/", "")}`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={() => setIsDark(!isDark)}
            data-testid="button-toggle-theme"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {isDark ? "الوضع الفاتح" : "الوضع الداكن"}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">
          {children}
        </div>
      </main>
    </div>
  );
}