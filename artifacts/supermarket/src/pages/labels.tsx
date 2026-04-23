import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Printer, Search } from "lucide-react";
import JsBarcode from "jsbarcode";

interface Product {
  id: number;
  name: string;
  barcode: string;
  retailPrice: number;
}

export default function Labels() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Map<number, number>>(new Map()); // id -> qty
  const [loading, setLoading] = useState(false);

  const doSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&limit=50`, { credentials: "include" });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data.products ?? []);
    } finally { setLoading(false); }
  };

  const toggle = (id: number) => {
    const next = new Map(selected);
    if (next.has(id)) next.delete(id);
    else next.set(id, 1);
    setSelected(next);
  };

  const setQty = (id: number, qty: number) => {
    const next = new Map(selected);
    next.set(id, Math.max(1, Math.min(50, qty)));
    setSelected(next);
  };

  const labelsToPrint: { p: Product; idx: number }[] = [];
  for (const p of results) {
    const qty = selected.get(p.id) ?? 0;
    for (let i = 0; i < qty; i++) labelsToPrint.push({ p, idx: i });
  }

  useEffect(() => {
    // Render barcodes after each render
    setTimeout(() => {
      document.querySelectorAll<SVGElement>("svg.label-barcode").forEach((el) => {
        const code = el.dataset.code;
        if (!code) return;
        try { JsBarcode(el, code, { format: "EAN13", width: 1.4, height: 36, fontSize: 12, margin: 0 }); }
        catch {
          try { JsBarcode(el, code, { format: "CODE128", width: 1.4, height: 36, fontSize: 12, margin: 0 }); }
          catch { /* invalid */ }
        }
      });
    }, 50);
  }, [labelsToPrint.length]);

  const handlePrint = () => {
    if (labelsToPrint.length === 0) {
      toast({ variant: "destructive", title: "لا توجد ملصقات للطباعة" });
      return;
    }
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Printer className="h-8 w-8" /> ملصقات الأسعار
        </h1>
        <Button onClick={handlePrint} data-testid="button-print-labels">
          <Printer className="ml-2 h-4 w-4" /> طباعة ({labelsToPrint.length})
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 space-y-3 print:hidden">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="ابحث باسم المنتج أو الباركود..."
            className="flex-1 bg-muted/40 border border-border rounded-md px-3 py-2 text-sm"
            dir="rtl"
          />
          <Button onClick={doSearch} disabled={loading}>
            <Search className="ml-2 h-4 w-4" /> بحث
          </Button>
        </div>
        {results.length > 0 && (
          <div className="max-h-72 overflow-y-auto border border-border rounded-md">
            {results.map((p) => {
              const qty = selected.get(p.id) ?? 0;
              return (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-border text-sm hover:bg-muted/30">
                  <input type="checkbox" checked={qty > 0} onChange={() => toggle(p.id)} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground text-xs">{p.barcode}</span>
                  <span className="font-bold text-primary">{p.retailPrice} دج</span>
                  {qty > 0 && (
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={qty}
                      onChange={(e) => setQty(p.id, parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-xs bg-muted/40 border border-border rounded"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 print:gap-1" id="labels-print-area">
        {labelsToPrint.map(({ p, idx }, i) => (
          <div key={`${p.id}-${idx}-${i}`} className="border border-border rounded p-2 bg-white text-black text-center break-inside-avoid">
            <div className="text-xs font-bold truncate">{p.name}</div>
            <svg className="label-barcode mx-auto" data-code={p.barcode || String(p.id)} />
            <div className="text-lg font-extrabold text-rose-600">{p.retailPrice} دج</div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #labels-print-area, #labels-print-area * { visibility: visible; }
          #labels-print-area { position: absolute; inset: 0; padding: 8px; }
        }
      `}</style>
    </div>
  );
}
