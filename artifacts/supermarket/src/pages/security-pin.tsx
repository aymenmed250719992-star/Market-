import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lock, Shield } from "lucide-react";

export default function SecurityPin() {
  const { toast } = useToast();
  const [isSet, setIsSet] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/security/pin-status", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setIsSet(!!j.isSet));
  }, []);

  const save = async () => {
    if (!/^\d{4,6}$/.test(pin)) { toast({ variant: "destructive", title: "PIN يجب أن يكون 4-6 أرقام" }); return; }
    if (pin !== pin2) { toast({ variant: "destructive", title: "الرمزان غير متطابقين" }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/security/set-pin", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast({ title: "تم حفظ الرمز السري" });
      setIsSet(true);
      setPin(""); setPin2("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Shield className="h-8 w-8" /> رمز PIN للأمان
      </h1>
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          يُطلب هذا الرمز السرّي قبل تنفيذ العمليات الحساسة (تعديل الأسعار بكميات كبيرة، حذف المنتجات، إعادة البيانات...).
          {isSet ? " ✅ الرمز مُفعّل حالياً." : " ⚠️ لم تُفعّل رمز PIN بعد."}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-sm block mb-1">الرمز الجديد (4-6 أرقام)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm tracking-widest text-center"
              data-testid="input-pin-new"
            />
          </div>
          <div>
            <label className="text-sm block mb-1">تأكيد الرمز</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm tracking-widest text-center"
              data-testid="input-pin-confirm"
            />
          </div>
          <Button onClick={save} disabled={busy} className="w-full">
            <Lock className="ml-2 h-4 w-4" /> حفظ الرمز
          </Button>
        </div>
      </div>
    </div>
  );
}
