import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  useListProducts, 
  useCreateSale, 
  useListCustomers,
  useGetProductByBarcode,
  Product,
  SalePaymentMethod,
  CreateSaleBodyPaymentMethod,
  Customer
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, Printer, Bot, X, AlertCircle, LogOut, BellRing } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface CartItem extends Product {
  cartQuantity: number;
}

export default function POS() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Data fetching
  const { data: products } = useListProducts();
  const { data: customers } = useListCustomers();
  const createSale = useCreateSale();
  
  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<CreateSaleBodyPaymentMethod>("cash");
  
  // Shift state
  const [activeShift, setActiveShift] = useState<any>(null);
  const [checkingShift, setCheckingShift] = useState(true);
  const [shiftEmployeeBarcode, setShiftEmployeeBarcode] = useState("");
  const [shiftStartingFloat, setShiftStartingFloat] = useState("0");
  const [shiftModalOpen, setShiftModalOpen] = useState(true);

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeShiftNotes, setCloseShiftNotes] = useState("");

  const checkActiveShift = async () => {
    try {
      setCheckingShift(true);
      const res = await fetch("/api/shifts", { credentials: "include" });
      if (res.ok) {
        const shifts = await res.json();
        const userOpenShift = shifts.find((s: any) => s.cashierId === user?.id && s.status === 'open');
        if (userOpenShift) {
          setActiveShift(userOpenShift);
          setShiftModalOpen(false);
        } else {
          setShiftModalOpen(true);
        }
      }
    } catch (e) {
      console.error("Failed to check shift", e);
    } finally {
      setCheckingShift(false);
    }
  };

  useEffect(() => {
    if (user) checkActiveShift();
  }, [user]);

  const openShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/shifts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to open shift");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActiveShift(data?.shift ?? data);
      setShiftModalOpen(false);
      toast({ title: "تم", description: "تم فتح الوردية بنجاح" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  });

  const closeShiftMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to close shift");
      }
      return res.json();
    },
    onSuccess: () => {
      setActiveShift(null);
      setCloseShiftOpen(false);
      setShiftModalOpen(true);
      setCart([]);
      toast({ title: "تم", description: "تم إغلاق الوردية بنجاح" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  });

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    openShiftMutation.mutate({
      employeeBarcode: shiftEmployeeBarcode,
      startingFloat: parseFloat(shiftStartingFloat) || 0
    });
  };

  const handleSkipShift = () => {
    setShiftModalOpen(false);
    toast({ description: "تم تجاوز فتح الوردية (وضع التطوير)" });
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    closeShiftMutation.mutate({
      shiftId: activeShift?.id,
      closingCash: parseFloat(closingCash) || 0,
      notes: closeShiftNotes
    });
  };

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.name.includes(search) || p.barcode?.includes(search);
    const matchesCat = category === "all" || p.category === category;
    return matchesSearch && matchesCat;
  });

  const categories = ["all", ...Array.from(new Set(products?.map(p => p.category) || []))];

  const addToCart = (product: Product, qty: number = 1) => {
    if (product.unit === 'kg' && qty === 1 && !kgModalOpen) {
      setSelectedKgProduct(product);
      setKgWeight("");
      setKgModalOpen(true);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + qty } : item);
      }
      return [...prev, { ...product, cartQuantity: qty }];
    });
    setSearch("");
    searchInputRef.current?.focus();
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.cartQuantity + delta;
        return newQty > 0 ? { ...item, cartQuantity: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredProducts?.length === 1) {
      addToCart(filteredProducts[0]);
    }
  };

  const handleKgSubmit = () => {
    const weight = parseFloat(kgWeight);
    if (selectedKgProduct && !isNaN(weight) && weight > 0) {
      setCart(prev => {
        const existing = prev.find(item => item.id === selectedKgProduct.id);
        if (existing) {
          return prev.map(item => item.id === selectedKgProduct.id ? { ...item, cartQuantity: item.cartQuantity + weight } : item);
        }
        return [...prev, { ...selectedKgProduct, cartQuantity: weight }];
      });
      setKgModalOpen(false);
      setSearch("");
      searchInputRef.current?.focus();
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.retailPrice * item.cartQuantity), 0);
  const total = Math.max(0, subtotal - discount);

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'karni' && !customerId) {
      toast({ variant: "destructive", title: "خطأ", description: "يجب اختيار الزبون للبيع بالكرني" });
      return;
    }

    try {
      const res = await createSale.mutateAsync({
        data: {
          cashierId: user!.id,
          customerId: customerId ? parseInt(customerId) : undefined,
          discount,
          paymentMethod,
          items: cart.map(item => ({
            productId: item.id,
            quantity: item.cartQuantity,
            unit: item.unit
          }))
        }
      });
      setLastSale(res);
      setReceiptOpen(true);
      setCart([]);
      setDiscount(0);
      setCustomerId("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ في البيع", description: error.message });
    }
  };

  const createRestockTask = async (product: Product) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `تعبئة رف ${product.name}`,
          description: `طلب سريع من نقطة البيع: المخزون على الرف منخفض (${product.stock} ${product.unit})`,
          type: "restock",
          points: 10,
          productId: product.id,
          productName: product.name,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "تعذر إنشاء المهمة");
      toast({ title: "تم إنشاء مهمة", description: `تم إرسال طلب تعبئة ${product.name} للعامل` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const holdCart = () => {
    if (cart.length === 0) return;
    localStorage.setItem('held_cart', JSON.stringify(cart));
    setCart([]);
    toast({ title: "تم الحفظ", description: "تم تعليق السلة" });
  };

  const resumeCart = () => {
    const saved = localStorage.getItem('held_cart');
    if (saved) {
      setCart(JSON.parse(saved));
      localStorage.removeItem('held_cart');
    }
  };

  const askAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    
    setAiChat(prev => [...prev, { role: 'user', text: aiQuery }]);
    const query = aiQuery;
    setAiQuery("");
    
    try {
      const res = await fetch('/api/ai/inventory-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: query,
          createTaskIfNeeded: true,
          requesterId: user?.id,
          requesterName: user?.name
        })
      });
      const data = await res.json();
      
      setAiChat(prev => [...prev, { role: 'ai', text: data.answer, products: data.products }]);
      
      if (data.taskCreated) {
        toast({ title: "مهمة تلقائية", description: "تم إنشاء مهمة للعامل تلقائياً بناءً على طلبك" });
      }
    } catch (error) {
      setAiChat(prev => [...prev, { role: 'ai', text: "حدث خطأ في الاتصال بالمساعد الذكي" }]);
    }
  };

  if (checkingShift) {
    return <div className="h-full flex items-center justify-center">جاري التحقق من الوردية...</div>;
  }

  if (shiftModalOpen) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <Card className="w-full max-w-md shadow-xl border-primary/20">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
              <AlertCircle className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">فحص بطاقة الموظف لفتح الوردية</CardTitle>
          </CardHeader>
          <form onSubmit={handleOpenShift}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-lg">رقم بطاقة الموظف / الباركود</Label>
                <Input 
                  required 
                  autoFocus
                  className="h-14 text-xl text-center font-mono"
                  placeholder="اسحب البطاقة أو اكتب الرقم..."
                  value={shiftEmployeeBarcode}
                  onChange={e => setShiftEmployeeBarcode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-lg">المبلغ الافتتاحي في الصندوق (دج)</Label>
                <Input 
                  required 
                  type="number"
                  min="0"
                  className="h-14 text-xl text-center"
                  value={shiftStartingFloat}
                  onChange={e => setShiftStartingFloat(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full h-14 text-xl font-bold" disabled={openShiftMutation.isPending}>
                {openShiftMutation.isPending ? "جاري الفتح..." : "فتح الوردية"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleSkipShift} className="text-muted-foreground">
                تخطي (للتطوير فقط)
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 -m-6 p-6">
      {/* Left Panel: Catalog */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="ابحث بالاسم أو الباركود... (Enter للإضافة السريعة)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="pl-4 pr-10 text-lg h-12"
            data-testid="input-pos-search"
          />
        </div>
        
        <ScrollArea className="whitespace-nowrap pb-2">
          <div className="flex gap-2">
            {categories.map(cat => (
              <Button
                key={cat}
                variant={category === cat ? "default" : "outline"}
                onClick={() => setCategory(cat)}
                className="shrink-0"
              >
                {cat === "all" ? "الكل" : cat}
              </Button>
            ))}
          </div>
        </ScrollArea>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
            {filteredProducts?.map(p => (
              <Card 
                key={p.id} 
                className="cursor-pointer hover:border-primary transition-colors flex flex-col h-full"
                onClick={() => addToCart(p)}
                data-testid={`card-product-${p.id}`}
              >
                <CardContent className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold line-clamp-2">{p.name}</h3>
                    <p className="text-muted-foreground text-sm">{p.category}</p>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <span className="text-xl font-bold text-primary">{p.retailPrice} دج</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${p.stock <= 5 ? (p.stock === 0 ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent') : 'bg-secondary/10'}`}>
                      {p.stock} {p.unit === 'piece' ? 'حبة' : p.unit === 'kg' ? 'كغ' : 'كرتون'}
                    </span>
                  </div>
                  {p.stock <= 5 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full gap-2 border-accent/50 text-accent hover:bg-accent/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        createRestockTask(p);
                      }}
                    >
                      <BellRing className="h-4 w-4" />
                      طلب تعبئة
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel: Cart */}
      <div className="w-96 flex flex-col bg-card border border-border rounded-lg overflow-hidden shrink-0">
        <div className="p-4 bg-secondary text-secondary-foreground font-bold flex justify-between items-center">
          <span>السلة ({cart.length})</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={holdCart} title="تعليق السلة"><ClockIcon /></Button>
            <Button size="sm" variant="ghost" onClick={resumeCart} title="استرجاع السلة"><HistoryIcon /></Button>
            <Button size="sm" variant="ghost" onClick={() => setCart([])} title="إفراغ السلة"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {cart.map(item => (
              <div key={item.id} className="flex gap-3 items-center border-b border-border pb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{item.name}</div>
                  <div className="text-primary text-sm">{item.retailPrice} دج x {item.cartQuantity} {item.unit}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-4 w-4" /></Button>
                  <span className="w-6 text-center font-bold">{item.cartQuantity}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="font-bold w-20 text-left">
                  {item.retailPrice * item.cartQuantity}
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="text-center text-muted-foreground py-10">السلة فارغة</div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-muted/20 space-y-4">
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">الزبون (اختياري، إلزامي للكرني)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر زبون..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون زبون</SelectItem>
                  {customers?.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs mb-1 block">تخفيض (دج)</Label>
                <Input type="number" min="0" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-2 block">طريقة الدفع</Label>
              <RadioGroup value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)} className="flex gap-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="cash" id="r-cash" />
                  <Label htmlFor="r-cash" className="cursor-pointer">نقداً</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse text-destructive font-bold">
                  <RadioGroupItem value="karni" id="r-karni" />
                  <Label htmlFor="r-karni" className="cursor-pointer">كرني</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span>{subtotal} دج</span>
            </div>
            <div className="flex justify-between mb-2 text-destructive">
              <span>التخفيض</span>
              <span>- {discount} دج</span>
            </div>
            <div className="flex justify-between text-2xl font-bold text-primary mb-4">
              <span>الإجمالي</span>
              <span>{total} دج</span>
            </div>
            <Button 
              className="w-full h-14 text-lg font-bold" 
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || createSale.isPending}
              data-testid="button-complete-sale"
            >
              {createSale.isPending ? "جاري التنفيذ..." : "إتمام البيع"}
            </Button>

            <Button 
              variant="destructive"
              className="w-full mt-4" 
              onClick={() => {
                if (activeShift) {
                  setClosingCash("");
                  setCloseShiftNotes("");
                  setCloseShiftOpen(true);
                } else {
                  toast({ title: "لا توجد وردية نشطة", variant: "destructive" });
                }
              }}
            >
              <LogOut className="h-4 w-4 ml-2" /> إغلاق الوردية
            </Button>
          </div>
        </div>
      </div>

      {/* AI Assistant Toggle & Panel */}
      <div className={`fixed bottom-0 left-6 z-50 transition-transform duration-300 ${aiOpen ? 'translate-y-0' : 'translate-y-[calc(100%-48px)]'}`}>
        <div className="w-80 bg-card border border-border rounded-t-xl shadow-2xl overflow-hidden flex flex-col h-[500px]">
          <button 
            className="h-12 bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 font-bold w-full cursor-pointer hover:bg-sidebar/90"
            onClick={() => setAiOpen(!aiOpen)}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent" />
              مساعد المخزون الذكي
            </div>
            <X className={`h-4 w-4 transition-transform ${aiOpen ? '' : 'rotate-45'}`} />
          </button>
          
          <div className="flex-1 flex flex-col p-4 bg-muted/10 overflow-hidden">
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4 pb-4">
                <div className="bg-sidebar text-sidebar-foreground p-3 rounded-lg rounded-tr-none text-sm">
                  مرحباً! أنا مساعد المخزون الذكي. يمكنك سؤالي عن توفر المنتجات، أسعارها، أو المنتجات المنتهية الصلاحية.
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <p>أمثلة:</p>
                    <p className="cursor-pointer hover:text-accent" onClick={() => setAiQuery("هل يوجد حليب؟")}>• هل يوجد حليب؟</p>
                    <p className="cursor-pointer hover:text-accent" onClick={() => setAiQuery("ما هو سعر الأرز؟")}>• ما هو سعر الأرز؟</p>
                  </div>
                </div>
                
                {aiChat.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 rounded-lg max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tl-none' : 'bg-sidebar text-sidebar-foreground rounded-tr-none'}`}>
                      {msg.text}
                    </div>
                    {msg.products && msg.products.length > 0 && (
                      <div className="mt-2 w-full space-y-2">
                        {msg.products.map(p => (
                          <div key={p.id} className="bg-card border border-border p-2 rounded flex justify-between items-center text-xs shadow-sm">
                            <span className="font-bold truncate max-w-[120px]">{p.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-primary">{p.retailPrice}دج</span>
                              <Button size="sm" variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => {addToCart(p); setAiOpen(false);}}>إضافة</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <form onSubmit={askAi} className="mt-4 flex gap-2">
              <Input 
                value={aiQuery} 
                onChange={e => setAiQuery(e.target.value)} 
                placeholder="اسأل المساعد..." 
                className="flex-1"
              />
              <Button type="submit" size="icon"><Bot className="h-4 w-4" /></Button>
            </form>
          </div>
        </div>
      </div>

      {/* Kg Input Modal */}
      <Dialog open={kgModalOpen} onOpenChange={setKgModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إدخال الوزن (كغ)</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="font-bold text-lg">{selectedKgProduct?.name}</div>
            <div className="flex gap-2 items-center">
              <Input 
                type="number" 
                step="0.01" 
                min="0.01" 
                autoFocus
                value={kgWeight} 
                onChange={e => setKgWeight(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleKgSubmit()}
                placeholder="0.00"
                className="text-xl h-14"
              />
              <span className="text-xl font-bold">كغ</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleKgSubmit} className="w-full h-12 text-lg">تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تم البيع بنجاح</DialogTitle>
          </DialogHeader>
          <div id="receipt-print-area" className="py-4 space-y-4 bg-white text-black p-6 rounded-md">
            <div className="text-center pb-4 border-b border-gray-200">
              <h2 className="text-2xl font-bold">متجر الجزائر</h2>
              <p className="text-sm text-gray-500">{new Date().toLocaleString('ar-DZ')}</p>
              <p className="text-sm">الكاشير: {user?.name}</p>
              {lastSale?.customerName && <p className="text-sm font-bold mt-1">الزبون: {lastSale.customerName}</p>}
            </div>
            
            <div className="space-y-2 py-2 text-sm border-b border-gray-200">
              {lastSale?.items.map((item: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <div className="flex-1">
                    <div>{item.productName}</div>
                    <div className="text-gray-500">{item.quantity} {item.unit} x {item.price}</div>
                  </div>
                  <div className="font-bold">{item.subtotal} دج</div>
                </div>
              ))}
            </div>

            <div className="pt-2 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>المجموع:</span>
                <span>{lastSale?.subtotal} دج</span>
              </div>
              {lastSale?.discount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>تخفيض:</span>
                  <span>- {lastSale?.discount} دج</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold mt-2">
                <span>الإجمالي:</span>
                <span>{lastSale?.total} دج</span>
              </div>
            </div>
            
            <div className="text-center text-sm pt-4 font-bold">
              طريقة الدفع: {lastSale?.paymentMethod === 'cash' ? 'نقداً' : lastSale?.paymentMethod === 'karni' ? 'كرني' : 'محلي'}
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>إغلاق</Button>
            <Button onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Modal */}
      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">إغلاق الوردية</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCloseShift}>
            <div className="py-4 space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span>الصندوق الافتتاحي:</span>
                  <span className="font-bold">{activeShift?.startingFloat || 0} دج</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>مبيعات النظام (نقداً):</span>
                  <span className="font-bold">{activeShift?.systemTotal || 0} دج</span>
                </div>
                <div className="flex justify-between text-lg border-t border-border pt-2 mt-2 font-bold">
                  <span>المتوقع في الصندوق:</span>
                  <span className="text-primary">{(activeShift?.startingFloat || 0) + (activeShift?.systemTotal || 0)} دج</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>المبلغ الفعلي في الصندوق (دج) - عدّ النقود</Label>
                <Input 
                  required 
                  type="number"
                  min="0"
                  className="h-12 text-xl font-bold"
                  value={closingCash}
                  onChange={e => setClosingCash(e.target.value)}
                />
              </div>

              {closingCash !== "" && (
                <div className={`p-3 rounded-lg border font-bold flex justify-between ${
                  (parseFloat(closingCash) - ((activeShift?.startingFloat || 0) + (activeShift?.systemTotal || 0))) >= 0 
                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20' 
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20'
                }`}>
                  <span>الفرق (عجز / فائض):</span>
                  <span dir="ltr">
                    {(parseFloat(closingCash) - ((activeShift?.startingFloat || 0) + (activeShift?.systemTotal || 0))) > 0 ? '+' : ''}
                    {(parseFloat(closingCash) - ((activeShift?.startingFloat || 0) + (activeShift?.systemTotal || 0)))} دج
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label>ملاحظات (اختياري)</Label>
                <Input 
                  value={closeShiftNotes}
                  onChange={e => setCloseShiftNotes(e.target.value)}
                  placeholder="سبب العجز أو الفائض إن وجد..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseShiftOpen(false)}>إلغاء</Button>
              <Button type="submit" variant="destructive" disabled={closeShiftMutation.isPending}>
                {closeShiftMutation.isPending ? "جاري الإغلاق..." : "تأكيد الإغلاق"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Dummy icons for buttons
function ClockIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function HistoryIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>; }