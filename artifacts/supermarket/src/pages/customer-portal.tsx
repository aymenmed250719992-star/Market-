import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Search, ShoppingBag, Plus, Minus, Receipt, NotebookTabs, LogIn, UserPlus } from "lucide-react";

type Product = {
  id: number;
  name: string;
  category: string;
  retailPrice: number;
  stock: number;
  shelfStock?: number;
};

type CartItem = Product & { quantity: number };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "حدث خطأ في الطلب");
  return data;
}

export default function CustomerPortal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [customerInfo, setCustomerInfo] = useState({ customerName: "", phone: "", address: "", notes: "", paymentMethod: "cash_on_delivery" });
  const [cart, setCart] = useState<Record<number, CartItem>>({});

  const trimmedSearch = search.trim();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["customer-products", trimmedSearch],
    queryFn: () => fetchJson<Product[]>(`/api/products?search=${encodeURIComponent(trimmedSearch)}`),
    enabled: trimmedSearch.length > 0,
  });

  const { data: lookup, refetch: lookupCustomer, isFetching: isLookingUp } = useQuery({
    queryKey: ["customer-lookup", lookupPhone],
    queryFn: () => fetchJson<any>(`/api/online-orders/lookup?phone=${encodeURIComponent(lookupPhone)}`),
    enabled: false,
  });

  const cartItems = Object.values(cart);
  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity * item.retailPrice, 0), [cartItems]);
  const deliveryFee = customerInfo.paymentMethod === "store_pickup" ? 0 : 200;
  const total = subtotal + deliveryFee;

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current[product.id];
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      if (nextQuantity > product.stock) return current;
      return { ...current, [product.id]: { ...product, quantity: nextQuantity } };
    });
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setCart((current) => {
      const item = current[productId];
      if (!item) return current;
      if (quantity <= 0) {
        const { [productId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [productId]: { ...item, quantity: Math.min(quantity, item.stock) } };
    });
  };

  const submitOrder = async () => {
    if (!customerInfo.customerName || !customerInfo.phone || cartItems.length === 0) {
      toast({ variant: "destructive", title: "بيانات ناقصة", description: "أدخل الاسم والهاتف واختر المنتجات" });
      return;
    }
    try {
      const order = await fetchJson<any>("/api/online-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customerInfo,
          items: cartItems.map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      setCart({});
      queryClient.invalidateQueries({ queryKey: ["customer-lookup"] });
      toast({ title: "تم إرسال الطلب", description: `رقم الطلب #${order.id}، الإجمالي ${order.total} دج` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "تعذر إرسال الطلب", description: error.message });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-7xl p-6 space-y-6">
        <div className="flex justify-end gap-2">
          <a href="/login">
            <Button variant="outline" size="sm">
              <LogIn className="ml-2 h-4 w-4" />
              تسجيل الدخول
            </Button>
          </a>
          <a href="/register">
            <Button size="sm">
              <UserPlus className="ml-2 h-4 w-4" />
              تسجيل حساب جديد
            </Button>
          </a>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="ابحث عن منتج..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {trimmedSearch.length === 0 ? (
                <div className="text-muted-foreground col-span-full text-center py-8">ابحث عن منتج لعرض النتائج</div>
              ) : isLoading ? (
                <div className="text-muted-foreground col-span-full">جاري تحميل المنتجات...</div>
              ) : products.length === 0 ? (
                <div className="text-muted-foreground col-span-full text-center py-8">لا توجد منتجات مطابقة</div>
              ) : products.map((product) => (
                <div key={product.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-lg">{product.name}</h3>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-primary">{product.retailPrice} دج</span>
                    <span className="text-sm text-muted-foreground">المتوفر: {product.stock}</span>
                  </div>
                  <Button className="w-full" disabled={product.stock <= 0} onClick={() => addToCart(product)}>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة للسلة
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h2 className="text-xl font-bold">سلة الشراء</h2>
              {cartItems.length === 0 ? (
                <p className="text-muted-foreground">السلة فارغة</p>
              ) : cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.retailPrice} دج</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" onClick={() => updateQuantity(item.id, item.quantity - 1)}><Minus className="h-4 w-4" /></Button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <Button size="icon" variant="outline" onClick={() => updateQuantity(item.id, item.quantity + 1)}><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex justify-between"><span>المجموع</span><span>{subtotal} دج</span></div>
                <div className="flex justify-between"><span>التوصيل</span><span>{deliveryFee} دج</span></div>
                <div className="flex justify-between text-lg font-bold"><span>الإجمالي</span><span>{total} دج</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h2 className="text-xl font-bold">معلومات الطلب</h2>
              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input value={customerInfo.customerName} onChange={(e) => setCustomerInfo({ ...customerInfo, customerName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input dir="ltr" className="text-right" value={customerInfo.phone} onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input value={customerInfo.address} onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={customerInfo.paymentMethod} onValueChange={(value) => setCustomerInfo({ ...customerInfo, paymentMethod: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_on_delivery">الدفع عند الاستلام</SelectItem>
                    <SelectItem value="store_pickup">استلام من المتجر</SelectItem>
                    <SelectItem value="karni">تسجيل على الكرني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={customerInfo.notes} onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })} />
              </div>
              <Button className="w-full" onClick={submitOrder}>
                <ShoppingBag className="ml-2 h-4 w-4" />
                تأكيد الطلب
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><NotebookTabs className="h-5 w-5" /> متابعة الكرني والفواتير</h2>
              <div className="flex gap-2">
                <Input dir="ltr" className="text-right" placeholder="رقم الهاتف" value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} />
                <Button disabled={!lookupPhone || isLookingUp} onClick={() => lookupCustomer()}>بحث</Button>
              </div>
              {lookup && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-secondary p-3">
                    <div className="font-bold">{lookup.customer?.name || "زبون غير مسجل في الكرني"}</div>
                    <div className="text-sm text-muted-foreground">الدين الحالي: {lookup.customer?.totalDebt ?? 0} دج</div>
                    <div className="text-sm text-muted-foreground">حد الدين: {lookup.customer?.creditLimit ?? 0} دج</div>
                  </div>
                  <div>
                    <h3 className="font-bold mb-2 flex items-center gap-2"><Receipt className="h-4 w-4" /> آخر الطلبات</h3>
                    <Table>
                      <TableHeader><TableRow><TableHead>الرقم</TableHead><TableHead>الحالة</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {lookup.orders?.slice(0, 5).map((order: any) => (
                          <TableRow key={order.id}><TableCell>#{order.id}</TableCell><TableCell>{order.status}</TableCell><TableCell>{order.total} دج</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}