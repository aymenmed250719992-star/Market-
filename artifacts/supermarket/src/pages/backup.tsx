import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Database, Download, Upload, AlertTriangle } from "lucide-react";

export default function Backup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [info, setInfo] = useState<{ exists: boolean; counts?: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadInfo = async () => {
    const res = await fetch("/api/backup/info", { credentials: "include" });
    if (res.ok) setInfo(await res.json());
  };

  useEffect(() => {
    if (user?.role === "admin") loadInfo();
  }, [user]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/backup/export", { credentials: "include" });
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `supermarket-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تنزيل ملف النسخة الاحتياطية" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!confirm("سيتم استبدال جميع البيانات الحالية بمحتوى النسخة الاحتياطية. هل أنت متأكد؟")) return;
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/backup/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "فشل الاستيراد");
      toast({
        title: "تم الاستيراد",
        description: `تم استرجاع ${result.restored ?? 0} سجل. يُنصح بإعادة تحميل الصفحة.`,
      });
      await loadInfo();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (user?.role !== "admin") {
    return <div className="text-center text-muted-foreground py-12">هذه الصفحة متاحة للأدمن فقط</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Database className="h-8 w-8" />
        النسخ الاحتياطي
      </h1>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-bold">إحصائيات قاعدة البيانات</h2>
        {info?.counts ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {Object.entries(info.counts).map(([name, count]) => (
              <div key={name} className="bg-muted/50 px-3 py-2 rounded flex justify-between">
                <span className="text-muted-foreground">{name}</span>
                <span className="font-bold">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">جاري التحميل...</div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Download className="h-5 w-5" />
          تصدير نسخة احتياطية
        </h2>
        <p className="text-sm text-muted-foreground">
          نزّل ملف JSON يحتوي جميع بيانات المتجر (المنتجات، المبيعات، الزبائن، الموظفين، السجلات).
          احفظ الملف في مكان آمن.
        </p>
        <Button onClick={handleExport} disabled={busy} data-testid="button-export-backup">
          <Download className="ml-2 h-4 w-4" /> تنزيل النسخة الاحتياطية
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Upload className="h-5 w-5" />
          استيراد نسخة احتياطية
        </h2>
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-md text-sm flex gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <strong>تحذير:</strong> سيتم <u>استبدال</u> جميع البيانات الحالية بمحتوى الملف.
            يحتفظ النظام بنسخة من البيانات السابقة على القرص قبل الاستبدال.
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
          }}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          disabled={busy}
          data-testid="input-import-backup"
        />
      </div>
    </div>
  );
}
