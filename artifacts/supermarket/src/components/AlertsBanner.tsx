import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Info, X, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Alert {
  level: "critical" | "warning" | "info";
  key: string;
  message: string;
  href?: string;
  count: number;
}

const DISMISS_KEY = "alerts.dismissed.v1";

export function AlertsBanner() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}"); } catch { return {}; }
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts", { credentials: "include" });
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setAlerts(j.alerts ?? []);
      } catch { /* ignore */ }
    };
    fetchAlerts();
    const t = setInterval(fetchAlerts, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  const now = Date.now();
  const visible = alerts.filter((a) => !dismissed[a.key] || dismissed[a.key] < now - 4 * 3600_000);

  if (!user || visible.length === 0) return null;

  const dismiss = (key: string) => {
    const next = { ...dismissed, [key]: Date.now() };
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  };

  const colorFor = (lvl: Alert["level"]) =>
    lvl === "critical" ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
    : lvl === "warning" ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
    : "bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300";

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full bg-muted/50 border-b border-border px-4 py-1.5 text-xs flex items-center justify-center gap-2 hover:bg-muted print:hidden"
        data-testid="button-expand-alerts"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>{visible.length} تنبيه نشط — اضغط للعرض</span>
      </button>
    );
  }

  return (
    <div className="border-b border-border bg-background print:hidden">
      <div className="px-3 py-2 flex flex-wrap gap-2">
        {visible.map((a) => {
          const Icon = a.level === "critical" || a.level === "warning" ? AlertTriangle : Info;
          const Inner = (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-bold ${colorFor(a.level)}`}>
              <Icon className="h-4 w-4" />
              <span>{a.message}</span>
            </div>
          );
          return (
            <div key={a.key} className="flex items-center gap-1" data-testid={`alert-${a.key}`}>
              {a.href ? <Link href={a.href}>{Inner}</Link> : Inner}
              <button
                onClick={() => dismiss(a.key)}
                title="إخفاء"
                className="h-6 w-6 rounded hover:bg-muted text-muted-foreground flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground px-2"
        >
          تصغير
        </button>
      </div>
    </div>
  );
}
