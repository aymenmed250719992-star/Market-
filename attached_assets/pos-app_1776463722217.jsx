import { useState, useEffect, useRef } from "react";

// ============ MOCK DATA ============
const INITIAL_USERS = [
  { id: "admin1", name: "أحمد المدير", email: "admin@store.dz", role: "admin", password: "admin123" },
  { id: "cashier1", name: "كريم القابض", email: "cashier@store.dz", role: "cashier", password: "cash123" },
  { id: "buyer1", name: "سامي المشري", email: "buyer@store.dz", role: "buyer", password: "buy123" },
  { id: "cust1", name: "محمد زبون", email: "cust1@store.dz", role: "customer", password: "cust123", balance: 850, debt: 150, customerId: "ZB-001" },
  { id: "cust2", name: "فاطمة زبونة", email: "cust2@store.dz", role: "customer", password: "cust456", balance: 500, debt: 0, customerId: "ZB-002" },
];

const INITIAL_PRODUCTS = [
  { id: "P001", barcode: "6111234567890", name: "حليب جامعة", wholesalePrice: 95, retailPrice: 120, stock: 50, paid: true, category: "ألبان" },
  { id: "P002", barcode: "6119876543210", name: "خبز كامل", wholesalePrice: 20, retailPrice: 30, stock: 8, paid: false, category: "مخبزة" },
  { id: "P003", barcode: "6114567891230", name: "زيت زيتون", wholesalePrice: 450, retailPrice: 600, stock: 25, paid: true, category: "زيوت" },
  { id: "P004", barcode: "6117894561230", name: "سكر أبيض", wholesalePrice: 80, retailPrice: 100, stock: 3, paid: false, category: "بقالة" },
  { id: "P005", barcode: "6112345678901", name: "أرز مميز", wholesalePrice: 120, retailPrice: 160, stock: 40, paid: true, category: "بقالة" },
];

const INITIAL_SALES = [
  { id: "S001", date: "2025-04-14", cashierId: "cashier1", customerId: "ZB-001", items: [{productId:"P001",name:"حليب جامعة",price:120,qty:2},{productId:"P003",name:"زيت زيتون",price:600,qty:1}], total: 840, paid: true },
  { id: "S002", date: "2025-04-15", cashierId: "cashier1", customerId: "ZB-002", items: [{productId:"P005",name:"أرز مميز",price:160,qty:3}], total: 480, paid: true },
  { id: "S003", date: "2025-04-16", cashierId: "cashier1", customerId: "ZB-001", items: [{productId:"P002",name:"خبز كامل",price:30,qty:5}], total: 150, paid: false },
];

// ============ ICONS ============
const Icon = ({ name, size = 20 }) => {
  const icons = {
    dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    product: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    sale: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    barcode: "M4 6h1M4 10h1M4 14h1M8 6h1M8 10h1M8 14h1M13 6h1M13 10h1M13 14h1M17 6h1M17 10h1M17 14h1M11 6v8",
    report: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    bot: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2",
    logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    plus: "M12 4v16m8-8H4",
    check: "M5 13l4 4L19 7",
    warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    money: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    store: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17",
    eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    send: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
  };
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={icons[name] || icons.dashboard} />
    </svg>
  );
};

