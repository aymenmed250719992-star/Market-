import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useCreateSale,
  useListCustomers,
  Product,
  CreateSaleBodyPaymentMethod,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, X, AlertCircle, LogOut, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface CartItem extends Product {
  cartQuantity: number;
}

export default function POS() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useListProducts();
  const { data: customers } = useListCustomers();
  const createSale = useCreateSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<CreateSaleBodyPaymentMethod>("cash");
  const [numpadValue, setNumpadValue] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saleCounter, setSaleCounter] = useState(() => Math.floor(20000 + Math.random() * 999));
  const [kgModalOpen, setKgModalOpen] = useState(false);
  const [selectedKgProduct, setSelectedKgProduct] = useState<Product | null>(null);
  const [kgWeight, setKgWeight] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiChat, setAiChat] = useState<Array<{ role: string; text: string; products?: any[] }>>([]);

  // Shift state
  const [activeShift, setActiveShift] = useState<any>(null);
  const [checkingShift, setCheckingShift] = useState(true);
  const [shiftEmployeeBarcode, setShiftEmployeeBarcode] = useState("");
  const [shiftStartingFloat, setShiftStartingFloat] = useState("0");
  const [shiftModalOpen, setShiftModalOpen] = useState(true);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeShiftNotes, setCloseShiftNotes] = useState("");

  const barcodeRef = useRef<HTMLInputElement>(null);

  const checkActiveShift = async () => {
    try {
      setCheckingShift(true);
      const res = await fetch("/api/shifts", { credentials: "include" });
      if (res.ok) {
        const shifts = await res.json();
        const userOpenShift = shifts.find((s: any) => s.cashierId === user?.id && s.status === 'open');
        if (userOpenShift) { setActiveShift(userOpenShift); setShiftModalOpen(false); }
        else setShiftModalOpen(true);
      }
    } catch { /* ignore */ } finally { setCheckingShift(false); }
  };

  useEffect(() => { if (user) checkActiveShift(); }, [user]);

  const openShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/shifts/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => { setActiveShift(data?.shift ?? data); setShiftModalOpen(false); toast({ title: "تم فتح الوردية" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const closeShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/shifts/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { setActiveShift(null); setCloseShiftOpen(false); setShiftModalOpen(true); setCart([]); toast({ title: "تم إغلاق الوردية" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  const subtotal = cart.reduce((s, i) => s + i.retailPrice * i.cartQuantity, 0);
  const total = Math.max(0, subtotal - discount);

  const addProductToCart = (product: Product, qty: number = 1) => {
    if (product.unit === "kg" && !kgModalOpen) {
      setSelectedKgProduct(product);
      setKgWeight("");
      setKgModalOpen(true);
      return;
    }
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + qty } : i);
      const next = [...prev, { ...product, cartQuantity: qty }];
      setSelectedRow(next.length - 1);
      return next;
    });
    setBarcodeInput("");
    barcodeRef.current?.focus();
  };

  const handleBarcodeSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const val = barcodeInput.trim();
    if (!val) return;
    const found = products?.find(p => p.barcode === val || p.name.includes(val));
    if (found) { addProductToCart(found); }
    else toast({ variant: "destructive", title: "المنتج غير موجود", description: `باركود: ${val}` });
  };

  const numpadPress = (key: string) => {
    if (key === "C") { setNumpadValue(""); return; }
    if (key === "⌫") { setNumpadValue(p => p.slice(0, -1)); return; }
    if (key === "✓") {
      const qty = parseFloat(numpadValue);
      if (!isNaN(qty) && qty > 0 && selectedRow !== null && cart[selectedRow]) {
        const item = cart[selectedRow];
        setCart(prev => prev.map((ci, idx) => idx === selectedRow ? { ...ci, cartQuantity: qty } : ci));
        setNumpadValue("");
      }
      return;
    }
    if (key === "+" && selectedRow !== null && cart[selectedRow]) {
      const qty = parseFloat(numpadValue) || 1;
      setCart(prev => prev.map((ci, idx) => idx === selectedRow ? { ...ci, cartQuantity: ci.cartQuantity + qty } : ci));
      setNumpadValue("");
      return;
    }
    if (key === "-" && selectedRow !== null && cart[selectedRow]) {
      const item = cart[selectedRow];
      const qty = parseFloat(numpadValue) || 1;
      const newQ = Math.max(0.001, item.cartQuantity - qty);
      setCart(prev => prev.map((ci, idx) => idx === selectedRow ? { ...ci, cartQuantity: parseFloat(newQ.toFixed(3)) } : ci));
      setNumpadValue("");
      return;
    }
    setNumpadValue(p => p + key);
  };

  const removeSelectedLine = () => {
    if (selectedRow === null) return;
    setCart(prev => prev.filter((_, i) => i !== selectedRow));
    setSelectedRow(null);
  };

  const newSale = () => {
    setCart([]);
    setDiscount(0);
    setCustomerId("");
    setNumpadValue("");
    setSelectedRow(null);
    setSaleCounter(p => p + 1);
    barcodeRef.current?.focus();
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === "karni" && !customerId) {
      toast({ variant: "destructive", title: "يجب اختيار الزبون للبيع بالكرني" });
      return;
    }
    try {
      const res = await createSale.mutateAsync({
        data: {
          cashierId: user!.id,
          customerId: customerId && customerId !== "none" ? parseInt(customerId) : undefined,
          discount,
          paymentMethod,
          items: cart.map(i => ({ productId: i.id, quantity: i.cartQuantity, unit: i.unit })),
        },
      });
      setLastSale(res);
      setReceiptOpen(true);
      newSale();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في البيع", description: e.message });
    }
  };

  const handleKgSubmit = () => {
    const w = parseFloat(kgWeight);
    if (selectedKgProduct && !isNaN(w) && w > 0) {
      setCart(prev => {
        const ex = prev.find(i => i.id === selectedKgProduct.id);
        if (ex) return prev.map(i => i.id === selectedKgProduct.id ? { ...i, cartQuantity: i.cartQuantity + w } : i);
        const next = [...prev, { ...selectedKgProduct, cartQuantity: w }];
        setSelectedRow(next.length - 1);
        return next;
      });
      setKgModalOpen(false);
      setBarcodeInput("");
      barcodeRef.current?.focus();
    }
  };

  const askAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setAiChat(prev => [...prev, { role: "user", text: aiQuery }]);
    const q = aiQuery;
    setAiQuery("");
    try {
      const res = await fetch("/api/ai/inventory-query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, createTaskIfNeeded: true, requesterId: user?.id, requesterName: user?.name }) });
      const data = await res.json();
      setAiChat(prev => [...prev, { role: "ai", text: data.answer, products: data.products }]);
    } catch {
      setAiChat(prev => [...prev, { role: "ai", text: "حدث خطأ في الاتصال بالمساعد" }]);
    }
  };

  const filteredSearch = products?.filter(p => searchQuery && (p.name.includes(searchQuery) || p.barcode?.includes(searchQuery) || p.category?.includes(searchQuery)));

  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;

  // ── SHIFT MODAL ──
  if (checkingShift) return <div className="h-full flex items-center justify-center text-muted-foreground">جاري التحقق من الوردية...</div>;

  if (shiftModalOpen) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <Card className="w-full max-w-md shadow-xl border-primary/20">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
              <AlertCircle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">فتح الوردية</CardTitle>
          </CardHeader>
          <form onSubmit={e => { e.preventDefault(); openShiftMutation.mutate({ employeeBarcode: shiftEmployeeBarcode, startingFloat: parseFloat(shiftStartingFloat) || 0 }); }}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>رقم بطاقة الموظف</Label>
                <Input required autoFocus className="h-12 text-xl text-center font-mono" placeholder="EMP001" value={shiftEmployeeBarcode} onChange={e => setShiftEmployeeBarcode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المبلغ الافتتاحي (دج)</Label>
                <Input required type="number" min="0" className="h-12 text-xl text-center" value={shiftStartingFloat} onChange={e => setShiftStartingFloat(e.target.value)} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={openShiftMutation.isPending}>فتح الوردية</Button>
              <Button type="button" variant="ghost" className="text-muted-foreground text-sm" onClick={() => setShiftModalOpen(false)}>تخطي</Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  // ── MAIN POS ──
  return (
    <div className="flex flex-col h-full -m-6 bg-[#111] text-white overflow-hidden" style={{ fontFamily: "'Courier New', monospace" }}>

      {/* ── HEADER BAR ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0d1f0d] border-b border-green-900 shrink-0">
        <div className="flex gap-6 text-green-400 text-sm">
          <span className="font-bold text-base text-white">SUPERMARCHÉ</span>
          <span>CAISSIER: <span className="text-green-300 font-bold">{user?.name?.toUpperCase() || "CAISSE 01"}</span></span>
          <span>VENTE N°: <span className="text-green-300">{saleCounter}</span></span>
          <span>DU: <span className="text-green-300">{dateStr}</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAiOpen(v => !v)} className="text-xs text-green-600 hover:text-green-400 border border-green-900 px-2 py-1 rounded">
            <Bot className="h-3 w-3 inline mr-1" />AI
          </button>
          <div className="bg-black border-2 border-green-700 rounded px-4 py-1 text-right" style={{ minWidth: 160, fontFamily: "'Courier New', monospace" }}>
            <div className="text-[10px] text-green-700 uppercase">NET À PAYER</div>
            <div className="text-3xl font-bold text-green-400 tracking-widest" style={{ textShadow: "0 0 8px #22c55e" }}>
              {total.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Cart table ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[#222]">

          {/* Customer + search bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] border-b border-[#222] shrink-0">
            <span className="text-xs text-gray-500 whitespace-nowrap">Client:</span>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="bg-[#1a1a1a] border border-[#333] text-white text-xs rounded px-2 py-1 w-40"
            >
              <option value="">— بدون —</option>
              {customers?.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
            </select>
            <span className="text-xs text-gray-500 mx-2 whitespace-nowrap">Code [F5]:</span>
            <div className="flex items-center gap-1 flex-1">
              <input
                ref={barcodeRef}
                autoFocus
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeSearch}
                placeholder="Scanner le codebarre ou nom..."
                className="bg-[#1a1a1a] border border-blue-800 text-white text-sm rounded px-3 py-1 flex-1 focus:outline-none focus:border-blue-500"
                dir="rtl"
              />
              <button onClick={() => setSearchOpen(true)} className="bg-[#333] hover:bg-[#444] text-white border border-[#555] rounded px-2 py-1 text-xs whitespace-nowrap">
                <Search className="h-3 w-3 inline" /> بحث
              </button>
            </div>
          </div>

          {/* Table header */}
          <div className="grid bg-[#1a3a5c] text-white text-xs font-bold px-2 py-1 shrink-0" style={{ gridTemplateColumns: "2fr 5fr 1fr 1fr 1.5fr" }}>
            <span>Code</span>
            <span>Article</span>
            <span className="text-center">PV</span>
            <span className="text-center">Qté</span>
            <span className="text-left">Montant</span>
          </div>

          {/* Cart rows */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                Scanner le codebarre pour ajouter un article
              </div>
            )}
            {cart.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSelectedRow(idx)}
                className={`grid px-2 py-1.5 text-sm cursor-pointer border-b border-[#1a1a1a] transition-colors ${selectedRow === idx ? "bg-[#1a3a1a] border-l-2 border-green-500" : "hover:bg-[#161616]"}`}
                style={{ gridTemplateColumns: "2fr 5fr 1fr 1fr 1.5fr" }}
              >
                <span className="text-gray-400 text-xs font-mono">{item.barcode?.slice(-8) || item.id}</span>
                <span className="truncate text-white">{item.name}</span>
                <span className="text-center text-yellow-400">{item.retailPrice}</span>
                <span className="text-center text-blue-300 font-bold">{item.cartQuantity % 1 !== 0 ? item.cartQuantity.toFixed(2) : item.cartQuantity}</span>
                <span className="text-left text-green-400 font-bold">{(item.retailPrice * item.cartQuantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Bottom status */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-t border-[#222] shrink-0 text-xs text-gray-500">
            <span>LIGNES: {cart.length} &nbsp; ARTICLES: {cart.reduce((s, i) => s + i.cartQuantity, 0)}</span>
            <span>Remise: <span className="text-yellow-400">{discount.toFixed(2)}</span> &nbsp; Net à payer: <span className="text-green-400 font-bold">{total.toFixed(2)}</span> دج</span>
          </div>
        </div>

        {/* ── RIGHT: Action buttons + Numpad ── */}
        <div className="w-56 flex flex-col bg-[#0d0d0d] shrink-0 overflow-y-auto">

          {/* Big action buttons */}
          <div className="p-2 space-y-1">
            <button onClick={newSale} className="w-full py-3 rounded font-bold text-sm bg-[#4a3c8c] hover:bg-[#5a4c9c] text-white border border-[#6a5cac] transition-colors">
              Nouvelle Vente [F1]
            </button>
            <button onClick={handleCompleteSale} disabled={cart.length === 0 || createSale.isPending} className="w-full py-3 rounded font-bold text-sm bg-[#1a6e2e] hover:bg-[#2a7e3e] disabled:opacity-40 text-white border border-[#2a8e4e] transition-colors">
              {createSale.isPending ? "..." : "Valider Vente [F2]"}
            </button>
            <button onClick={() => setReceiptOpen(!!lastSale)} disabled={!lastSale} className="w-full py-2 rounded font-bold text-xs bg-[#8c3a1a] hover:bg-[#9c4a2a] disabled:opacity-40 text-white border border-[#ac5a3a] transition-colors">
              🖨 Ticket [F9]
            </button>
          </div>

          <div className="mx-2 border-t border-[#222]" />

          {/* Remise input */}
          <div className="p-2 space-y-1">
            <div className="text-[10px] text-gray-600 uppercase">Remise (دج)</div>
            <input
              type="number"
              min="0"
              value={discount || ""}
              onChange={e => setDiscount(Number(e.target.value))}
              placeholder="0.00"
              className="w-full bg-[#1a1a1a] border border-[#333] text-yellow-400 text-center text-lg rounded px-2 py-1 focus:outline-none focus:border-yellow-600"
            />
          </div>

          {/* Payment method */}
          <div className="p-2 space-y-1">
            <div className="text-[10px] text-gray-600 uppercase">طريقة الدفع</div>
            <div className="grid grid-cols-2 gap-1">
              {[["cash", "نقداً"], ["karni", "كرني"]].map(([v, l]) => (
                <button key={v} onClick={() => setPaymentMethod(v as any)} className={`py-1.5 rounded text-xs font-bold border transition-colors ${paymentMethod === v ? "bg-green-800 border-green-600 text-white" : "bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-green-800"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-2 border-t border-[#222]" />

          {/* Line operations */}
          <div className="p-2 space-y-1">
            <div className="text-[10px] text-gray-600 uppercase">Terroir caisse</div>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => { if (numpadValue && selectedRow !== null) numpadPress("✓"); }} className="py-1.5 rounded text-xs bg-[#1a3a5c] hover:bg-[#1a4a7c] text-white border border-[#1a3a8c]">
                Modifier
              </button>
              <button onClick={removeSelectedLine} className="py-1.5 rounded text-xs bg-[#5c1a1a] hover:bg-[#7c1a1a] text-white border border-[#8c1a1a]">
                Supprimer
              </button>
            </div>
          </div>

          <div className="mx-2 border-t border-[#222]" />

          {/* Quick qty buttons */}
          <div className="p-2">
            <div className="grid grid-cols-3 gap-1 mb-1">
              {["+1", "-1", "C"].map(k => (
                <button key={k} onClick={() => {
                  if (k === "+1") numpadPress("+");
                  else if (k === "-1") numpadPress("-");
                  else numpadPress("C");
                }} className={`py-1 rounded text-xs font-bold border transition-colors ${k === "+1" ? "bg-[#1a4a1a] border-[#2a5a2a] text-green-400 hover:bg-[#1a5a1a]" : k === "-1" ? "bg-[#4a1a1a] border-[#5a2a2a] text-red-400 hover:bg-[#5a1a1a]" : "bg-[#3a3a1a] border-[#4a4a2a] text-yellow-400 hover:bg-[#4a4a1a]"}`}>
                  {k}
                </button>
              ))}
            </div>

            {/* Numpad display */}
            {numpadValue && (
              <div className="bg-black border border-green-800 text-green-400 text-right px-2 py-0.5 text-lg font-mono rounded mb-1">
                {numpadValue}
              </div>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-4 gap-1">
              {["7","8","9","+","4","5","6","-","1","2","3","⌫","0",".","✓"].map((k, i) => (
                <button
                  key={i}
                  onClick={() => numpadPress(k)}
                  className={`${k === "⌫" || k === "." ? "" : ""} ${k === "✓" ? "col-span-2 bg-green-800 hover:bg-green-700 text-white font-bold" : k === "⌫" ? "bg-[#5c1a1a] hover:bg-[#7c2a2a] text-red-300" : k === "+" || k === "-" ? "bg-[#1a2a4a] hover:bg-[#1a3a5c] text-blue-300" : "bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white"} py-2 rounded text-sm font-bold border border-[#222] transition-colors`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-2 border-t border-[#222]" />

          {/* Close shift */}
          <div className="p-2">
            <button onClick={() => activeShift ? setCloseShiftOpen(true) : toast({ title: "لا توجد وردية نشطة" })} className="w-full py-2 rounded text-xs bg-[#2a1a1a] hover:bg-[#3a1a1a] text-red-500 border border-[#4a1a1a] transition-colors flex items-center justify-center gap-1">
              <LogOut className="h-3 w-3" /> إغلاق الوردية
            </button>
          </div>
        </div>
      </div>

      {/* ── PRODUCT SEARCH DIALOG ── */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl bg-[#111] border-[#333] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">بحث عن منتج</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الباركود أو الفئة..."
            className="w-full bg-[#1a1a1a] border border-[#444] text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500 mb-3"
            dir="rtl"
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filteredSearch?.slice(0, 30).map(p => (
              <div key={p.id} onClick={() => { addProductToCart(p); setSearchOpen(false); setSearchQuery(""); }} className="flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-[#1a3a1a] border border-[#222]">
                <div>
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.category} · {p.barcode}</div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-bold">{p.retailPrice} دج</div>
                  <div className={`text-xs ${p.stock <= 5 ? "text-red-400" : "text-gray-500"}`}>مخزون: {p.stock}</div>
                </div>
              </div>
            ))}
            {searchQuery && (!filteredSearch || filteredSearch.length === 0) && (
              <div className="text-center text-gray-500 py-6">لا توجد نتائج</div>
            )}
            {!searchQuery && (
              <div className="text-center text-gray-600 py-6 text-sm">ابدأ الكتابة للبحث...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── KG DIALOG ── */}
      <Dialog open={kgModalOpen} onOpenChange={setKgModalOpen}>
        <DialogContent className="max-w-sm bg-[#111] border-[#333] text-white">
          <DialogHeader><DialogTitle className="text-white">{selectedKgProduct?.name} — إدخال الوزن</DialogTitle></DialogHeader>
          <div className="py-3">
            <input type="number" step="0.01" min="0.01" autoFocus value={kgWeight} onChange={e => setKgWeight(e.target.value)} onKeyDown={e => e.key === "Enter" && handleKgSubmit()} placeholder="0.000 كغ" className="w-full bg-[#1a1a1a] border border-green-800 text-green-400 text-center text-3xl rounded px-3 py-3 focus:outline-none font-mono" />
          </div>
          <DialogFooter>
            <button onClick={handleKgSubmit} className="w-full py-3 bg-green-800 hover:bg-green-700 text-white rounded font-bold text-lg">تأكيد الوزن</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CLOSE SHIFT DIALOG ── */}
      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent className="max-w-sm bg-[#111] border-[#333] text-white">
          <DialogHeader><DialogTitle className="text-white">إغلاق الوردية</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); closeShiftMutation.mutate({ shiftId: activeShift?.id, closingCash: parseFloat(closingCash) || 0, notes: closeShiftNotes }); }}>
            <div className="space-y-3 py-2">
              <div><label className="text-xs text-gray-500">الإجمالي المتوقع (النظام)</label><div className="text-xl font-bold text-green-400">{total.toFixed(2)} دج</div></div>
              <div><label className="text-xs text-gray-500 block mb-1">النقود الفعلية في الصندوق (دج)</label><input type="number" required value={closingCash} onChange={e => setClosingCash(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#444] text-white rounded px-3 py-2 focus:outline-none text-xl text-center" /></div>
              <div><label className="text-xs text-gray-500 block mb-1">ملاحظات</label><input value={closeShiftNotes} onChange={e => setCloseShiftNotes(e.target.value)} className="w-full bg-[#1a1a1a] border border-[#444] text-white rounded px-3 py-1 focus:outline-none text-sm" dir="rtl" /></div>
            </div>
            <DialogFooter>
              <button type="submit" disabled={closeShiftMutation.isPending} className="w-full py-2 bg-red-900 hover:bg-red-800 text-white rounded font-bold">{closeShiftMutation.isPending ? "جاري الإغلاق..." : "إغلاق الوردية"}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── RECEIPT DIALOG ── */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تذكرة البيع</DialogTitle></DialogHeader>
          {lastSale && (
            <div id="receipt-print-area" className="py-2 space-y-3 bg-white text-black p-4 rounded text-sm">
              <div className="text-center border-b pb-2">
                <div className="text-xl font-bold">SUPERMARCHÉ</div>
                <div className="text-xs text-gray-500">{new Date().toLocaleString("ar-DZ")}</div>
                <div className="text-xs">الكاشير: {user?.name}</div>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b"><th className="text-right">المنتج</th><th>الكمية</th><th>السعر</th><th>المبلغ</th></tr></thead>
                <tbody>
                  {lastSale.items?.map((item: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="py-0.5">{item.productName}</td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-center">{item.price}</td>
                      <td className="text-center font-bold">{item.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between"><span>المجموع</span><span>{lastSale.subtotal} دج</span></div>
                {lastSale.discount > 0 && <div className="flex justify-between text-red-600"><span>خصم</span><span>- {lastSale.discount} دج</span></div>}
                <div className="flex justify-between text-lg font-bold"><span>الإجمالي</span><span>{lastSale.total} دج</span></div>
                <div className="text-xs text-gray-500 text-center pt-1">شكراً لزيارتكم</div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button onClick={() => window.print()} className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-bold text-sm">🖨 طباعة</button>
            <button onClick={() => setReceiptOpen(false)} className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-black rounded font-bold text-sm">إغلاق</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI ASSISTANT ── */}
      <div className={`fixed bottom-0 left-4 z-50 transition-transform duration-300 ${aiOpen ? "translate-y-0" : "translate-y-[calc(100%-36px)]"}`}>
        <div className="w-72 bg-[#0d0d0d] border border-[#333] rounded-t-lg shadow-2xl flex flex-col h-96">
          <button className="h-9 bg-[#1a3a1a] text-green-400 flex items-center justify-between px-3 font-bold text-xs w-full cursor-pointer hover:bg-[#1a4a1a] rounded-t-lg" onClick={() => setAiOpen(v => !v)}>
            <div className="flex items-center gap-1"><Bot className="h-3 w-3" /> مساعد المخزون الذكي</div>
            <X className={`h-3 w-3 transition-transform ${aiOpen ? "" : "rotate-45"}`} />
          </button>
          <div className="flex-1 flex flex-col p-2 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2 text-xs">
              <div className="bg-[#1a2a1a] text-green-300 p-2 rounded text-xs">مرحباً! اسألني عن المخزون والأسعار.</div>
              {aiChat.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`p-2 rounded max-w-[90%] text-xs ${msg.role === "user" ? "bg-blue-900 text-white" : "bg-[#1a2a1a] text-green-300"}`}>{msg.text}</div>
                  {msg.products?.map(p => (
                    <div key={p.id} onClick={() => { addProductToCart(p); setAiOpen(false); }} className="mt-1 bg-[#111] border border-[#333] p-1.5 rounded flex justify-between items-center text-xs cursor-pointer hover:border-green-700 w-full">
                      <span className="truncate">{p.name}</span>
                      <span className="text-green-400 ml-2">{p.retailPrice}دج</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <form onSubmit={askAi} className="flex gap-1 mt-1">
              <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} placeholder="اسأل..." className="flex-1 bg-[#1a1a1a] border border-[#444] text-white text-xs rounded px-2 py-1 focus:outline-none" dir="rtl" />
              <button type="submit" className="bg-green-900 hover:bg-green-800 text-white px-2 py-1 rounded text-xs">إرسال</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
