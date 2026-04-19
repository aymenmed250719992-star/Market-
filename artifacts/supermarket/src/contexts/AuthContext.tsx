import { createContext, useContext } from "react";
import { useGetMe, useLogin, useLogout, getGetMeQueryKey, User, LoginBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (data: LoginBody) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiRegister(data: RegisterData) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || "حدث خطأ أثناء إنشاء الحساب");
  return json;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({
    query: { retry: false },
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (data: LoginBody) => {
    const response: any = await loginMutation.mutateAsync({ data });
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    const role = response?.user?.role;
    setLocation(role === "distributor" ? "/distributor" : role === "customer" ? "/customer" : "/dashboard");
  };

  const register = async (data: RegisterData) => {
    const response: any = await apiRegister(data);
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/customer");
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.setQueryData(getGetMeQueryKey(), null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, login, register, logout: handleLogout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
