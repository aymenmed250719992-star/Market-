import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Sparkles, RefreshCw, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onCount: (count: number) => void;
  productName?: string;
}

type CountResult = {
  count: number;
  confidence: "high" | "medium" | "low" | string;
  description: string;
};

export function AICountCamera({ open, onClose, onCount, productName }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CountResult | null>(null);
  const { toast } = useToast();

  const reset = () => {
    setImageData(null);
    setResult(null);
    setAnalyzing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    if (!file) return;
    // Resize to keep upload small (max ~1024 wide)
    const dataUrl = await resizeToDataUrl(file, 1024, 0.85);
    setImageData(dataUrl);
    setResult(null);
    analyze(dataUrl);
  };

  const analyze = async (img: string) => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/count-products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img, productName }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "فشل التحليل", description: e.error });
        return;
      }
      const r: CountResult = await res.json();
      setResult(r);
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setAnalyzing(false);
    }
  };

  const accept = () => {
    if (!result) return;
    onCount(result.count);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            عدّ بالذكاء الاصطناعي
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!imageData ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                التقط صورة واضحة للمنتجات على الرف أو في الصندوق، وسيقوم الذكاء الاصطناعي بعدّها لك تلقائياً.
              </p>
              {productName && (
                <div className="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm">
                  المنتج: <strong>{productName}</strong>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                    }
                  }}
                  className="gap-2 h-14"
                  data-testid="button-take-photo"
                >
                  <Camera className="h-5 w-5" /> التقاط صورة بالكاميرا
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute("capture");
                      fileInputRef.current.click();
                    }
                  }}
                  className="gap-2"
                  data-testid="button-pick-photo"
                >
                  اختيار صورة من المعرض
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={imageData} alt="Captured" className="w-full max-h-80 object-contain bg-black" />
                {analyzing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-2">
                    <Sparkles className="h-8 w-8 animate-pulse text-primary" />
                    <div className="text-sm">جاري التحليل…</div>
                  </div>
                )}
              </div>

              {result && !analyzing && (
                <div className="bg-card border-2 border-primary rounded-lg p-4 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-sm text-muted-foreground">العدد المكتشف</div>
                    <ConfidenceBadge confidence={result.confidence} />
                  </div>
                  <div className="text-5xl font-bold text-primary text-center" data-testid="text-ai-count">
                    {result.count}
                  </div>
                  {result.description && (
                    <div className="text-xs text-muted-foreground text-center border-t border-border pt-2">
                      {result.description}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} className="gap-2 flex-1" data-testid="button-retry-count">
                  <RefreshCw className="h-4 w-4" /> صورة جديدة
                </Button>
                {result && !analyzing && (
                  <Button onClick={accept} className="gap-2 flex-1" data-testid="button-accept-count">
                    <CheckCircle2 className="h-4 w-4" /> استعمال هذا العدد
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    high: { label: "ثقة عالية", cls: "bg-emerald-500/20 text-emerald-500" },
    medium: { label: "ثقة متوسطة", cls: "bg-amber-500/20 text-amber-500" },
    low: { label: "ثقة منخفضة", cls: "bg-orange-500/20 text-orange-500" },
  };
  const m = map[confidence] ?? map.medium;
  return <span className={`text-xs px-2 py-0.5 rounded font-bold ${m.cls}`}>{m.label}</span>;
}

async function resizeToDataUrl(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas error"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = String(reader.result ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
