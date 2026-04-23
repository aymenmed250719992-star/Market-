import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, getListProductsQueryKey, Product } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, AlertTriangle, Package, Camera, PackagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { BarcodeScanner } from "@/components/BarcodeScanner";

export default function Products() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "buyer";
  const canDelete = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const hasFilter = debouncedSearch.length > 0 || category !== "all";
  const productsParams = {
    search: debouncedSearch || undefined,
    category: category !== "all" ? category : undefined,
  };
  const { data: products, isLoading } = useListProducts(productsParams, {
    query: {
      enabled: hasFilter,
      queryKey: getListProductsQueryKey(productsParams),
    },
  });

  const { data: categoriesList = [] } = useQuery<string[]>({
    queryKey: ["product-categories"],
    queryFn: () => fetch("/api/products/categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanSearchOpen, setScanSearchOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    barcode: "",
    cartonBarcode: "",
    category: "",
    wholesalePrice: "",
    retailPrice: "",
    profitMargin: "",
    stock: "",
    shelfStock: "",
    warehouseStock: "",
    unit: "piece",
    cartonSize: "",
    unitsPerCarton: "",
    expiryDate: "",
    supplier: ""
  });

  const categories = ["all", ...categoriesList];

  const handleOpenModal = (product?: any) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        barcode: product.barcode || "",
        cartonBarcode: product.cartonBarcode || "",
        category: product.category,
        wholesalePrice: product.wholesalePrice.toString(),
        retailPrice: product.retailPrice.toString(),
        profitMargin: product.profitMargin?.toString() || "",
        stock: product.stock.toString(),
        shelfStock: product.shelfStock?.toString() || product.stock.toString(),
        warehouseStock: product.warehouseStock?.toString() || "0",
        unit: product.unit,
        cartonSize: product.cartonSize?.toString() || "",
        unitsPerCarton: product.unitsPerCarton?.toString() || "",
        expiryDate: product.expiryDate ? format(new Date(product.expiryDate), "yyyy-MM-dd") : "",
        supplier: product.supplier || ""
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        barcode: "",
        cartonBarcode: "",
        category: "",
        wholesalePrice: "",
        retailPrice: "",
        profitMargin: "",
        stock: "0",
        shelfStock: "0",
        warehouseStock: "0",
        unit: "piece",
        cartonSize: "",
        unitsPerCarton: "",
        expiryDate: "",
        supplier: ""
      });
    }
    setIsModalOpen(true);
  };

  const handlePriceChange = (field: 'wholesale' | 'margin' | 'retail', value: string) => {
    const newData = { ...formData, [field === 'wholesale' ? 'wholesalePrice' : field === 'margin' ? 'profitMargin' : 'retailPrice']: value };
    
    const wholesale = parseFloat(newData.wholesalePrice) || 0;
    const units = parseFloat(newData.unitsPerCarton) || 1;
    const unitWholesale = wholesale / units;

    if (field === 'wholesale' || field === 'margin') {
      const margin = parseFloat(newData.profitMargin) || 0;
      if (wholesale > 0 && margin > 0) {
        newData.retailPrice = (unitWholesale * (1 + margin / 100)).toFixed(2);
      }
    } else if (field === 'retail') {
      const retail = parseFloat(newData.retailPrice) || 0;
      if (wholesale > 0 && retail > 0) {
        newData.profitMargin = (((retail / unitWholesale) - 1) * 100).toFixed(2);
      }
    }
    setFormData(newData);
  };

  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockCartons, setRestockCartons] = useState("");

  const handleRestock = async () => {
    try {
      const cartonsToMove = parseInt(restockCartons);
      if (!cartonsToMove || cartonsToMove <= 0) throw new Error("الكمية غير صحيحة");
      const res = await fetch(`/api/products/${restockProduct.id}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartonsToMove }),
        credentials: "include"
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "تعذّر نقل المخزون");
      }
      toast({ title: "تم النقل", description: "تم نقل المخزون للرف بنجاح" });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setRestockModalOpen(false);
      setRestockCartons("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addStockProduct, setAddStockProduct] = useState<any>(null);
  const [addStockQty, setAddStockQty] = useState("");
  const [addStockLocation, setAddStockLocation] = useState<"shelf" | "warehouse">("shelf");
  const [addStockSupplier, setAddStockSupplier] = useState("");

  const openAddStock = (product: any) => {
    setAddStockProduct(product);
    setAddStockQty("");
    setAddStockLocation("shelf");
    setAddStockSupplier(product.supplier ?? "");
    setAddStockOpen(true);
  };

  const handleAddStock = async () => {
    try {
      const quantity = parseFloat(addStockQty);
      if (!quantity || quantity <= 0) throw new Error("أدخل كمية صحيحة");
      const res = await fetch(`/api/products/${addStockProduct.id}/add-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          location: addStockLocation,
          supplier: addStockSupplier.trim() || undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "تعذّر إضافة الكمية");
      }
      toast({ title: "تمت الإضافة", description: `تمت إضافة ${quantity} للمخزون` });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setAddStockOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: formData.name,
        barcode: formData.barcode || null,
        cartonBarcode: formData.cartonBarcode || null,
        category: formData.category,
        wholesalePrice: parseFloat(formData.wholesalePrice),
        retailPrice: parseFloat(formData.retailPrice),
        profitMargin: formData.profitMargin ? parseFloat(formData.profitMargin) : null,
        stock: parseFloat(formData.shelfStock) + parseFloat(formData.warehouseStock),
        shelfStock: parseFloat(formData.shelfStock),
        warehouseStock: parseFloat(formData.warehouseStock),
        unit: formData.unit,
        unitsPerCarton: formData.unitsPerCarton ? parseInt(formData.unitsPerCarton) : null,
        cartonSize: formData.cartonSize ? parseFloat(formData.cartonSize) : null,
        expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString() : null,
        supplier: formData.supplier || null
      };

      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, data: payload });
        toast({ title: "تم التحديث", description: "تم تحديث المنتج بنجاح" });
      } else {
        await createProduct.mutateAsync({ data: payload });
        toast({ title: "تمت الإضافة", description: "تم إضافة المنتج بنجاح" });
      }
      
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setIsModalOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا المنتج؟")) {
      try {
        await deleteProduct.mutateAsync({ id });
        toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح" });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      } catch (error: any) {
        toast({ variant: "destructive", title: "خطأ", description: error.message });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="h-8 w-8" />
          المنتجات
        </h1>
        {canEdit && (
          <Button onClick={() => handleOpenModal()} data-testid="button-add-product">
            <Plus className="ml-2 h-4 w-4" /> إضافة منتج
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="بحث بالاسم أو الباركود..." 
            className="pl-4 pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-product"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => setScanSearchOpen(true)}>
          <Camera className="ml-2 h-4 w-4" /> مسح بالكاميرا
        </Button>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="اختر الفئة" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c === "all" ? "كل الفئات" : c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الباركود</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>سعر البيع</TableHead>
              <TableHead>الرف</TableHead>
              <TableHead>المستودع</TableHead>
              <TableHead>تاريخ الصلاحية</TableHead>
              {(canEdit || canDelete) && <TableHead className="text-left">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1,2,3,4,5].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : products?.map((product: any) => {
              const daysToExpiry = product.expiryDate ? differenceInDays(new Date(product.expiryDate), new Date()) : null;
              const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0;
              const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
              const lowStockThreshold = 5;
              const lowWarehouseThreshold = 2;
              
              const shelfStock = product.shelfStock ?? product.stock;
              const warehouseStock = product.warehouseStock ?? 0;

              return (
                <TableRow key={product.id} className={warehouseStock <= lowWarehouseThreshold ? "border-l-4 border-l-orange-500" : ""}>
                  <TableCell className="font-mono text-sm">{product.barcode || '-'}</TableCell>
                  <TableCell className="font-bold">{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{product.retailPrice} دج</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      shelfStock === 0 ? 'bg-destructive/10 text-destructive' : 
                      shelfStock <= lowStockThreshold ? 'bg-amber-500/10 text-amber-600' : 
                      'bg-secondary text-secondary-foreground'
                    }`}>
                      {shelfStock} {product.unit === 'piece' ? 'حبة' : product.unit === 'kg' ? 'كغ' : 'كرتون'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      warehouseStock <= lowWarehouseThreshold ? 'bg-orange-500/10 text-orange-600' : 'bg-secondary text-secondary-foreground'
                    }`}>
                      {warehouseStock} كرتون
                    </span>
                  </TableCell>
                  <TableCell>
                    {product.expiryDate ? (
                      <div className="flex items-center gap-2">
                        {format(new Date(product.expiryDate), "yyyy/MM/dd")}
                        {isExpiringSoon && <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> قريباً</span>}
                        {isExpired && <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> منتهي</span>}
                      </div>
                    ) : '-'}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-left">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button variant="ghost" size="icon" title="إضافة كمية" onClick={() => openAddStock(product)} data-testid={`button-add-stock-${product.id}`}>
                            <PackagePlus className="h-4 w-4 text-emerald-500" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button variant="ghost" size="icon" title="تعديل" onClick={() => handleOpenModal(product)} data-testid={`button-edit-product-${product.id}`}>
                            <Edit className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" title="حذف" onClick={() => handleDelete(product.id)} data-testid={`button-delete-product-${product.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!hasFilter && (
              <TableRow>
                <TableCell colSpan={canEdit || canDelete ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  ابحث عن منتج أو اختر فئة لعرض المنتجات
                </TableCell>
              </TableRow>
            )}
            {hasFilter && !isLoading && products?.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit || canDelete ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  لا توجد منتجات مطابقة
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الباركود (اختياري)</Label>
              <div className="flex gap-2">
                <Input className="font-mono text-left" dir="ltr" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} />
                <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="مسح الباركود بالكاميرا">
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Input required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الوحدة</Label>
              <Select value={formData.unit} onValueChange={v => setFormData({...formData, unit: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="piece">حبة</SelectItem>
                  <SelectItem value="kg">كيلوغرام</SelectItem>
                  <SelectItem value="carton">كرتون</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>سعر الجملة (دج)</Label>
              <Input required type="number" step="0.01" value={formData.wholesalePrice} onChange={e => setFormData({...formData, wholesalePrice: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>سعر البيع (دج)</Label>
              <Input required type="number" step="0.01" value={formData.retailPrice} onChange={e => setFormData({...formData, retailPrice: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>المخزون الحالي</Label>
              <Input required type="number" step="0.01" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الصلاحية (اختياري)</Label>
              <Input type="date" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>المورد (اختياري)</Label>
              <Input value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} />
            </div>
            <DialogFooter className="col-span-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                {editingProduct ? "تحديث" : "إضافة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => { setFormData(prev => ({ ...prev, barcode: code })); setScannerOpen(false); }}
      />

      <BarcodeScanner
        open={scanSearchOpen}
        onClose={() => setScanSearchOpen(false)}
        onDetected={(code) => { setSearch(code); setScanSearchOpen(false); }}
      />

      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة كمية للمخزون</DialogTitle>
          </DialogHeader>
          {addStockProduct && (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="font-bold">{addStockProduct.name}</div>
                <div className="text-xs text-muted-foreground">باركود: {addStockProduct.barcode || "-"}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>الرف الحالي: <span className="font-bold">{addStockProduct.shelfStock ?? 0}</span></div>
                  <div>المستودع الحالي: <span className="font-bold">{addStockProduct.warehouseStock ?? 0}</span></div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>الكمية المضافة</Label>
                <Input type="number" min="1" inputMode="numeric" value={addStockQty} onChange={(e) => setAddStockQty(e.target.value)} data-testid="input-add-stock-qty" />
              </div>
              <div className="space-y-2">
                <Label>الموقع</Label>
                <Select value={addStockLocation} onValueChange={(v) => setAddStockLocation(v as "shelf" | "warehouse")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shelf">الرف</SelectItem>
                    <SelectItem value="warehouse">المستودع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اسم المورد (اختياري)</Label>
                <Input value={addStockSupplier} onChange={(e) => setAddStockSupplier(e.target.value)} placeholder="اتركه فارغاً للإبقاء" data-testid="input-add-stock-supplier" />
              </div>
              {(() => {
                const q = parseFloat(addStockQty) || 0;
                const newShelf = (addStockProduct.shelfStock ?? 0) + (addStockLocation === "shelf" ? q : 0);
                const newWh = (addStockProduct.warehouseStock ?? 0) + (addStockLocation === "warehouse" ? q : 0);
                const newTotal = newShelf + newWh;
                return (
                  <div className="rounded-lg border border-border p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>الرف بعد الإضافة</span><span className="font-bold">{newShelf}</span></div>
                    <div className="flex justify-between"><span>المستودع بعد الإضافة</span><span className="font-bold">{newWh}</span></div>
                    <div className="flex justify-between text-base"><span>الإجمالي الجديد</span><span className="font-bold text-primary">{newTotal}</span></div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStockOpen(false)}>إلغاء</Button>
            <Button onClick={handleAddStock} data-testid="button-confirm-add-stock">تأكيد الإضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}