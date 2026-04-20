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
- **POS Terminal**: Barcode search, cart, hold cart, discounts, karni debt sales, thermal receipt printing
- **Customer Portal**: Public `/customer` page for product browsing, online orders, debt lookup, and recent invoice/order lookup by phone
- **Online Orders**: Admin/cashier `/online-orders` page to track order status and assign distributors
- **Distributor Portal**: Distributor `/distributor` page for publishing wholesale supply offers; admin can view distributor offers
- **AI Assistant**: GPT-powered Arabic inventory queries integrated into POS via Replit AI Integrations with deterministic database fallback
- **Karni System**: Customer debt tracking with credit limits
- **Expiry Tracking**: Visual alerts for products expiring within 30 days
- **Shortage Reporting**: Workers report shortages/damage without direct stock edit
- **Payroll**: Monthly salary records with bonus/deduction (admin only)
- **Dashboard Analytics**: Sales charts, top products, low stock alerts
- **Arabic RTL UI**: Full right-to-left, Tajawal font, dark mode by default, DZD currency

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

## Seeded Data

- 4 employees (admin, cashier, buyer, worker)
- 15 Algerian products across categories
- 4 customers with karni debt data
- 5 sample sales

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
- `artifacts/supermarket: web` on port `19528` with `BASE_PATH=/`
- frontend development proxy forwards `/api` requests to the API server

For Replit compatibility, the API server no longer crashes when Firebase credentials are absent. It preserves the existing Firestore-style route code and uses local persisted data in `.data/firestore-local.json` during development; if `FIREBASE_SERVICE_ACCOUNT` is later added, the same code initializes Firebase Admin instead.

The inventory assistant uses the Replit-managed OpenAI integration when available and falls back to deterministic inventory analysis from the active inventory data if the AI response is unavailable or empty.
