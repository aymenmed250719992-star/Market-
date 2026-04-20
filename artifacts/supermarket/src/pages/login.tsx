import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ScanBarcode, PackageCheck, Truck, UserRound, Users } from "lucide-react";
import { useLocation } from "wouter";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const demoAccounts = [
    { label: "أدمن", email: "aymenmed25071999@gmail.com", password: "Nova3iNokiac25071999@@", icon: ShieldCheck },
    { label: "قابض", email: "cashier@supermarket.local", password: "cashier123", icon: ScanBarcode },
    { label: "مشتري", email: "buyer@supermarket.local", password: "buyer123", icon: PackageCheck },
    { label: "عامل", email: "worker@supermarket.local", password: "worker123", icon: Users },
    { label: "موزع", email: "distributor@supermarket.local", password: "distributor123", icon: Truck },
    { label: "زبون", email: "customer@supermarket.local", password: "customer123", icon: UserRound },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login({ email, password });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ في تسجيل الدخول",
        description: error.message || "تأكد من البريد الإلكتروني وكلمة المرور",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.18),transparent_30%)]" />
      <Card className="w-full max-w-5xl relative shadow-2xl border-primary/20">
        <div className="grid lg:grid-cols-[1fr_420px]">
          <div className="hidden lg:flex flex-col justify-between p-8 bg-sidebar text-sidebar-foreground rounded-r-lg border-l border-border">
            <div>
              <div className="text-5xl mb-6">🏪</div>
              <h2 className="text-3xl font-extrabold">نظام سوبرماركت جزائري متكامل</h2>
              <p className="mt-3 text-muted-foreground leading-7">نقطة بيع، مخزون، كرني، طلبات زبائن، عروض موزعين، ورواتب في واجهة عربية واحدة بدون أي بوابات دفع إلكترونية.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {["POS سريع", "كرني محلي", "تنبيهات مخزون", "صلاحيات كاملة"].map((item) => (
                <div key={item} className="rounded-lg border border-border bg-background/20 p-3 font-semibold">{item}</div>
              ))}
            </div>
          </div>
          <div>
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <span className="text-5xl">🏪</span>
          </div>
          <CardTitle className="text-3xl font-bold">متجر الجزائر</CardTitle>
          <CardDescription>تسجيل الدخول إلى نظام إدارة المتجر</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="aymenmed25071999@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                dir="ltr"
                className="text-left"
                autoComplete="email"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                dir="ltr"
                className="text-left"
                autoComplete="current-password"
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              دخول
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            زبون جديد؟{" "}
            <button
              onClick={() => setLocation("/register")}
              className="text-primary font-medium hover:underline"
            >
              إنشاء حساب جديد
            </button>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-sm font-bold mb-3">حسابات تجربة سريعة</div>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((account) => {
                const Icon = account.icon;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary hover:bg-primary/10"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    {account.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
}
