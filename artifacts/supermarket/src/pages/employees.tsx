import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, getListUsersQueryKey, User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit, Trash2, UsersRound, ShieldCheck, ScanLine, PackageCheck, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Employees() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useListUsers();
  
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "worker",
    phone: "",
    baseSalary: "",
    employeeBarcode: ""
  });

  const generateBarcode = () => {
    const prefix = formData.role === "cashier" ? "CSH" : formData.role === "buyer" ? "BUY" : formData.role === "worker" ? "WRK" : formData.role === "admin" ? "ADM" : "EMP";
    return `${prefix}${Date.now().toString().slice(-6)}`;
  };

  const handleOpenModal = (employee?: User) => {
    if (employee) {
      setEditingUser(employee);
      setFormData({
        name: employee.name,
        email: employee.email,
        password: "",
        role: employee.role,
        phone: employee.phone || "",
        baseSalary: employee.baseSalary?.toString() || "",
        employeeBarcode: (employee as any).employeeBarcode || ""
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "worker",
        phone: "",
        baseSalary: "",
        employeeBarcode: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        phone: formData.phone || null,
        baseSalary: formData.baseSalary ? parseFloat(formData.baseSalary) : null,
        employeeBarcode: formData.employeeBarcode || null
      };

      if (!editingUser) {
        if (!formData.password) throw new Error("كلمة المرور مطلوبة للموظف الجديد");
        payload.password = formData.password;
        await createUser.mutateAsync({ data: payload });
        toast({ title: "تمت الإضافة", description: "تم إضافة الموظف بنجاح" });
      } else {
        if (formData.password) payload.password = formData.password;
        await updateUser.mutateAsync({ id: editingUser.id, data: payload });
        toast({ title: "تم التحديث", description: "تم تحديث الموظف بنجاح" });
      }
      
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setIsModalOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "خطأ", description: error.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (id === user?.id) {
      toast({ variant: "destructive", title: "خطأ", description: "لا يمكنك حذف حسابك الخاص" });
      return;
    }
    if (confirm("هل أنت متأكد من حذف هذا الموظف؟")) {
      try {
        await deleteUser.mutateAsync({ id });
        toast({ title: "تم الحذف", description: "تم حذف الموظف بنجاح" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      } catch (error: any) {
        toast({ variant: "destructive", title: "خطأ", description: error.message });
      }
    }
  };

  const filteredUsers = users?.filter(u => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || (u.phone && u.phone.includes(term));
  });

  const roleLabels: Record<string, string> = {
    admin: "أدمن",
    cashier: "قابض",
    buyer: "مشتري",
    worker: "عامل",
    customer: "زبون",
    distributor: "موزع",
  };

  const staffUsers = users?.filter(u => !["customer", "distributor"].includes(u.role)) ?? [];
  const cashierCount = users?.filter(u => u.role === "cashier").length ?? 0;
  const operationsCount = users?.filter(u => ["worker", "buyer"].includes(u.role)).length ?? 0;
  const distributorCount = users?.filter(u => u.role === "distributor").length ?? 0;

  const getRoleClassName = (role: string) => {
    if (role === "admin") return "bg-primary/15 text-primary border border-primary/20";
    if (role === "cashier") return "bg-emerald-500/15 text-emerald-700 border border-emerald-500/20";
    if (role === "buyer" || role === "worker") return "bg-blue-500/15 text-blue-700 border border-blue-500/20";
    if (role === "distributor") return "bg-orange-500/15 text-orange-700 border border-orange-500/20";
    return "bg-secondary text-secondary-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <UsersRound className="h-8 w-8" />
          الموظفين والحسابات
        </h1>
        <Button onClick={() => handleOpenModal()} data-testid="button-add-employee">
          <Plus className="ml-2 h-4 w-4" /> إضافة حساب
        </Button>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="بحث بالاسم، الإيميل، أو الهاتف..." 
            className="pl-4 pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-employee"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">طاقم المتجر</span>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <p className="text-2xl font-bold mt-2">{staffUsers.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">القابضون</span>
            <ScanLine className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold mt-2">{cashierCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">العمال والمشترون</span>
            <PackageCheck className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold mt-2">{operationsCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">الموزعون</span>
            <Truck className="h-5 w-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold mt-2">{distributorCount}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الإيميل</TableHead>
              <TableHead>الدور</TableHead>
              <TableHead>باركود الموظف</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>الراتب الأساسي (دج)</TableHead>
              <TableHead>تاريخ التعيين</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1,2,3].map(i => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                </TableRow>
              ))
            ) : filteredUsers?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-bold">{u.name}</TableCell>
                <TableCell dir="ltr" className="text-right text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${getRoleClassName(u.role)}`}>
                    {roleLabels[u.role] || u.role}
                  </span>
                </TableCell>
                <TableCell dir="ltr" className="text-right font-mono text-xs">{(u as any).employeeBarcode || '-'}</TableCell>
                <TableCell dir="ltr" className="text-right">{u.phone || '-'}</TableCell>
                <TableCell>{u.baseSalary ? `${u.baseSalary} دج` : '-'}</TableCell>
                <TableCell>{format(new Date(u.createdAt), "yyyy/MM/dd")}</TableCell>
                <TableCell className="text-left">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(u)} data-testid={`button-edit-employee-${u.id}`}>
                      <Edit className="h-4 w-4 text-primary" />
                    </Button>
                    {u.id !== user?.id && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} data-testid={`button-delete-employee-${u.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filteredUsers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  لا يوجد موظفين
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "تعديل موظف" : "إضافة موظف جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>الدور</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({...formData, role: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">أدمن</SelectItem>
                    <SelectItem value="cashier">قابض</SelectItem>
                    <SelectItem value="buyer">مشتري</SelectItem>
                    <SelectItem value="worker">عامل</SelectItem>
                    <SelectItem value="distributor">موزع</SelectItem>
                    <SelectItem value="customer">زبون</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>البريد الإلكتروني</Label>
                <Input required type="email" dir="ltr" className="text-right" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>كلمة المرور {editingUser && "(اتركه فارغاً لعدم التغيير)"}</Label>
                <Input type="password" dir="ltr" className="text-right" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required={!editingUser} />
              </div>
              <div className="space-y-2">
                <Label>الهاتف (اختياري)</Label>
                <Input dir="ltr" className="text-right" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>الراتب الأساسي (دج)</Label>
                <Input type="number" value={formData.baseSalary} onChange={e => setFormData({...formData, baseSalary: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>باركود الموظف (لفتح الوردية وتسجيل الحضور)</Label>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    className="text-right font-mono"
                    placeholder="مثال: CSH123456"
                    value={formData.employeeBarcode}
                    onChange={e => setFormData({...formData, employeeBarcode: e.target.value})}
                  />
                  <Button type="button" variant="outline" onClick={() => setFormData({...formData, employeeBarcode: generateBarcode()})}>
                    توليد
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">يستخدم القابض هذا الباركود عند فتح الوردية في نقطة البيع.</p>
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {editingUser ? "تحديث" : "إضافة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}