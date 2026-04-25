import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShoppingBag, LogIn, UserPlus, User } from "lucide-react";

type Mode = "welcome" | "login" | "register" | "guest";

export default function Login() {
  const { login, register, loginAsGuest } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("welcome");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await login({ email, password }); }
    catch (err: any) { toast({ variant: "destructive", title: "تعذر الدخول", description: err.message }); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await register({ name, email, phone, password }); }
    catch (err: any) { toast({ variant: "destructive", title: "تعذر إنشاء الحساب", description: err.message }); }
    finally { setLoading(false); }
  };

  const handleGuest = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try { await loginAsGuest({ name: name || undefined, phone: phone || undefined }); }
    catch (err: any) { toast({ variant: "destructive", title: "تعذر الدخول كضيف", description: err.message }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-950 via-background to-amber-950/40 text-foreground" dir="rtl">
      {/* HERO */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.18),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(245,158,11,0.12),transparent_50%)]" />
        <div className="relative z-10 max-w-lg w-full space-y-6">
          <div className="flex justify-center">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Super Supermarché"
              className="w-full max-w-md h-auto object-contain drop-shadow-2xl"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <div>
            <p className="text-base sm:text-lg text-muted-foreground leading-7">
              متجرك الإلكتروني المتكامل: تسوّق، تابع طلباتك، وادفع عند الاستلام أو سجّل على الكرني.
            </p>
          </div>

          {mode === "welcome" && (
            <div className="space-y-3 pt-4">
              <Button className="w-full h-14 text-base font-bold rounded-2xl gap-2" onClick={() => setMode("login")} data-testid="btn-show-login">
                <LogIn className="h-5 w-5" /> تسجيل الدخول
              </Button>
              <Button variant="secondary" className="w-full h-14 text-base font-bold rounded-2xl gap-2" onClick={() => setMode("register")} data-testid="btn-show-register">
                <UserPlus className="h-5 w-5" /> إنشاء حساب جديد
              </Button>
              <Button variant="outline" className="w-full h-14 text-base font-bold rounded-2xl gap-2" onClick={() => handleGuest()} disabled={loading} data-testid="btn-guest">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />}
                دخول كضيف والشراء مباشرة
              </Button>
              <p className="text-xs text-muted-foreground pt-2">يمكنك الدخول كضيف وإكمال الطلب الآن، وستحفظ جلستك على هذا الجهاز تلقائياً.</p>
            </div>
          )}

          {mode === "login" && (
            <form onSubmit={handleLogin} className="bg-card/80 backdrop-blur border border-border rounded-2xl p-6 space-y-4 text-right shadow-xl">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" required dir="ltr" className="text-left h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="input-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input id="password" type="password" required dir="ltr" className="text-left h-11" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="input-password" />
              </div>
              <Button type="submit" className="w-full h-11 font-bold" disabled={loading} data-testid="button-login">
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                دخول
              </Button>
              <button type="button" onClick={() => setMode("welcome")} className="w-full text-sm text-muted-foreground hover:text-foreground">رجوع</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={handleRegister} className="bg-card/80 backdrop-blur border border-border rounded-2xl p-6 space-y-4 text-right shadow-xl">
              <div className="space-y-2">
                <Label>الاسم الكامل</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>الهاتف</Label>
                  <Input required dir="ltr" className="text-right h-11" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>كلمة المرور</Label>
                  <Input required type="password" dir="ltr" className="text-left h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input required type="email" dir="ltr" className="text-left h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full h-11 font-bold" disabled={loading}>
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                إنشاء حساب
              </Button>
              <button type="button" onClick={() => setMode("welcome")} className="w-full text-sm text-muted-foreground hover:text-foreground">رجوع</button>
            </form>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground py-4 border-t border-border/50">
        © {new Date().getFullYear()} متجر الجزائر — جميع الحقوق محفوظة
      </div>
    </div>
  );
}
