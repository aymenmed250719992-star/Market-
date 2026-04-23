# 🏪 نظام إدارة السوبرماركت الجزائري

نظام متكامل لإدارة سوبرماركت بواجهة عربية RTL، عملة دج، يدعم نقطة البيع، إدارة المخزون، الكرني، الموظفين، الورديات، والتحليلات الذكية بمساعد ذكاء اصطناعي.

> Full-stack Algerian supermarket management system. Arabic RTL, DZD currency, POS, inventory, customer credit (karni), payroll, shifts, smart analytics, AI assistant.

## ✨ الميزات الرئيسية

- 🛒 **نقطة بيع (POS)** سريعة مع مسح باركود ودفع جزئي
- 📦 **إدارة المخزون**: رف ومستودع، تتبع الصلاحية، تحويل آلي
- 👥 **زبائن الكرني**: مديونية، دفعات، نقاط ولاء (1 نقطة/100 دج)
- 💰 **رواتب وتسبقات وخصومات** للموظفين
- 🕐 **ورديات** بصندوق فتح/إغلاق
- ↩️ **مرتجعات المبيعات** مع استعادة المخزون
- 📊 **تحليلات ذكية**: مقارنة شهرية، مخططات يومية وسنوية
- 💡 **اقتراحات أسعار ذكية** بناءً على السرعة والهامش
- 📉 **توقع نفاد المخزون** مع توصيات إعادة التزويد
- 🤖 **مساعد ذكي** (Llama 3.3 70B عبر OpenRouter)
- 🔒 **سجل تدقيق** لكل العمليات الحساسة
- 💾 **نسخ احتياطي JSON** للأدمن
- 🌐 **تطبيق ويب + PWA + Capacitor** (Android/iOS)

## 🚀 التشغيل المحلي

### المتطلبات
- Node.js ≥ 20
- pnpm ≥ 9
- مشروع Firebase (Firestore + Service Account)

### الخطوات

```bash
# 1) ثبّت الاعتماديات
pnpm install

# 2) أنشئ ملف البيئة من القالب
cp .env.example .env
# ثم عبّئ القيم (FIREBASE_SERVICE_ACCOUNT و مفاتيح AI)

# 3) شغّل API + الواجهة (في تيرمنالين منفصلين)
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/supermarket dev
```

افتح: http://localhost:5173

## 📁 بنية المشروع

```
artifacts/
  api-server/    # Express + TypeScript، Firebase Admin، AI
  supermarket/   # React + Vite + Tailwind، PWA، Capacitor
  mockup-sandbox/
lib/
  api-spec/         # OpenAPI + codegen
  api-client-react/ # عميل مولّد
```

## 🔄 الترحيل المستقبلي إلى PostgreSQL

البنية الحالية تستخدم Firebase Firestore مع طبقة Cache في الذاكرة. كل المنطق مفصول في `artifacts/api-server/src/lib/cache.ts` و`firebase.ts` — يمكن استبدالهم بـ Drizzle + PostgreSQL دون تغيير منطق أي route.

## 🔐 ملاحظات أمنية

- ❌ لا ترفع `.env` أبداً — مغطّاة في `.gitignore`
- ❌ ملف خدمة Firebase (`*-firebase-adminsdk-*.json`) محمي
- 🔑 يُوضع `FIREBASE_SERVICE_ACCOUNT` كمتغير بيئي JSON كامل

## 📝 الترخيص

ملكية خاصة. الاستخدام التجاري يتطلب إذناً من المالك.
