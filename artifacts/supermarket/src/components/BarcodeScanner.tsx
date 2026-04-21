import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ open, onClose, onDetected }: BarcodeScannerProps) {
  const containerId = "barcode-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      setError(null);
      setStarting(true);
      try {
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 160 } },
          (decodedText) => {
            onDetected(decodedText.trim());
            stop().finally(() => onClose());
          },
          () => {}
        );
        if (cancelled) await stop();
      } catch (e: any) {
        setError(e?.message || "تعذّر فتح الكاميرا. تأكد من منح الإذن واستخدام HTTPS.");
      } finally {
        setStarting(false);
      }
    };

    const stop = async () => {
      const s = scannerRef.current;
      if (!s) return;
      try {
        if (s.isScanning) await s.stop();
        await s.clear();
      } catch {}
      scannerRef.current = null;
    };

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onClose, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            مسح الباركود بالكاميرا
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div id={containerId} className="rounded-lg overflow-hidden bg-black aspect-video" />
          {starting && <p className="text-sm text-muted-foreground text-center">جاري تشغيل الكاميرا...</p>}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <p className="text-xs text-muted-foreground text-center">وجّه الكاميرا نحو الباركود حتى يتم التعرّف عليه تلقائياً.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="ml-2 h-4 w-4" /> إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
