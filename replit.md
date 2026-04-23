# نظام إدارة السوبرماركت الجزائري

A full-stack Algerian Supermarket Management System with RBAC, Arabic RTL UI, online customer ordering, distributor offers, and AI inventory assistant.

## Architecture

**Monorepo (pnpm workspaces):**
- `artifacts/api-server` — Express.js 5 REST API (port 8080)
- `artifacts/supermarket` — React + Vite frontend (root `/`)
- `artifacts/api-server/.data/firestore-local.json` — local persisted Firestore-compatible data used on Replit when `FIREBASE_SERVICE_ACCOUNT` is not configured
- `lib/db` — Drizzle ORM schemas + PostgreSQL migrations retained in the workspace but not used by the active API routes
- `lib/api-spec` — OpenAPI 3.0 spec + Orval codegen config
- `lib/api-zod` — Generated Zod validation schemas
- `lib/api-client-react` — Generated TanStack Query hooks

## Features

- **RBAC**: Admin, Cashier, Buyer, Worker, Customer, Distributor route/UI guards
- **POS Terminal**: Barcode search, cart, hold cart, discounts, karni debt sales, thermal receipt printing, shift open/close reconciliation, and quick restock task requests
- **Customer Portal**: Public `/customer` page for product browsing, online orders, debt lookup, and recent invoice/order lookup by phone
- **Online Orders**: Admin/cashier `/online-orders` page to track order status and assign distributors
- **Distributor Portal**: Distributor `/distributor` page for publishing wholesale supply offers; admin can view distributor offers
- **AI Assistant**: GPT-powered Arabic inventory queries integrated into POS via Replit AI Integrations with deterministic database fallback
- **Karni System**: Customer debt tracking with credit limits and local cash debt collection records
- **Expiry Tracking**: Visual alerts for products expiring within 30 days
- **Shortage Reporting**: Workers report shortages/damage without direct stock edit
- **Payroll**: Monthly salary records with bonus/deduction (admin only)
- **Staff Operations**: Employee account management, task approval workflow, expense tracking, advances/penalties, and payroll summaries
- **Dashboard Analytics**: Sales charts, top products, low stock alerts
- **Loyalty Program**: Customers earn 1 point per 100 DZD spent (1 point = 1 DZD discount on redeem)
- **Sales Returns**: Lookup any sale and partially/fully return items; restock products and refund cash or reduce karni debt automatically
- **Audit Log**: Full who/what/when tracking of sales, returns, loyalty redemption, backup operations (admin-only `/audit`)
- **Backup & Restore**: Admin-only `/backup` page exports full DB snapshot as JSON and restores from a backup file
- **Smart Analytics** (`/analytics`, admin): Month-over-month comparison (revenue, gross/net profit, sales count, avg ticket) with daily revenue line chart, top 10 products, full yearly bar chart
- **Smart Price Suggestions** (`/price-suggestions`, admin): Analyzes 30-day sales velocity, margin %, and stock levels to suggest price increases (high demand + low margin), discounts (slow movers + overstock), clearance (very slow + huge stock), and loss-leader alerts (selling below cost). One-click apply with audit log.
- **AI Assistant**: Strong open-source LLM (Llama 3.3 70B via OpenRouter) as primary, with Gemini and OpenAI as automatic fallbacks
- **Arabic RTL UI**: Full right-to-left, Tajawal font, dark mode by default, DZD currency
- **PWA + Native-Ready**: Installable Progressive Web App (manifest, service worker, offline cache via `vite-plugin-pwa`); Capacitor configured for native Android/iOS builds (`pnpm --filter @workspace/supermarket cap:add:android` / `cap:add:ios`)
- **In-Memory Product Cache**: API server caches all products in memory after first Firestore load to keep search/listing instant and minimize Firestore reads (auto-invalidated on writes)

## Mobile App (Android / iOS) Build

Capacitor wraps the web app into native shells. Native builds require local dev tools (Android Studio for Android, Xcode for iOS) — they cannot be built on Replit but the project is fully configured.

From a local machine after cloning the repo:

```
pnpm install
pnpm --filter @workspace/supermarket cap:add:android   # one-time
pnpm --filter @workspace/supermarket cap:add:ios       # one-time, macOS only
pnpm --filter @workspace/supermarket cap:sync          # rebuild + sync after code changes
pnpm --filter @workspace/supermarket cap:open:android  # opens Android Studio
pnpm --filter @workspace/supermarket cap:open:ios      # opens Xcode
```

App identity: `com.supermarket.algeria` / "السوبرماركت" (configured in `capacitor.config.ts`).

## User Preferences

- Do not add online payment gateways or payment integrations such as Stripe, PayPal, checkout pages, card processors, or subscription billing. Keep sales/order payment handling limited to local store concepts such as cash, debt/karni, delivery collection, or store pickup.
- Firebase service account files must not be committed. If Firebase is used, place the JSON in the `FIREBASE_SERVICE_ACCOUNT` secret after regenerating any exposed key.

## Admin Credentials

- Email: `aymenmed25071999@gmail.com`
- Password: `Nova3iNokiac25071999@@`

## Technology Stack

- **Backend**: Express.js 5, Node.js, TypeScript
- **Database**: Firebase Admin Firestore when `FIREBASE_SERVICE_ACCOUNT` is configured; local persisted Firestore-compatible JSON storage in Replit development when it is not configured
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **State**: TanStack Query (React Query v5)
- **Routing**: Wouter
- **Charts**: Recharts
- **AI**: OpenAI GPT via Replit AI Integrations (OPENAI_BASE_URL / OPENAI_API_KEY)
- **Forms**: react-hook-form + Zod

