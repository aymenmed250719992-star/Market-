import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListCustomers, useCreateCustomer, useUpdateCustomer, usePayCustomerDebt, getListCustomersQueryKey, Customer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit, Banknote, Users, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Customers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "cashier";

  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useListCustomers({ search: search || undefined });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const payDebt = usePayCustomerDebt();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    creditLimit: "50000"
  });

  const [paymentData, setPaymentData] = useState({
    amount: "",
    note: ""
  });

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
        creditLimit: customer.creditLimit.toString()
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: "",
        phone: "",
        address: "",
        creditLimit: "50000"
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenPayment = (customer: Customer) => {
    setEditingCustomer(customer);
    setPaymentData({
      amount: "",
      note: ""
    });
    setIsPaymentOpen(true);
  };

  const handleOpenRedeem = (customer: Customer) => {
    setEditingCustomer(customer);
    setRedeemPoints("");
    setIsRedeemOpen(true);
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    const points = parseInt(redeemPoints, 10);
    if (!points || points <= 0) return;
    setRedeemBusy(true);
    try {
      const res = await fetch(`/api/customers/${editingCustomer.id}/redeem-points`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "فشل الاستبدال");
      toast({
        title: "تم الاستبدال",
        description: `تم خصم ${points} نقطة (=${result.discount} دج). الرصيد المتبقي: ${result.loyaltyPoints}`,
      });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setIsRedeemOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setRedeemBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: formData.name,
        phone: formData.phone || null,
        address: formData.address || null,
        creditLimit: parseFloat(formData.creditLimit) || 50000
      };

      if (editingCustomer) {
        await updateCustomer.mutateAsync({ id: editingCustomer.id, data: payload });
        toast({ title: "تم التحديث", description: "تم تحديث الزبون بنجاح" });
      } else {
        await createCustomer.mutateAsync({ data: payload });
        toast({ title: "تمت الإضافة", description: "تم إضافة الزبون بنجاح" });
      }
      
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setIsModalOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    try {
      await payDebt.mutateAsync({
        id: editingCustomer.id,
        data: {
          amount: parseFloat(paymentData.amount),
          note: paymentData.note || null
        }
      });
      toast({ title: "تم الدفع", description: "تم تسجيل الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setIsPaymentOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-8 w-8" />
          الزبائن والكرني
        </h1>
        {canEdit && (
          <Button onClick={() => handleOpenModal()} data-testid="button-add-customer">
            <Plus className="ml-2 h-4 w-4" /> إضافة زبون
          </Button>
        )}
      </div>

      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="بحث بالاسم أو الهاتف..." 
            className="pl-4 pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-customer"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>العنوان</TableHead>
              <TableHead>سقف الدين (دج)</TableHead>
              <TableHead>الديون الحالية (دج)</TableHead>
              <TableHead>نقاط الولاء</TableHead>
              <TableHead>الحالة</TableHead>
              {(canEdit) && <TableHead className="text-left">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1,2,3].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                </TableRow>
              ))
            ) : customers?.map((customer) => {
              const debtRatio = customer.totalDebt / customer.creditLimit;
              const isHighDebt = debtRatio > 0.8;

              return (
                <TableRow key={customer.id}>
                  <TableCell className="font-bold">{customer.name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{customer.phone || '-'}</TableCell>
                  <TableCell>{customer.address || '-'}</TableCell>
                  <TableCell>{customer.creditLimit}</TableCell>
                  <TableCell className={isHighDebt ? "text-destructive font-bold" : "font-bold"}>
                    {customer.totalDebt}
                  </TableCell>
                  <TableCell>
                    <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1">
                      <Gift className="h-3 w-3" />
                      {(customer as any).loyaltyPoints ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isHighDebt ? (
                      <span className="text-destructive text-xs font-bold bg-destructive/10 px-2 py-1 rounded">تجاوز السقف</span>
                    ) : (
                      <span className="text-primary text-xs font-bold bg-primary/10 px-2 py-1 rounded">جيد</span>
                    )}
                  </TableCell>
                  {(canEdit) && (
                    <TableCell className="text-left">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRedeem(customer)}
                          disabled={!((customer as any).loyaltyPoints > 0)}
                          data-testid={`button-redeem-${customer.id}`}
                        >
                          <Gift className="ml-1 h-4 w-4" /> استبدال
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleOpenPayment(customer)} data-testid={`button-pay-debt-${customer.id}`}>
                          <Banknote className="ml-1 h-4 w-4" /> دفع
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(customer)} data-testid={`button-edit-customer-${customer.id}`}>
                          <Edit className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!isLoading && customers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  لا يوجد زبائن
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Customer Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "تعديل زبون" : "إضافة زبون جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الهاتف</Label>
              <Input dir="ltr" className="text-right" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>سقف الدين (دج)</Label>
              <Input required type="number" value={formData.creditLimit} onChange={e => setFormData({...formData, creditLimit: e.target.value})} />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                {editingCustomer ? "تحديث" : "إضافة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Redeem Loyalty Points Modal */}
      <Dialog open={isRedeemOpen} onOpenChange={setIsRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>استبدال نقاط الولاء — {editingCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="bg-amber-500/10 p-4 rounded-md mb-4 flex justify-between text-sm">
            <span>الرصيد الحالي:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {(editingCustomer as any)?.loyaltyPoints ?? 0} نقطة
            </span>
          </div>
          <div className="text-xs text-muted-foreground mb-2">كل نقطة = 1 دج خصم</div>
          <form onSubmit={handleRedeem} className="space-y-4">
            <div className="space-y-2">
              <Label>عدد النقاط للاستبدال</Label>
              <Input
                required
                type="number"
                min="1"
                max={(editingCustomer as any)?.loyaltyPoints ?? 0}
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                data-testid="input-redeem-points"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsRedeemOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={redeemBusy} data-testid="button-confirm-redeem">تأكيد الاستبدال</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل دفعة للزبون: {editingCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md mb-4 flex justify-between">
            <span>الديون الحالية:</span>
            <span className="font-bold text-destructive">{editingCustomer?.totalDebt} دج</span>
          </div>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>المبلغ المدفوع (دج)</Label>
              <Input required type="number" min="1" max={editingCustomer?.totalDebt} value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Input value={paymentData.note} onChange={e => setPaymentData({...paymentData, note: e.target.value})} />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPaymentOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={payDebt.isPending}>تسجيل الدفعة</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}