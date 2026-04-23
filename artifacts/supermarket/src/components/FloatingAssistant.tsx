import { useEffect, useRef, useState } from "react";
import { Bot, X, EyeOff, Send, Sparkles, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  products?: any[];
  provider?: string;
  executedTools?: { name: string; ok: boolean }[];
}

const TOOL_LABELS: Record<string, string> = {
  search_products: "بحث منتجات",
  get_product: "جلب منتج",
  list_low_stock: "مخزون منخفض",
  list_expiring: "صلاحية قريبة",
  inventory_overview: "نظرة عامة المخزون",
  sales_summary: "ملخص المبيعات",
  search_customers: "بحث زبائن",
  list_pending_tasks: "مهام معلّقة",
  list_employees: "الموظفون",
  list_online_orders: "الطلبيات الإلكترونية",
  update_product: "تعديل منتج",
  create_product: "إضافة منتج",
  delete_product: "حذف منتج",
  restock_product: "نقل من المستودع",
  create_task: "إنشاء مهمة",
  create_customer: "إضافة زبون",
  record_customer_payment: "تسجيل دفعة",
  create_expense: "تسجيل مصروف",
};

const HIDE_KEY = "assistant.hidden";
const OPEN_KEY = "assistant.open";

export function FloatingAssistant() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState<boolean>(() => localStorage.getItem(HIDE_KEY) === "1");
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(OPEN_KEY) === "1");
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState<boolean>(() => localStorage.getItem("assistant.speak") === "1");
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { localStorage.setItem("assistant.speak", speakOn ? "1" : "0"); }, [speakOn]);

  const speak = (text: string) => {
    if (!speakOn || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 600));
      u.lang = "ar-SA";
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  };

  const SR: any = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const voiceSupported = !!SR;

  const startListening = () => {
    if (!SR || listening) return;
    try {
      const rec = new SR();
      rec.lang = "ar-SA";
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        setQuery(transcript);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch {}
    setListening(false);
  };

  useEffect(() => { localStorage.setItem(HIDE_KEY, hidden ? "1" : "0"); }, [hidden]);
  useEffect(() => { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [chat, loading]);

  if (!user) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setChat((p) => [...p, { role: "user", text: q }]);
    setQuery("");
    setLoading(true);
    try {
      const history = chat.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
      const res = await fetch("/api/ai/inventory-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: q,
          history,
          requesterId: user.id,
          requesterName: user.name,
          role: user.role,
        }),
      });
      const data = await res.json();
      setChat((p) => [...p, { role: "ai", text: data.answer ?? "—", products: data.products, provider: data.provider, executedTools: data.executedTools }]);
      if (data.answer) speak(data.answer);
    } catch {
      setChat((p) => [...p, { role: "ai", text: "تعذّر الاتصال بالمساعد. حاول مجدداً." }]);
    } finally {
      setLoading(false);
    }
  };

  // Fully hidden (user clicked "Hide"). Show a tiny "show" pill.
  if (hidden) {
    return (
      <button
        onClick={() => { setHidden(false); setOpen(true); }}
        title="إظهار المساعد الذكي"
        className="fixed bottom-3 left-3 z-40 h-9 w-9 rounded-full bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary print:hidden"
        data-testid="button-show-assistant"
      >
        <Bot className="h-4 w-4" />
      </button>
    );
  }

  // Collapsed bubble
  if (!open) {
    return (
      <div className="fixed bottom-3 left-3 z-40 flex items-center gap-2 print:hidden">
        <button
          onClick={() => setOpen(true)}
          className="h-11 px-4 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 hover:bg-primary/90"
          data-testid="button-open-assistant"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-bold">المساعد الذكي</span>
        </button>
        <button
          onClick={() => setHidden(true)}
          title="إخفاء"
          className="h-7 w-7 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 flex items-center justify-center"
          data-testid="button-hide-assistant"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-3 left-3 z-40 w-[340px] max-w-[92vw] h-[460px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden print:hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>المساعد الذكي</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSpeakOn(!speakOn)}
            title={speakOn ? "إيقاف القراءة الصوتية" : "تفعيل القراءة الصوتية"}
            className={`h-7 w-7 rounded flex items-center justify-center ${speakOn ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted text-muted-foreground"}`}
            data-testid="button-toggle-speak"
          >
            {speakOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            title="تصغير"
            className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
            data-testid="button-collapse-assistant"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setHidden(true)}
            title="إخفاء كلياً"
            className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
            data-testid="button-hide-assistant-panel"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
        {chat.length === 0 && (
          <div className="bg-muted/50 text-muted-foreground p-3 rounded-lg text-xs leading-relaxed">
            مرحباً {user.name}! اسألني عن المخزون، الأسعار، مبيعات اليوم، أو اطلب اقتراحات لإعادة التزويد. مثال:
            <ul className="mt-2 space-y-1 list-disc pr-4">
              <li>ما هي المنتجات المنخفضة في الرف الآن؟</li>
              <li>كم بلغت مبيعات اليوم؟</li>
              <li>أنشئ مهمة نقل كراتين الحليب من المستودع للرف</li>
            </ul>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`px-3 py-2 rounded-2xl max-w-[88%] text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
              {m.text}
              {m.executedTools && m.executedTools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.executedTools.map((t, j) => (
                    <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded ${t.ok ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/20 text-rose-700 dark:text-rose-300"}`}>
                      {t.ok ? "✓" : "✕"} {TOOL_LABELS[t.name] ?? t.name}
                    </span>
                  ))}
                </div>
              )}
              {m.products && m.products.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.products.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="bg-background/60 border border-border rounded px-2 py-1 flex justify-between text-[11px]">
                      <span className="truncate">{p.name}</span>
                      <span className="text-primary font-bold ml-2">{p.retailPrice} دج</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted text-foreground px-3 py-2 rounded-2xl text-xs">يفكّر المساعد...</div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-2 border-t border-border flex items-center gap-2 bg-background">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={listening ? "أتحدث الآن..." : "اكتب أو تكلم..."}
          className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          dir="rtl"
          data-testid="input-assistant-query"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            title={listening ? "إيقاف التسجيل" : "إدخال صوتي"}
            className={`h-9 w-9 rounded-lg flex items-center justify-center ${listening ? "bg-rose-500 text-white animate-pulse" : "bg-muted text-foreground hover:bg-muted/70"}`}
            data-testid="button-voice-assistant"
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button type="submit" disabled={loading || !query.trim()} className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
