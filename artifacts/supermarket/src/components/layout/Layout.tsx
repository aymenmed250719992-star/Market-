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
  Truck,
  PanelRightClose,
  PanelRightOpen,
  Menu,
  Undo2,
  ScrollText,
  Database,
  BarChart3,
  Lightbulb,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { FloatingAssistant } from "@/components/FloatingAssistant";

const SIDEBAR_KEY = "sidebar.collapsed";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem(SIDEBAR_KEY) === "1");

  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0"); }, [sidebarCollapsed]);

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
    { href: "/returns", label: "المرتجعات", icon: Undo2, roles: ["admin", "cashier"] },
    { href: "/reports", label: "التقارير", icon: History, roles: ["admin", "cashier"] },
    { href: "/analytics", label: "تحليلات ذكية", icon: BarChart3, roles: ["admin"] },
    { href: "/price-suggestions", label: "اقتراحات الأسعار", icon: Lightbulb, roles: ["admin"] },
    { href: "/stockout-prediction", label: "توقع نفاد المخزون", icon: TrendingDown, roles: ["admin", "buyer"] },
    { href: "/audit", label: "سجل التدقيق", icon: ScrollText, roles: ["admin"] },
    { href: "/backup", label: "النسخ الاحتياطي", icon: Database, roles: ["admin"] },
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
      <aside className={`${sidebarCollapsed ? "w-16" : "w-64"} transition-all duration-200 border-l border-border bg-sidebar flex flex-col print:hidden`}>
        <div className="h-16 flex items-center justify-between px-3 border-b border-border">
          {!sidebarCollapsed && (
            <span className="text-xl font-bold flex items-center gap-2 truncate">
              <span>🏪</span>
              <span>متجر الجزائر</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "إظهار القائمة" : "إخفاء القائمة"}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          </Button>
        </div>

        {!sidebarCollapsed && (
          <div className="p-4 border-b border-border">
            <div className="font-semibold truncate">{user.name}</div>
            <div className="text-sm text-muted-foreground">{roleLabels[user.role] || user.role}</div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {visibleNavItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <Button
                    variant={location === item.href ? "secondary" : "ghost"}
                    className={`w-full ${sidebarCollapsed ? "justify-center px-0" : "justify-start gap-3"} ${location === item.href ? "bg-secondary text-secondary-foreground" : ""}`}
                    title={sidebarCollapsed ? item.label : undefined}
                    data-testid={`nav-${item.href.replace("/", "")}`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && item.label}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-2 border-t border-border space-y-1">
          <Button
            variant="ghost"
            className={`w-full ${sidebarCollapsed ? "justify-center px-0" : "justify-start gap-3"}`}
            onClick={() => setIsDark(!isDark)}
            title={sidebarCollapsed ? (isDark ? "الوضع الفاتح" : "الوضع الداكن") : undefined}
            data-testid="button-toggle-theme"
          >
            {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
            {!sidebarCollapsed && (isDark ? "الوضع الفاتح" : "الوضع الداكن")}
          </Button>
          <Button
            variant="ghost"
            className={`w-full text-destructive hover:bg-destructive/10 hover:text-destructive ${sidebarCollapsed ? "justify-center px-0" : "justify-start gap-3"}`}
            onClick={() => logout()}
            title={sidebarCollapsed ? "تسجيل الخروج" : undefined}
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && "تسجيل الخروج"}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">
          {children}
        </div>
      </main>

      <FloatingAssistant />
    </div>
  );
}