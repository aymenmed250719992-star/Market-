import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";
import { STORE_WHATSAPP, buildWhatsAppUrl } from "@/lib/store-config";

export default function Register() {
  const { register } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "كلمتا المرور غير متطابقتين",
      });
      return;
    }
    setIsLoading(true);
    try {
      await register({ name, email, phone, password });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ في إنشاء الحساب",
        description: error.message || "حدث خطأ، حاول مجدداً",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openWhatsApp = () => {
    const message =
      `السلام عليكم،\nأرغب في فتح حساب جديد في متجر الجزائر.\n\nالاسم: \nالهاتف: \nالعنوان: `;
    window.open(buildWhatsAppUrl(message), "_blank");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <span className="text-5xl">🏪</span>
          </div>
          <CardTitle className="text-3xl font-bold">متجر الجزائر</CardTitle>
          <CardDescription>إنشاء حساب زبون جديد</CardDescription>
        </CardHeader>
        <CardContent>
          {/* WhatsApp registration banner — primary path */}
          <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3 mb-4">
            <div className="flex items-start gap-3">
              <MessageCircle className="h-7 w-7 text-emerald-500 shrink-0 mt-1" />
              <div className="space-y-1">
                <h3 className="font-bold text-base">التسجيل يكون عبر واتساب</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  لإنشاء حساب جديد، تواصل معنا عبر واتساب وسيتم تفعيل الحساب فوراً من قبل إدارة المتجر.
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {STORE_WHATSAPP}
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={openWhatsApp}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              data-testid="button-whatsapp-register"
            >
              <MessageCircle className="ml-2 h-5 w-5" />
              تواصل عبر واتساب الآن
            </Button>
          </div>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2"
              data-testid="button-show-email-register"
            >
              أو إنشاء الحساب بالبريد الإلكتروني
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-xs text-muted-foreground text-center pb-1">
                التسجيل بالبريد الإلكتروني (يحتاج موافقة الإدارة)
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">الاسم الكامل</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="أيمن محمد"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0555 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={isLoading}
                    dir="ltr"
                    className="text-left pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                إنشاء الحساب
              </Button>
            </form>
          )}

          <div className="mt-4 text-center text-sm text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <button
              onClick={() => setLocation("/login")}
              className="text-primary font-medium hover:underline"
            >
              تسجيل الدخول
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