// ============ MAIN APP ============
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(INITIAL_USERS);
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [sales, setSales] = useState(INITIAL_SALES);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [notification, setNotification] = useState(null);

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = () => {
    const user = users.find(u => u.email === loginForm.email && u.password === loginForm.password);
    if (user) {
      setCurrentUser(user);
      setLoginError("");
      setActiveTab("dashboard");
    } else {
      setLoginError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginForm({ email: "", password: "" });
  };

  if (!currentUser) {
    return <LoginScreen form={loginForm} setForm={setLoginForm} onLogin={handleLogin} error={loginError} />;
  }

  const roleScreens = {
    admin: <AdminScreen users={users} setUsers={setUsers} products={products} setProducts={setProducts} sales={sales} setSales={setSales} activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} showNotif={showNotif} />,
    cashier: <CashierScreen products={products} setProducts={setProducts} sales={sales} setSales={setSales} users={users} currentUser={currentUser} showNotif={showNotif} />,
    buyer: <BuyerScreen products={products} setProducts={setProducts} currentUser={currentUser} showNotif={showNotif} />,
    customer: <CustomerScreen sales={sales} currentUser={currentUser} users={users} />,
  };

  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1e293b; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        input, button, select, textarea { font-family: 'Tajawal', sans-serif; }
        @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .card { background: #1e293b; border-radius: 16px; padding: 20px; border: 1px solid #334155; }
        .btn { padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Tajawal', sans-serif; font-size: 14px; font-weight: 600; transition: all 0.2s; }
        .btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .btn-primary { background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; }
        .btn-success { background: linear-gradient(135deg, #10b981, #059669); color: white; }
        .btn-danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
        .btn-warning { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
        .btn-ghost { background: #334155; color: #94a3b8; }
        .input { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 10px 14px; color: #e2e8f0; font-size: 14px; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #3b82f6; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
        .badge-green { background: #064e3b; color: #6ee7b7; }
        .badge-red { background: #7f1d1d; color: #fca5a5; }
        .badge-yellow { background: #78350f; color: #fcd34d; }
        .badge-blue { background: #1e3a5f; color: #93c5fd; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f172a; padding: 12px; text-align: right; font-size: 13px; color: #64748b; font-weight: 600; }
        td { padding: 12px; border-bottom: 1px solid #1e293b; font-size: 14px; }
        tr:hover td { background: #1a2744; }
        .stat-card { background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 16px; padding: 20px; }
        .nav-item { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:10px; cursor:pointer; transition:all 0.2s; color:#94a3b8; font-size:14px; }
        .nav-item:hover { background:#334155; color:#e2e8f0; }
        .nav-item.active { background:linear-gradient(135deg,#3b82f6,#6366f1); color:white; }
      `}</style>

      {/* Notification */}
      {notification && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:9999, animation:"slideIn 0.3s ease",
          background: notification.type === "success" ? "#064e3b" : notification.type === "warning" ? "#78350f" : "#7f1d1d",
          color: notification.type === "success" ? "#6ee7b7" : notification.type === "warning" ? "#fcd34d" : "#fca5a5",
          padding:"12px 24px", borderRadius:"12px", fontWeight:600, boxShadow:"0 10px 40px rgba(0,0,0,0.5)" }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background:"#1e293b", borderBottom:"1px solid #334155", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#3b82f6,#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏪</div>
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>متجر الجزائر</div>
            <div style={{ fontSize:11, color:"#64748b" }}>نظام إدارة المبيعات</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontWeight:600, fontSize:14 }}>{currentUser.name}</div>
            <div style={{ fontSize:11 }}>
              <span className={`badge ${currentUser.role==="admin"?"badge-blue":currentUser.role==="cashier"?"badge-green":currentUser.role==="buyer"?"badge-yellow":"badge-red"}`}>
                {currentUser.role==="admin"?"أدمن":currentUser.role==="cashier"?"قابض":currentUser.role==="buyer"?"مشري":"زبون"}
              </span>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }} onClick={handleLogout}>
            <Icon name="logout" size={16} /> خروج
          </button>
        </div>
      </div>

      <div style={{ animation:"fadeIn 0.3s ease" }}>
        {roleScreens[currentUser.role]}
      </div>
    </div>
  );
}

// ============ LOGIN ============
function LoginScreen({ form, setForm, onLogin, error }) {
  return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} .input{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:12px 16px;color:#e2e8f0;font-size:15px;outline:none;transition:border-color 0.2s;font-family:'Tajawal',sans-serif;} .input:focus{border-color:#3b82f6;}`}</style>
      <div style={{ width:"100%", maxWidth:400, padding:20 }}>
        <div style={{ textAlign:"center", marginBottom:32, animation:"float 3s ease-in-out infinite" }}>
          <div style={{ fontSize:60, marginBottom:8 }}>🏪</div>
          <div style={{ fontSize:28, fontWeight:900, background:"linear-gradient(135deg,#3b82f6,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>متجر الجزائر</div>
          <div style={{ color:"#64748b", fontSize:14, marginTop:4 }}>نظام إدارة المبيعات المتكامل</div>
        </div>
        <div style={{ background:"#1e293b", borderRadius:20, padding:28, border:"1px solid #334155", boxShadow:"0 25px 50px rgba(0,0,0,0.5)" }}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", marginBottom:6, fontSize:13, color:"#94a3b8", fontWeight:600 }}>البريد الإلكتروني</label>
            <input className="input" style={{ width:"100%" }} placeholder="example@store.dz" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} onKeyDown={e=>e.key==="Enter"&&onLogin()} />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ display:"block", marginBottom:6, fontSize:13, color:"#94a3b8", fontWeight:600 }}>كلمة المرور</label>
            <input className="input" style={{ width:"100%" }} type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&onLogin()} />
          </div>
          {error && <div style={{ background:"#7f1d1d", color:"#fca5a5", padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:16 }}>{error}</div>}
          <button onClick={onLogin} style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#3b82f6,#6366f1)", color:"white", border:"none", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"'Tajawal',sans-serif", transition:"all 0.2s" }}>
            تسجيل الدخول
          </button>
          <div style={{ marginTop:16, padding:12, background:"#0f172a", borderRadius:10, fontSize:12, color:"#64748b" }}>
            <div style={{ fontWeight:700, marginBottom:6, color:"#94a3b8" }}>حسابات تجريبية:</div>
            <div>أدمن: admin@store.dz / admin123</div>
            <div>قابض: cashier@store.dz / cash123</div>
            <div>مشري: buyer@store.dz / buy123</div>
            <div>زبون: cust1@store.dz / cust123</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ADMIN ============
function AdminScreen({ users, setUsers, products, setProducts, sales, setSales, activeTab, setActiveTab, currentUser, showNotif }) {
  const navItems = [
    { id:"dashboard", label:"لوحة التحكم", icon:"dashboard" },
    { id:"users", label:"المستخدمون", icon:"users" },
    { id:"products", label:"المنتجات", icon:"product" },
    { id:"sales", label:"المبيعات", icon:"sale" },
    { id:"reports", label:"التقارير", icon:"report" },
    { id:"chatbot", label:"المساعد الذكي", icon:"bot" },
  ];

  const totalRevenue = sales.filter(s=>s.paid).reduce((a,s)=>a+s.total,0);
  const totalDebt = sales.filter(s=>!s.paid).reduce((a,s)=>a+s.total,0);
  const lowStock = products.filter(p=>p.stock<=10);

  return (
    <div style={{ display:"flex", minHeight:"calc(100vh - 61px)" }}>
      {/* Sidebar */}
      <div style={{ width:220, background:"#1e293b", borderLeft:"1px solid #334155", padding:16, flexShrink:0 }}>
        <div style={{ marginBottom:8, fontSize:11, color:"#475569", fontWeight:700, textTransform:"uppercase", letterSpacing:1, paddingRight:8 }}>القائمة</div>
        {navItems.map(n=>(
          <div key={n.id} className={`nav-item ${activeTab===n.id?"active":""}`} onClick={()=>setActiveTab(n.id)}>
            <Icon name={n.icon} size={18} />{n.label}
            {n.id==="products" && lowStock.length>0 && <span style={{ marginRight:"auto", background:"#ef4444", color:"white", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700 }}>{lowStock.length}</span>}
          </div>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex:1, padding:24, overflowY:"auto" }}>
        {activeTab==="dashboard" && <AdminDashboard sales={sales} products={products} users={users} lowStock={lowStock} totalRevenue={totalRevenue} totalDebt={totalDebt} />}
        {activeTab==="users" && <AdminUsers users={users} setUsers={setUsers} showNotif={showNotif} />}
        {activeTab==="products" && <AdminProducts products={products} setProducts={setProducts} showNotif={showNotif} />}
        {activeTab==="sales" && <AdminSales sales={sales} users={users} products={products} />}
        {activeTab==="reports" && <AdminReports sales={sales} products={products} />}
        {activeTab==="chatbot" && <AdminChatbot products={products} sales={sales} users={users} />}
      </div>
    </div>
  );
}

function AdminDashboard({ sales, products, users, lowStock, totalRevenue, totalDebt }) {
  const stats = [
    { label:"إجمالي الإيرادات", value:`${totalRevenue.toLocaleString()} دج`, icon:"money", color:"#10b981", bg:"#064e3b" },
    { label:"الديون المعلقة", value:`${totalDebt.toLocaleString()} دج`, icon:"warning", color:"#f59e0b", bg:"#78350f" },
    { label:"المنتجات", value:products.length, icon:"product", color:"#3b82f6", bg:"#1e3a5f" },
    { label:"المستخدمون", value:users.length, icon:"users", color:"#a78bfa", bg:"#2e1065" },
  ];
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>لوحة التحكم</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {stats.map((s,i)=>(
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.color}33`, borderRadius:16, padding:20 }}>
            <div style={{ color:s.color, marginBottom:8 }}><Icon name={s.icon} size={24} /></div>
            <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {lowStock.length>0 && (
        <div style={{ background:"#78350f", border:"1px solid #f59e0b33", borderRadius:16, padding:16, marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, color:"#fcd34d", fontWeight:700 }}>
            <Icon name="warning" size={20} /> تحذير: منتجات على وشك النفاذ
          </div>
          {lowStock.map(p=>(
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #92400e", fontSize:14 }}>
              <span style={{ color:"#fde68a" }}>{p.name}</span>
              <span style={{ color:"#fca5a5", fontWeight:700 }}>متبقي: {p.stock} وحدة</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:12, color:"#94a3b8", fontSize:13 }}>آخر المبيعات</div>
          {sales.slice(-3).reverse().map(s=>(
            <div key={s.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #334155", fontSize:13 }}>
              <div><div style={{ fontWeight:600 }}>فاتورة #{s.id}</div><div style={{ color:"#64748b", fontSize:11 }}>{s.date}</div></div>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontWeight:700, color:"#10b981" }}>{s.total} دج</div>
                <span className={`badge ${s.paid?"badge-green":"badge-red"}`}>{s.paid?"مدفوع":"دين"}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:12, color:"#94a3b8", fontSize:13 }}>توزيع الأدوار</div>
          {["admin","cashier","buyer","customer"].map(r=>{
            const count = [].filter.call({length:0},...[]) || INITIAL_USERS.filter(u=>u.role===r).length;
            const labels = {admin:"أدمن",cashier:"قابض",buyer:"مشري",customer:"زبون"};
            const colors = {admin:"#3b82f6",cashier:"#10b981",buyer:"#f59e0b",customer:"#a78bfa"};
            const userCount = INITIAL_USERS.filter(u=>u.role===r).length;
            return (
              <div key={r} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:colors[r], flexShrink:0 }}></div>
                <div style={{ flex:1, fontSize:13 }}>{labels[r]}</div>
                <div style={{ height:8, flex:2, background:"#0f172a", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(userCount/INITIAL_USERS.length)*100}%`, background:colors[r], borderRadius:4 }}></div>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:colors[r], width:20, textAlign:"center" }}>{userCount}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AdminUsers({ users, setUsers, showNotif }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"cashier" });

  const addUser = () => {
    if (!form.name || !form.email || !form.password) return;
    const newUser = { id:`u${Date.now()}`, ...form, ...(form.role==="customer"?{balance:0,debt:0,customerId:`ZB-${String(users.filter(u=>u.role==="customer").length+1).padStart(3,"0")}`}:{}) };
    setUsers([...users, newUser]);
    setShowAdd(false);
    setForm({ name:"", email:"", password:"", role:"cashier" });
    showNotif("تم إضافة المستخدم بنجاح ✓");
  };

  const deleteUser = (id) => {
    if (id === "admin1") return showNotif("لا يمكن حذف الأدمن الرئيسي!", "error");
    setUsers(users.filter(u=>u.id!==id));
    showNotif("تم حذف المستخدم");
  };

  const roleLabels = {admin:"أدمن",cashier:"قابض",buyer:"مشري",customer:"زبون"};
  const roleBadges = {admin:"badge-blue",cashier:"badge-green",buyer:"badge-yellow",customer:"badge-red"};

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontSize:22, fontWeight:800 }}>إدارة المستخدمين</h2>
        <button className="btn btn-primary" onClick={()=>setShowAdd(!showAdd)} style={{ display:"flex", alignItems:"center", gap:6 }}><Icon name="plus" size={16} />إضافة مستخدم</button>
      </div>
      {showAdd && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, marginBottom:16, color:"#94a3b8" }}>مستخدم جديد</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>الاسم</label><input className="input" style={{ width:"100%" }} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
            <div><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>البريد الإلكتروني</label><input className="input" style={{ width:"100%" }} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></div>
            <div><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>كلمة المرور</label><input className="input" style={{ width:"100%" }} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></div>
            <div><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>الدور</label>
              <select className="input" style={{ width:"100%" }} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                <option value="cashier">قابض</option><option value="buyer">مشري</option><option value="customer">زبون</option><option value="admin">أدمن</option>
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button className="btn btn-success" onClick={addUser}>حفظ</button>
            <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>إلغاء</button>
          </div>
        </div>
      )}
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <table>
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>معلومات إضافية</th><th>إجراء</th></tr></thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id}>
                <td style={{ fontWeight:600 }}>{u.name}</td>
                <td style={{ color:"#64748b", fontSize:13 }}>{u.email}</td>
                <td><span className={`badge ${roleBadges[u.role]}`}>{roleLabels[u.role]}</span></td>
                <td style={{ fontSize:13 }}>{u.customerId ? <span>ID: <strong>{u.customerId}</strong> | دين: <span style={{color:"#f59e0b"}}>{u.debt||0} دج</span></span> : "-"}</td>
                <td><button className="btn btn-danger" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>deleteUser(u.id)}><Icon name="trash" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminProducts({ products, setProducts, showNotif }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", barcode:"", wholesalePrice:"", retailPrice:"", stock:"", category:"بقالة", paid:true });

  const addProduct = () => {
    if (!form.name||!form.barcode) return;
    setProducts([...products, { id:`P${Date.now()}`, ...form, wholesalePrice:+form.wholesalePrice, retailPrice:+form.retailPrice, stock:+form.stock }]);
    setShowAdd(false);
    setForm({ name:"", barcode:"", wholesalePrice:"", retailPrice:"", stock:"", category:"بقالة", paid:true });
    showNotif("تم إضافة المنتج ✓");
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontSize:22, fontWeight:800 }}>إدارة المنتجات</h2>
        <button className="btn btn-primary" onClick={()=>setShowAdd(!showAdd)} style={{ display:"flex", alignItems:"center", gap:6 }}><Icon name="plus" size={16} />إضافة منتج</button>
      </div>
      {showAdd && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, marginBottom:16, color:"#94a3b8" }}>منتج جديد</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[["name","اسم المنتج","text"],["barcode","الباركود","text"],["wholesalePrice","سعر الجملة","number"],["retailPrice","سعر التجزئة","number"],["stock","الكمية","number"],["category","الفئة","text"]].map(([k,l,t])=>(
              <div key={k}><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>{l}</label><input className="input" style={{ width:"100%" }} type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} /></div>
            ))}
          </div>
          <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:10 }}>
            <input type="checkbox" id="paid" checked={form.paid} onChange={e=>setForm({...form,paid:e.target.checked})} />
            <label htmlFor="paid" style={{ fontSize:13, color:"#94a3b8" }}>مدفوع الثمن للمورد</label>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16 }}><button className="btn btn-success" onClick={addProduct}>حفظ</button><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>إلغاء</button></div>
        </div>
      )}
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <table>
          <thead><tr><th>الباركود</th><th>المنتج</th><th>جملة</th><th>تجزئة</th><th>المخزون</th><th>الحالة</th><th>دفع المورد</th></tr></thead>
          <tbody>
            {products.map(p=>(
              <tr key={p.id}>
                <td style={{ fontSize:11, color:"#64748b", fontFamily:"monospace" }}>{p.barcode}</td>
                <td style={{ fontWeight:600 }}>{p.name}</td>
                <td style={{ color:"#f59e0b" }}>{p.wholesalePrice} دج</td>
                <td style={{ color:"#10b981", fontWeight:700 }}>{p.retailPrice} دج</td>
                <td><span className={`badge ${p.stock<=3?"badge-red":p.stock<=10?"badge-yellow":"badge-green"}`}>{p.stock}</span></td>
                <td><span className={`badge ${p.stock>0?"badge-green":"badge-red"}`}>{p.stock>0?"متوفر":"نفذ"}</span></td>
                <td><span className={`badge ${p.paid?"badge-green":"badge-red"}`}>{p.paid?"مدفوع":"غير مدفوع"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminSales({ sales, users, products }) {
  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>سجل المبيعات</h2>
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <table>
          <thead><tr><th>#</th><th>التاريخ</th><th>الزبون</th><th>المنتجات</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>
            {[...sales].reverse().map(s=>{
              const customer = users.find(u=>u.customerId===s.customerId);
              return (
                <tr key={s.id}>
                  <td style={{ color:"#64748b", fontSize:12, fontFamily:"monospace" }}>{s.id}</td>
                  <td style={{ fontSize:13 }}>{s.date}</td>
                  <td style={{ fontWeight:600 }}>{customer?.name||s.customerId}</td>
                  <td style={{ fontSize:12, color:"#94a3b8" }}>{s.items.map(i=>`${i.name}×${i.qty}`).join("، ")}</td>
                  <td style={{ fontWeight:700, color:"#10b981" }}>{s.total} دج</td>
                  <td><span className={`badge ${s.paid?"badge-green":"badge-red"}`}>{s.paid?"مدفوع":"دين"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminReports({ sales, products }) {
  const today = new Date().toISOString().split("T")[0];
  const todaySales = sales.filter(s=>s.date===today);
  const monthSales = sales.filter(s=>s.date.startsWith("2025-04"));
  const totalToday = todaySales.reduce((a,s)=>a+s.total,0);
  const totalMonth = monthSales.reduce((a,s)=>a+s.total,0);
  const unpaidMonth = monthSales.filter(s=>!s.paid).reduce((a,s)=>a+s.total,0);

  const topProducts = products.map(p=>({ ...p, revenue: sales.flatMap(s=>s.items).filter(i=>i.productId===p.id).reduce((a,i)=>a+i.price*i.qty,0) })).sort((a,b)=>b.revenue-a.revenue).slice(0,5);

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>التقارير والإحصائيات</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        {[
          { label:"مبيعات اليوم", value:`${totalToday} دج`, color:"#10b981" },
          { label:"مبيعات الشهر", value:`${totalMonth} دج`, color:"#3b82f6" },
          { label:"ديون الشهر", value:`${unpaidMonth} دج`, color:"#f59e0b" },
        ].map((s,i)=>(
          <div key={i} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:16, padding:20, textAlign:"center" }}>
            <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:16, color:"#94a3b8" }}>أكثر المنتجات مبيعاً</div>
          {topProducts.map((p,i)=>(
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:"#3b82f6" }}>{i+1}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600 }}>{p.name}</div>
                <div style={{ height:6, background:"#0f172a", borderRadius:3, marginTop:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${topProducts[0].revenue>0?(p.revenue/topProducts[0].revenue)*100:0}%`, background:"linear-gradient(90deg,#3b82f6,#6366f1)", borderRadius:3 }}></div>
                </div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"#10b981" }}>{p.revenue} دج</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:16, color:"#94a3b8" }}>نسبة المدفوع/الدين</div>
          {[["مدفوع",sales.filter(s=>s.paid).length,"#10b981"],["دين",sales.filter(s=>!s.paid).length,"#ef4444"]].map(([l,c,col])=>(
            <div key={l} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ width:12, height:12, borderRadius:"50%", background:col }}></div>
              <div style={{ flex:1, fontSize:14 }}>{l}</div>
              <div style={{ fontWeight:800, fontSize:18, color:col }}>{c}</div>
            </div>
          ))}
          <div style={{ height:12, background:"#0f172a", borderRadius:6, overflow:"hidden", marginTop:8 }}>
            <div style={{ height:"100%", width:`${sales.length>0?(sales.filter(s=>s.paid).length/sales.length)*100:0}%`, background:"#10b981", borderRadius:6 }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ADMIN CHATBOT ============
function AdminChatbot({ products, sales, users }) {
  const [messages, setMessages] = useState([
    { role:"assistant", content:"مرحباً! أنا مساعدك الذكي لإدارة المتجر. يمكنني مساعدتك في تحليل المبيعات، المخزون، والزبائن. اسألني ما تريد! 🏪" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev=>[...prev, { role:"user", content:userMsg }]);
    setLoading(true);

    const context = `
أنت مساعد ذكي لإدارة متجر جزائري. إليك البيانات الحالية:

المنتجات (${products.length}):
${products.map(p=>`- ${p.name}: سعر جملة ${p.wholesalePrice}دج، تجزئة ${p.retailPrice}دج، مخزون ${p.stock} وحدة، ${p.paid?"مدفوع":"غير مدفوع"}`).join("\n")}

المبيعات (${sales.length}):
${sales.map(s=>`- ${s.id}: ${s.date}، الإجمالي ${s.total}دج، ${s.paid?"مدفوع":"دين"}`).join("\n")}

الزبائن: ${users.filter(u=>u.role==="customer").map(u=>`${u.name} (${u.customerId}): دين ${u.debt||0}دج`).join("، ")}

إجمالي الإيرادات المقبوضة: ${sales.filter(s=>s.paid).reduce((a,s)=>a+s.total,0)}دج
إجمالي الديون: ${sales.filter(s=>!s.paid).reduce((a,s)=>a+s.total,0)}دج
منتجات ناقصة المخزون (≤10): ${products.filter(p=>p.stock<=10).map(p=>p.name).join("، ")||"لا يوجد"}

أجب بالعربية، بشكل واضح ومختصر، واستخدم الأرقام الدقيقة من البيانات.
`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system: context,
          messages:[...messages.filter(m=>m.role!=="assistant"||messages.indexOf(m)>0).map(m=>({role:m.role,content:m.content})), {role:"user",content:userMsg}]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "عذراً، لم أتمكن من الإجابة.";
      setMessages(prev=>[...prev, { role:"assistant", content:reply }]);
    } catch {
      setMessages(prev=>[...prev, { role:"assistant", content:"❌ خطأ في الاتصال. تأكد من الاتصال بالإنترنت." }]);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>المساعد الذكي 🤖</h2>
      <div style={{ background:"#1e293b", borderRadius:20, border:"1px solid #334155", overflow:"hidden", height:"70vh", display:"flex", flexDirection:"column" }}>
        <div style={{ background:"linear-gradient(135deg,#1e3a5f,#2e1065)", padding:"16px 20px", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#3b82f6,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🤖</div>
          <div><div style={{ fontWeight:700 }}>المساعد الذكي</div><div style={{ fontSize:12, color:"#94a3b8" }}>يعمل بتقنية Claude AI</div></div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:12 }}>
          {messages.map((m,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-start":"flex-end" }}>
              <div style={{ maxWidth:"75%", padding:"12px 16px", borderRadius:m.role==="user"?"16px 16px 16px 4px":"16px 16px 4px 16px",
                background:m.role==="user"?"#0f172a":"linear-gradient(135deg,#1e3a5f,#2e1065)",
                border:`1px solid ${m.role==="user"?"#334155":"#3b82f633"}`, fontSize:14, lineHeight:1.6, color:"#e2e8f0" }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <div style={{ padding:"12px 16px", borderRadius:"16px 16px 4px 16px", background:"linear-gradient(135deg,#1e3a5f,#2e1065)", border:"1px solid #3b82f633" }}>
                <div style={{ display:"flex", gap:4 }}>
                  {[0,1,2].map(i=><div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#3b82f6", animation:`pulse 1s ${i*0.2}s infinite` }}></div>)}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ padding:16, borderTop:"1px solid #334155", display:"flex", gap:10 }}>
          <input className="input" style={{ flex:1 }} placeholder="اسألني عن المبيعات، المخزون، الزبائن..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} />
          <button className="btn btn-primary" onClick={sendMessage} style={{ display:"flex", alignItems:"center", gap:6 }}><Icon name="send" size={16} />إرسال</button>
        </div>
      </div>
      <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
        {["ما هو إجمالي المبيعات؟","أي منتج على وشك النفاذ؟","من يملك أكبر دين؟","اقترح تحسينات للمخزون"].map(q=>(
          <button key={q} onClick={()=>{setInput(q);}} style={{ padding:"6px 12px", background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#94a3b8", fontSize:12, cursor:"pointer", fontFamily:"'Tajawal',sans-serif" }}>{q}</button>
        ))}
      </div>
    </div>
  );
}

// ============ CASHIER ============
function CashierScreen({ products, setProducts, sales, setSales, users, currentUser, showNotif }) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [customerFound, setCustomerFound] = useState(null);
  const [payType, setPayType] = useState("cash");
  const [activeView, setActiveView] = useState("sell");

  const searchCustomer = (id) => {
    const c = users.find(u=>u.customerId===id&&u.role==="customer");
    setCustomerFound(c||null);
  };

  const addByBarcode = () => {
    const product = products.find(p=>p.barcode===barcodeInput||p.id===barcodeInput);
    if (!product) return showNotif("❌ المنتج غير موجود", "error");
    if (product.stock === 0) return showNotif("❌ المنتج نفذ من المخزون", "error");
    if (product.stock <= 10) showNotif(`⚠️ تحذير: ${product.name} متبقي ${product.stock} فقط!`, "warning");
    const existing = cart.find(i=>i.productId===product.id);
    if (existing) setCart(cart.map(i=>i.productId===product.id?{...i,qty:i.qty+1}:i));
    else setCart([...cart, { productId:product.id, name:product.name, price:product.retailPrice, qty:1 }]);
    setBarcodeInput("");
  };

  const removeItem = (id) => setCart(cart.filter(i=>i.productId!==id));
  const total = cart.reduce((a,i)=>a+i.price*i.qty,0);

  const completeSale = () => {
    if (cart.length===0) return showNotif("السلة فارغة!", "error");
    if (payType==="debt") {
      if (!customerFound) return showNotif("يجب تحديد الزبون للدين", "error");
      const newDebt = (customerFound.debt||0) + total;
      if (newDebt > 1000) return showNotif(`❌ تجاوز حد الدين (1000دج)! الدين الحالي: ${customerFound.debt}دج`, "error");
    }

    const newSale = {
      id: `S${String(sales.length+1).padStart(3,"0")}`,
      date: new Date().toISOString().split("T")[0],
      cashierId: currentUser.id,
      customerId: customerFound?.customerId || "ZB-CASH",
      items: cart,
      total,
      paid: payType==="cash"
    };
    setSales([...sales, newSale]);

    // Update stock
    setProducts(products.map(p=>{
      const item = cart.find(i=>i.productId===p.id);
      return item ? {...p, stock:p.stock-item.qty} : p;
    }));

    setCart([]);
    setCustomerId("");
    setCustomerFound(null);
    showNotif(`✅ تم تسجيل البيع بنجاح! الإجمالي: ${total}دج`);
  };

  return (
    <div style={{ padding:24, display:"grid", gridTemplateColumns:"1fr 380px", gap:20, height:"calc(100vh - 61px)", overflow:"hidden" }}>
      {/* Left: Product Search */}
      <div style={{ display:"flex", flexDirection:"column", gap:16, overflowY:"auto" }}>
        <div style={{ display:"flex", gap:10 }}>
          {["sell","history"].map(v=>(
            <button key={v} className={`btn ${activeView===v?"btn-primary":"btn-ghost"}`} onClick={()=>setActiveView(v)}>
              {v==="sell"?"شاشة البيع":"سجل المبيعات"}
            </button>
          ))}
        </div>

        {activeView==="sell" && (
          <>
            <div style={{ display:"flex", gap:10 }}>
              <input className="input" style={{ flex:1 }} placeholder="📷 أدخل الباركود أو رقم المنتج..." value={barcodeInput} onChange={e=>setBarcodeInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addByBarcode()} />
              <button className="btn btn-primary" onClick={addByBarcode} style={{ display:"flex", alignItems:"center", gap:6 }}><Icon name="barcode" size={16} />مسح</button>
            </div>
            <div className="card" style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #334155", fontWeight:700, fontSize:13, color:"#94a3b8" }}>قائمة المنتجات</div>
              <table>
                <thead><tr><th>الباركود</th><th>المنتج</th><th>السعر</th><th>المخزون</th><th>إضافة</th></tr></thead>
                <tbody>
                  {products.map(p=>(
                    <tr key={p.id}>
                      <td style={{ fontSize:11, fontFamily:"monospace", color:"#64748b" }}>{p.barcode}</td>
                      <td style={{ fontWeight:600 }}>{p.name}</td>
                      <td style={{ color:"#10b981", fontWeight:700 }}>{p.retailPrice} دج</td>
                      <td><span className={`badge ${p.stock<=3?"badge-red":p.stock<=10?"badge-yellow":"badge-green"}`}>{p.stock}</span></td>
                      <td>
                        <button className="btn btn-success" style={{ padding:"6px 12px", fontSize:12 }} onClick={()=>{setBarcodeInput(p.barcode); setTimeout(addByBarcode,0);}} disabled={p.stock===0}>
                          {p.stock===0?"نفذ":"+ أضف"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeView==="history" && (
          <div className="card" style={{ padding:0, overflow:"hidden" }}>
            <table>
              <thead><tr><th>#</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
              <tbody>
                {[...sales].reverse().map(s=>(
                  <tr key={s.id}>
                    <td style={{ fontFamily:"monospace", color:"#64748b", fontSize:12 }}>{s.id}</td>
                    <td style={{ fontSize:13 }}>{s.date}</td>
                    <td style={{ fontWeight:700, color:"#10b981" }}>{s.total} دج</td>
                    <td><span className={`badge ${s.paid?"badge-green":"badge-red"}`}>{s.paid?"نقد":"دين"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div className="card" style={{ flex:1, display:"flex", flexDirection:"column" }}>
          <div style={{ fontWeight:800, fontSize:16, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <Icon name="sale" size:20 /> سلة المشتريات
          </div>
          <div style={{ flex:1, overflowY:"auto" }}>
            {cart.length===0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#475569" }}>
                <div style={{ fontSize:40, marginBottom:8 }}>🛒</div>
                <div>السلة فارغة</div>
                <div style={{ fontSize:12, marginTop:4 }}>أضف منتجات بالباركود</div>
              </div>
            ) : (
              cart.map(item=>(
                <div key={item.productId} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:"1px solid #334155" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{item.name}</div>
                    <div style={{ fontSize:12, color:"#64748b" }}>{item.price} دج × {item.qty}</div>
                  </div>
                  <div style={{ fontWeight:700, color:"#10b981", fontSize:15 }}>{item.price*item.qty} دج</div>
                  <button style={{ background:"#7f1d1d", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", color:"#fca5a5", fontSize:12 }} onClick={()=>removeItem(item.productId)}>✕</button>
                </div>
              ))
            )}
          </div>
          <div style={{ borderTop:"1px solid #334155", paddingTop:16, marginTop:8 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ fontSize:16, fontWeight:700 }}>الإجمالي</span>
              <span style={{ fontSize:22, fontWeight:900, color:"#10b981" }}>{total} دج</span>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>طريقة الدفع</div>
              <div style={{ display:"flex", gap:8 }}>
                {[["cash","نقد 💵"],["debt","دين 📝"]].map(([v,l])=>(
                  <button key={v} className={`btn ${payType===v?"btn-primary":"btn-ghost"}`} style={{ flex:1 }} onClick={()=>setPayType(v)}>{l}</button>
                ))}
              </div>
            </div>
            {payType==="debt" && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>ID الزبون</div>
                <div style={{ display:"flex", gap:8 }}>
                  <input className="input" style={{ flex:1 }} placeholder="ZB-001" value={customerId} onChange={e=>setCustomerId(e.target.value)} />
                  <button className="btn btn-ghost" onClick={()=>searchCustomer(customerId)}><Icon name="search" size={16} /></button>
                </div>
                {customerFound && (
                  <div style={{ marginTop:8, padding:10, background:"#064e3b", borderRadius:8, fontSize:13 }}>
                    <div style={{ fontWeight:700, color:"#6ee7b7" }}>{customerFound.name}</div>
                    <div style={{ color:"#94a3b8" }}>دين حالي: <span style={{ color: customerFound.debt>800?"#fca5a5":"#fcd34d" }}>{customerFound.debt||0} / 1000 دج</span></div>
                  </div>
                )}
              </div>
            )}
            <button className="btn btn-success" style={{ width:"100%", padding:14, fontSize:16 }} onClick={completeSale}>
              ✅ إتمام البيع
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ BUYER ============
function BuyerScreen({ products, setProducts, currentUser, showNotif }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", barcode:"", wholesalePrice:"", retailPrice:"", stock:"", category:"بقالة", paid:false });
  const [filter, setFilter] = useState("all");

  const addProduct = () => {
    if (!form.name||!form.barcode||!form.wholesalePrice||!form.retailPrice) return showNotif("أكمل جميع الحقول", "error");
    const barcode = form.barcode || String(Math.floor(Math.random()*9000000000000)+1000000000000);
    setProducts([...products, { id:`P${Date.now()}`, ...form, barcode, wholesalePrice:+form.wholesalePrice, retailPrice:+form.retailPrice, stock:+form.stock||0 }]);
    setShowAdd(false);
    setForm({ name:"", barcode:"", wholesalePrice:"", retailPrice:"", stock:"", category:"بقالة", paid:false });
    showNotif("✅ تم إضافة السلعة بنجاح");
  };

  const togglePaid = (id) => {
    setProducts(products.map(p=>p.id===id?{...p,paid:!p.paid}:p));
    showNotif("تم تحديث حالة الدفع");
  };

  const filtered = filter==="all"?products:filter==="paid"?products.filter(p=>p.paid):products.filter(p=>!p.paid);
  const totalWholesale = products.reduce((a,p)=>a+p.wholesalePrice*p.stock,0);
  const unpaidValue = products.filter(p=>!p.paid).reduce((a,p)=>a+p.wholesalePrice*p.stock,0);

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800 }}>إدارة المشتريات</h2>
          <div style={{ fontSize:13, color:"#64748b", marginTop:2 }}>مرحباً {currentUser.name}</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(!showAdd)} style={{ display:"flex", alignItems:"center", gap:6 }}><Icon name="plus" size={16} />إضافة سلعة</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        {[
          { label:"إجمالي قيمة المخزون", value:`${totalWholesale.toLocaleString()} دج`, color:"#3b82f6" },
          { label:"غير مدفوع للمورد", value:`${unpaidValue.toLocaleString()} دج`, color:"#ef4444" },
          { label:"منتجات ناقصة", value:products.filter(p=>p.stock<=10).length, color:"#f59e0b" },
        ].map((s,i)=>(
          <div key={i} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:16, padding:20, textAlign:"center" }}>
            <div style={{ fontSize:26, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, marginBottom:16, color:"#94a3b8" }}>إضافة سلعة جديدة</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[["name","اسم السلعة","text"],["barcode","الباركود","text"],["wholesalePrice","سعر الجملة (دج)","number"],["retailPrice","سعر التجزئة (دج)","number"],["stock","الكمية الأولية","number"],["category","الفئة","text"]].map(([k,l,t])=>(
              <div key={k}><label style={{ display:"block", marginBottom:4, fontSize:12, color:"#64748b" }}>{l}</label><input className="input" style={{ width:"100%" }} type={t} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} /></div>
            ))}
          </div>
          <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:10 }}>
            <input type="checkbox" id="paidCheck" checked={form.paid} onChange={e=>setForm({...form,paid:e.target.checked})} style={{ cursor:"pointer" }} />
            <label htmlFor="paidCheck" style={{ fontSize:14, color:"#94a3b8", cursor:"pointer" }}>✅ تم دفع الثمن للمورد</label>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16 }}><button className="btn btn-success" onClick={addProduct}>حفظ السلعة</button><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>إلغاء</button></div>
        </div>
      )}

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {[["all","الكل"],["paid","مدفوع"],["unpaid","غير مدفوع"]].map(([v,l])=>(
          <button key={v} className={`btn ${filter===v?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter(v)}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <table>
          <thead><tr><th>الباركود</th><th>السلعة</th><th>الفئة</th><th>جملة</th><th>تجزئة</th><th>الهامش</th><th>مخزون</th><th>دفع المورد</th><th>إجراء</th></tr></thead>
          <tbody>
            {filtered.map(p=>(
              <tr key={p.id}>
                <td style={{ fontSize:11, fontFamily:"monospace", color:"#64748b" }}>{p.barcode}</td>
                <td style={{ fontWeight:600 }}>{p.name}</td>
                <td style={{ fontSize:12, color:"#94a3b8" }}>{p.category}</td>
                <td style={{ color:"#f59e0b" }}>{p.wholesalePrice} دج</td>
                <td style={{ color:"#10b981", fontWeight:700 }}>{p.retailPrice} دج</td>
                <td style={{ color:"#a78bfa", fontWeight:700 }}>{((p.retailPrice-p.wholesalePrice)/p.wholesalePrice*100).toFixed(0)}%</td>
                <td><span className={`badge ${p.stock<=3?"badge-red":p.stock<=10?"badge-yellow":"badge-green"}`}>{p.stock}</span></td>
                <td><span className={`badge ${p.paid?"badge-green":"badge-red"}`}>{p.paid?"مدفوع ✓":"غير مدفوع"}</span></td>
                <td>
                  <button className={`btn ${p.paid?"btn-warning":"btn-success"}`} style={{ padding:"6px 12px", fontSize:11 }} onClick={()=>togglePaid(p.id)}>
                    {p.paid?"تراجع":"دفع ✓"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ CUSTOMER ============
function CustomerScreen({ sales, currentUser, users }) {
  const mySales = sales.filter(s=>s.customerId===currentUser.customerId);
  const totalSpent = mySales.reduce((a,s)=>a+s.total,0);
  const totalPaid = mySales.filter(s=>s.paid).reduce((a,s)=>a+s.total,0);
  const totalDebt = mySales.filter(s=>!s.paid).reduce((a,s)=>a+s.total,0);
  const debtPercent = Math.min((totalDebt/1000)*100,100);

  return (
    <div style={{ padding:24 }}>
      <div style={{ background:"linear-gradient(135deg,#1e3a5f,#2e1065)", borderRadius:20, padding:24, marginBottom:24, border:"1px solid #3b82f633" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:"linear-gradient(135deg,#3b82f6,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>👤</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>{currentUser.name}</div>
            <div style={{ fontSize:14, color:"#94a3b8", marginTop:2 }}>رقم الزبون: <strong style={{ color:"#a78bfa" }}>{currentUser.customerId}</strong></div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        {[
          { label:"إجمالي المشتريات", value:`${totalSpent} دج`, color:"#3b82f6" },
          { label:"المدفوع", value:`${totalPaid} دج`, color:"#10b981" },
          { label:"الدين المتبقي", value:`${totalDebt} دج`, color:"#ef4444" },
        ].map((s,i)=>(
          <div key={i} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:16, padding:20, textAlign:"center" }}>
            <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {totalDebt > 0 && (
        <div className="card" style={{ marginBottom:24 }}>
          <div style={{ fontWeight:700, marginBottom:12, display:"flex", justifyContent:"space-between" }}>
            <span>حد الدين</span>
            <span style={{ color: debtPercent>=80?"#ef4444":"#f59e0b" }}>{totalDebt} / 1000 دج</span>
          </div>
          <div style={{ height:12, background:"#0f172a", borderRadius:6, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${debtPercent}%`, background:debtPercent>=80?"#ef4444":debtPercent>=50?"#f59e0b":"#3b82f6", borderRadius:6, transition:"width 0.5s" }}></div>
          </div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>{debtPercent>=80?"⚠️ اقتربت من الحد الأقصى للدين":"متبقي: "+(1000-totalDebt)+" دج"}</div>
        </div>
      )}

      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ padding:"14px 16px", borderBottom:"1px solid #334155", fontWeight:700, color:"#94a3b8", fontSize:13 }}>سجل مشترياتي</div>
        {mySales.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#475569" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🛒</div>
            <div>لا توجد مشتريات بعد</div>
          </div>
        ) : (
          <table>
            <thead><tr><th>#</th><th>التاريخ</th><th>المنتجات</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
            <tbody>
              {[...mySales].reverse().map(s=>(
                <tr key={s.id}>
                  <td style={{ fontFamily:"monospace", color:"#64748b", fontSize:12 }}>{s.id}</td>
                  <td style={{ fontSize:13 }}>{s.date}</td>
                  <td style={{ fontSize:12, color:"#94a3b8" }}>{s.items.map(i=>`${i.name}×${i.qty}`).join("، ")}</td>
                  <td style={{ fontWeight:700, color:"#10b981" }}>{s.total} دج</td>
                  <td><span className={`badge ${s.paid?"badge-green":"badge-red"}`}>{s.paid?"مدفوع":"دين"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
