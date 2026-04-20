import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, Plus, Target, Check, RefreshCw, AlertTriangle, MessageSquare, Briefcase } from "lucide-react";
import { format } from "date-fns";

interface Task {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  assignedToId: number;
  assignedToName: string;
  reporterId: number;
  reporterName: string;
  points: number;
  productId: number | null;
  productName: string | null;
  createdAt: string;
  completedAt: string | null;
  approvedAt: string | null;
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const completeTask = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/${id}/complete`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed to complete task");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تم إرسال المهمة للمراجعة" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const approveTask = useMutation({
    mutationFn: async ({ id, approved }: { id: number, approved: boolean }) => {
      const res = await fetch(`/api/tasks/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to approve task");
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({ title: "تم", description: variables.approved ? "تم اعتماد المهمة" : "تم رفض المهمة" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const createTask = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم", description: "تم إنشاء المهمة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setIsModalOpen(false);
    }
  });

  const isAdmin = user?.role === "admin";
  const canCreate = isAdmin || user?.role === "cashier";

  const filteredTasks = tasks.filter(t => {
    if (!isAdmin && t.assignedToId !== user?.id) return false;
    return t.status === activeTab;
  });

  const visibleTasks = isAdmin ? tasks : tasks.filter(t => t.assignedToId === user?.id);
  const statusCounts = {
    pending: visibleTasks.filter(t => t.status === "pending").length,
    completed: visibleTasks.filter(t => t.status === "completed").length,
    approved: visibleTasks.filter(t => t.status === "approved").length,
    rejected: visibleTasks.filter(t => t.status === "rejected").length,
  };

  const typeLabels: Record<string, string> = {
    restock: "تعبئة الرفوف",
    damage: "تبليغ تالف",
    report: "تقرير",
    other: "أخرى",
  };

  const roleLabels: Record<string, string> = {
    worker: "عامل",
    buyer: "مشتري",
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'restock': return <RefreshCw className="h-4 w-4" />;
      case 'damage': return <AlertTriangle className="h-4 w-4" />;
      case 'report': return <MessageSquare className="h-4 w-4" />;
      default: return <Briefcase className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary">قيد الانتظار</Badge>;
      case 'completed': return <Badge className="bg-blue-500 hover:bg-blue-600">مكتملة (للمراجعة)</Badge>;
      case 'approved': return <Badge className="bg-green-500 hover:bg-green-600">معتمدة</Badge>;
      case 'rejected': return <Badge variant="destructive">مرفوضة</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Target className="h-8 w-8" />
          المهام
        </h1>
        {canCreate && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> إنشاء مهمة
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">بانتظار التنفيذ</p>
            <p className="text-2xl font-bold mt-1">{statusCounts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">تنتظر الاعتماد</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{statusCounts.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">معتمدة</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{statusCounts.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">مرفوضة</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{statusCounts.rejected}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="pending">قيد الانتظار ({statusCounts.pending})</TabsTrigger>
          <TabsTrigger value="completed">مكتملة ({statusCounts.completed})</TabsTrigger>
          <TabsTrigger value="approved">معتمدة ({statusCounts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">مرفوضة ({statusCounts.rejected})</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {isLoading ? (
            <div className="text-center py-10">جاري التحميل...</div>
          ) : filteredTasks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد مهام في هذا القسم حالياً
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTasks.map(task => (
                <Card key={task.id} className={task.status === 'rejected' ? 'border-destructive/50' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          {getTypeIcon(task.type)} {typeLabels[task.type] || task.type}
                        </Badge>
                        {getStatusBadge(task.status)}
                      </div>
                      <Badge variant="secondary" className="font-bold">{task.points} نقطة</Badge>
                    </div>
                    <CardTitle className="text-lg mt-2">{task.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 text-sm">
                    <p className="text-muted-foreground mb-3">{task.description || "لا يوجد وصف إضافي"}</p>
                    {task.productName && (
                      <p className="font-medium mb-2 text-primary">المنتج: {task.productName}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs mt-4 bg-muted/30 p-2 rounded-md">
                      <div>
                        <span className="text-muted-foreground block">المكلف:</span>
                        <span className="font-bold">{task.assignedToName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">بواسطة:</span>
                        <span className="font-bold">{task.reporterName}</span>
                      </div>
                      <div className="col-span-2 mt-1">
                        <span className="text-muted-foreground block">تاريخ الإنشاء:</span>
                        <span>{format(new Date(task.createdAt), "yyyy/MM/dd HH:mm")}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex justify-end gap-2 border-t border-border mt-3 p-3">
                    {task.status === 'pending' && task.assignedToId === user?.id && (
                      <Button size="sm" onClick={() => completeTask.mutate(task.id)} disabled={completeTask.isPending}>
                        <Check className="ml-1 h-4 w-4" /> تم الإنجاز
                      </Button>
                    )}
                    {task.status === 'completed' && isAdmin && (
                      <>
                        <Button size="sm" variant="destructive" onClick={() => approveTask.mutate({ id: task.id, approved: false })} disabled={approveTask.isPending}>
                          <XCircle className="ml-1 h-4 w-4" /> رفض
                        </Button>
                        <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={() => approveTask.mutate({ id: task.id, approved: true })} disabled={approveTask.isPending}>
                          <CheckCircle2 className="ml-1 h-4 w-4" /> اعتماد
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Tabs>

      {canCreate && (
        <CreateTaskModal 
          open={isModalOpen} 
          onOpenChange={setIsModalOpen} 
          onSubmit={(data) => createTask.mutate(data)}
          users={users}
          isLoading={createTask.isPending}
        />
      )}
    </div>
  );
}

function CreateTaskModal({ open, onOpenChange, onSubmit, users, isLoading }: any) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "restock",
    assignedToId: "",
    points: "10",
    productName: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      assignedToId: parseInt(formData.assignedToId),
      points: parseInt(formData.points)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنشاء مهمة جديدة</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="restock">إعادة تعبئة</SelectItem>
                  <SelectItem value="damage">تالف</SelectItem>
                  <SelectItem value="report">تقرير</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المكلف</Label>
              <Select value={formData.assignedToId} onValueChange={v => setFormData({...formData, assignedToId: v})} required>
                <SelectTrigger><SelectValue placeholder="اختر العامل..." /></SelectTrigger>
                <SelectContent>
                  {users.filter((u: any) => u.role === 'worker' || u.role === 'buyer').map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({roleLabels[u.role] || u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>النقاط</Label>
              <Input type="number" min="0" required value={formData.points} onChange={e => setFormData({...formData, points: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>المنتج (اختياري)</Label>
              <Input value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading || !formData.assignedToId}>إنشاء</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
