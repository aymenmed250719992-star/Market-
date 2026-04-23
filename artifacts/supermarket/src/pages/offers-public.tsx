import { useEffect, useState } from "react";
import { Sparkles, Tag } from "lucide-react";

export default function OffersPublic() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/public/offers").then((r) => r.json()).then(setData);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 dark:from-slate-950 dark:to-amber-950 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-extrabold flex items-center justify-center gap-3">
            <Sparkles className="h-10 w-10 text-amber-500" /> عروض اليوم
          </h1>
          <p className="text-muted-foreground">منتجات مختارة من متجرك</p>
        </header>

        {!data && <div className="text-center py-12">جاري التحميل...</div>}

        {data && (
          <>
            <section>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Tag className="h-6 w-6" /> منتجات متوفرة</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.featured.map((p: any) => (
                  <div key={p.id} className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition">
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                    <div className="mt-2 text-2xl font-extrabold text-rose-600">{p.retailPrice} دج</div>
                  </div>
                ))}
              </div>
            </section>

            {data.distributorOffers?.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">عروض الموزعين</h2>
                <div className="space-y-2">
                  {data.distributorOffers.map((o: any) => (
                    <div key={o.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="font-bold">{o.title ?? o.productName}</div>
                      <div className="text-sm text-muted-foreground">{o.description}</div>
                      <div className="text-primary font-bold mt-1">{o.price} دج</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <footer className="text-center text-xs text-muted-foreground py-6">
              آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-DZ")}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
