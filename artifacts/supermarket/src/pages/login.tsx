import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.10),transparent_40%)]" />

      <Card className="w-full max-w-4xl relative shadow-2xl border-primary/20">
        <div className="grid lg:grid-cols-[1fr_400px]">
          {/* Hero panel */}
          <div className="hidden lg:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground rounded-r-lg border-l border-border">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-xl">S</div>
                <span className="text-2xl font-black tracking-wide">SUPERMARCHÉ</span>
              </div>
              <h2 className="text-3xl font-extrabold leading-tight">نظام إدارة السوبرماركت الجزائري</h2>
              <p className="mt-4 text-muted-foreground leading-7 text-sm">
                نقطة بيع متكاملة، إدارة مخزون، نظام كرني، طلبات أونلاين، عروض موزعين، ورواتب — كل شيء في واجهة عربية واحدة.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {["POS سريع", "كرني محلي", "تنبيهات مخزون", "صلاحيات كاملة", "تقارير يومية", "موزعون وزبائن"].map((item) => (
                <div key={item} className="rounded-lg border border-border/40 bg-background/10 px-3 py-2 font-semibold text-xs">
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Login form */}
          <div className="flex flex-col justify-center">
            <CardHeader className="text-center space-y-3 pb-4">
              <div className="flex justify-center mb-2 lg:hidden">
                <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-black text-2xl shadow-lg">S</div>
              </div>
              <CardTitle className="text-2xl font-bold">SUPERMARCHÉ</CardTitle>
              <CardDescription>تسجيل الدخول إلى نظام الإدارة</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="أدخل بريدك الإلكتروني"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left h-11"
                    autoComplete="email"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="أدخل كلمة المرور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left h-11"
                    autoComplete="current-password"
                    data-testid="input-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-bold mt-2"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  دخول
                </Button>
              </form>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
}
