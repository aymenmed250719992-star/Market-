import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Package, User as UserIcon, Receipt, Sparkles } from "lucide-react";

type Product = { id: number; name: string; barcode?: string; retailPrice?: number };
type Customer = { id: number; name: string; phone?: string };
type Sale = { id: number; total: number; createdAt: string; customerName?: string };
type Promotion = { id: number; title: string; active: boolean };

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("fetch failed");
  return r.json();
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  // Open with Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Reset query when reopening
  useEffect(() => { if (open) setQuery(""); }, [open]);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["search-products"],
    queryFn: () => fetchJson("/api/products"),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["search-customers"],
    queryFn: () => fetchJson("/api/customers"),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: sales = [] } = useQuery<Sale[]>({
    queryKey: ["search-sales"],
    queryFn: () => fetchJson("/api/sales"),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: promos = [] } = useQuery<Promotion[]>({
    queryKey: ["search-promotions"],
    queryFn: () => fetchJson("/api/promotions"),
    enabled: open,
    staleTime: 60_000,
  });

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return { products: [], customers: [], sales: [], promos: [] };
    const limit = 6;
    return {
      products: products
        .filter((p) =>
          p.name?.toLowerCase().includes(q) ||
          (p.barcode && String(p.barcode).includes(q)),
        )
        .slice(0, limit),
      customers: customers
        .filter((c) =>
          c.name?.toLowerCase().includes(q) ||
          (c.phone && String(c.phone).includes(q)),
        )
        .slice(0, limit),
      sales: sales
        .filter((s) =>
          String(s.id).includes(q) ||
          (s.customerName && s.customerName.toLowerCase().includes(q)),
        )
        .slice(0, limit),
      promos: promos
        .filter((p) => p.title?.toLowerCase().includes(q))
        .slice(0, limit),
    };
  }, [q, products, customers, sales, promos]);

  const totalResults =
    results.products.length + results.customers.length + results.sales.length + results.promos.length;

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن منتج، زبون، فاتورة، عرض…"
            className="border-0 focus-visible:ring-0 text-base"
            data-testid="input-global-search"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!q && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              ابدأ الكتابة للبحث في كل التطبيق
              <div className="mt-3 text-xs">
                نصيحة: اضغط <kbd className="bg-muted px-1.5 py-0.5 rounded font-mono">Ctrl</kbd> + <kbd className="bg-muted px-1.5 py-0.5 rounded font-mono">K</kbd> من أي صفحة
              </div>
            </div>
          )}
          {q && totalResults === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">لا توجد نتائج لـ "{query}"</div>
          )}

          {results.products.length > 0 && (
            <Section title="المنتجات" icon={<Package className="h-4 w-4" />}>
              {results.products.map((p) => (
                <Row key={`p-${p.id}`} onClick={() => go("/products")} testId={`search-product-${p.id}`}>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.barcode && <span dir="ltr">{p.barcode}</span>}
                    {p.retailPrice != null && <span className="ms-2">{p.retailPrice} دج</span>}
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {results.customers.length > 0 && (
            <Section title="الزبائن" icon={<UserIcon className="h-4 w-4" />}>
              {results.customers.map((c) => (
                <Row key={`c-${c.id}`} onClick={() => go("/customers")} testId={`search-customer-${c.id}`}>
                  <div className="font-bold">{c.name}</div>
                  {c.phone && <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>}
                </Row>
              ))}
            </Section>
          )}

          {results.sales.length > 0 && (
            <Section title="المبيعات" icon={<Receipt className="h-4 w-4" />}>
              {results.sales.map((s) => (
                <Row key={`s-${s.id}`} onClick={() => go("/reports")} testId={`search-sale-${s.id}`}>
                  <div className="font-bold">فاتورة #{s.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.customerName ?? "—"} · {s.total} دج
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {results.promos.length > 0 && (
            <Section title="العروض" icon={<Sparkles className="h-4 w-4" />}>
              {results.promos.map((p) => (
                <Row key={`pr-${p.id}`} onClick={() => go("/promotions")} testId={`search-promo-${p.id}`}>
                  <div className="font-bold">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.active ? "نشط" : "متوقف"}</div>
                </Row>
              ))}
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-4 py-1 text-xs font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-wide">
        {icon} {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ children, onClick, testId }: { children: React.ReactNode; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-4 py-2.5 hover:bg-muted/60 transition-colors flex flex-col gap-0.5"
      data-testid={testId}
    >
      {children}
    </button>
  );
}
