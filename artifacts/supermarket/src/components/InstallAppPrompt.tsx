import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

const DISMISS_KEY = "install.dismissed.v1";

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 3600_000) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (isStandalone) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const ua = navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
    if (isIos) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[60] bg-card border border-primary/40 rounded-2xl shadow-2xl p-4 print:hidden"
      data-testid="install-app-prompt"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Smartphone className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">ثبّت التطبيق على هاتفك</div>
          {iosHint && !deferredPrompt ? (
            <p className="text-xs text-muted-foreground mt-1">
              اضغط زر المشاركة في Safari ثم اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              يعمل بدون متصفّح، أسرع، ويظهر كأيقونة مع باقي تطبيقاتك.
            </p>
          )}
          {deferredPrompt && (
            <button
              onClick={install}
              className="mt-3 inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold px-4 py-2 rounded-lg"
              data-testid="button-install-app"
            >
              <Download className="h-4 w-4" /> تثبيت الآن
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
          data-testid="button-dismiss-install"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