## DB Schema Tables

- `users` — employees and portal accounts with roles and salary info
- `products` — inventory with barcode, unit, expiry, supplier
- `customers` — karni customers with debt and credit limit
- `sales` — sales records with items JSON, payment method
- `online_orders` — customer online orders with status, delivery fee, payment method, and distributor assignment
- `distributor_offers` — distributor-published wholesale supply offers
- `shortages` — shortage/damage/expired reports
- `salaries` — monthly salary records
- `tasks` — employee task records
- `expenses` — store expense records
- `advances` — employee advance/deduction records
- `shifts` — worker shift records

## API Endpoints

```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET/POST  /api/users
GET/PATCH/DELETE /api/users/:id

GET/POST  /api/products
GET/PATCH/DELETE /api/products/:id
GET  /api/products/barcode/:barcode
POST /api/products/:id/restock

GET/POST  /api/sales
GET  /api/sales/:id

GET/POST  /api/customers
GET/PATCH  /api/customers/:id
POST /api/customers/:id/pay-debt

GET/POST  /api/online-orders
GET /api/online-orders/lookup?phone=...
PATCH /api/online-orders/:id

GET/POST  /api/distributor-offers
PATCH /api/distributor-offers/:id

GET/POST  /api/shortages
PATCH /api/shortages/:id/resolve

GET/POST  /api/salaries

GET /api/dashboard/summary
GET /api/dashboard/sales-chart
GET /api/dashboard/top-products
GET /api/dashboard/expiring-products

POST /api/ai/inventory-query

GET  /api/audit                     # admin only
GET  /api/backup/info               # admin only — collection counts
GET  /api/backup/export             # admin only — download JSON snapshot
POST /api/backup/import             # admin only — restore JSON snapshot

GET  /api/loyalty/info
GET  /api/customers/:id/loyalty
POST /api/customers/:id/redeem-points  # admin/cashier

GET  /api/returns                   # admin/cashier
POST /api/returns                   # admin/cashier — { saleId, items[], reason? }
GET  /api/returns/by-sale/:saleId

GET  /api/analytics/monthly-comparison?year&month   # admin only
GET  /api/analytics/yearly-overview?year            # admin only
GET  /api/price-suggestions                         # admin only — smart price recommendations
```

## Key Files

- `lib/api-spec/openapi.yaml` — generated client contract for legacy endpoints
- `lib/api-spec/orval.config.ts` — Codegen config
- `lib/db/src/schema/index.ts` — DB schema exports
- `lib/db/src/schema/online-orders.ts` — online order schema
- `lib/db/src/schema/distributor-offers.ts` — distributor offer schema
- `artifacts/api-server/src/routes/index.ts` — Route registration
- `artifacts/api-server/src/routes/online-orders.ts` — Online order APIs
- `artifacts/api-server/src/routes/distributor-offers.ts` — Distributor offer APIs
- `artifacts/supermarket/src/App.tsx` — Route definitions + RBAC guards
- `artifacts/supermarket/src/contexts/AuthContext.tsx` — Auth state and role-based login redirects
- `artifacts/supermarket/src/components/layout/Layout.tsx` — RTL sidebar navigation
- `artifacts/supermarket/src/pages/customer-portal.tsx` — Public customer portal
- `artifacts/supermarket/src/pages/online-orders.tsx` — Admin/cashier online order management
- `artifacts/supermarket/src/pages/distributor-portal.tsx` — Distributor/admin offer portal
- `artifacts/supermarket/src/pages/pos.tsx` — POS terminal
- `artifacts/supermarket/src/pages/tasks.tsx` — Staff task workflow with status summaries
- `artifacts/supermarket/src/pages/employees.tsx` — Admin account and staff management
- `artifacts/supermarket/src/pages/expenses.tsx` — Monthly expenses and net profit view
- `artifacts/supermarket/src/pages/advances.tsx` — Employee advances and penalty deductions
- `artifacts/supermarket/src/pages/salaries.tsx` — Payroll records and monthly salary totals

## Seeded Data

- 4 employees (admin, cashier, buyer, worker)
- 2 portal users (customer, distributor)
- 15 Algerian products across categories
- 4 customers with karni debt data
- 5 sample sales
- sample shortages, tasks, expenses, advances, online orders, distributor offers, and a closed shift for dashboard/report realism

## Development

```bash
# Start API server manually
pnpm --filter @workspace/api-server dev

# Start frontend manually
pnpm --filter @workspace/supermarket dev

# Push DB schema
pnpm --filter @workspace/db run push

# Run codegen
pnpm --filter @workspace/api-spec run codegen
```

Current Replit artifact workflows run the API server and frontend separately:
- `artifacts/api-server: API Server` on port `8080`
- `artifacts/supermarket: Start application` on port `3000` with `BASE_PATH=/`
- frontend development proxy forwards `/api` requests to the API server

For Replit compatibility, the API server no longer crashes when Firebase credentials are absent. It preserves the existing Firestore-style route code and uses local persisted data in `.data/firestore-local.json` during development; if `FIREBASE_SERVICE_ACCOUNT` is later added, the same code initializes Firebase Admin instead.

The inventory assistant uses the Replit-managed OpenAI integration when available and falls back to deterministic inventory analysis from the active inventory data if the AI response is unavailable or empty.
