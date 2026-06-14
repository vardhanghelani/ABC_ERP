# Jewellery Raw Material ERP & POS System

Production-grade web application for imitation jewellery raw material wholesale businesses.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React, Vite, TypeScript, TailwindCSS, Shadcn UI, TanStack Query, React Hook Form, Zod |
| Backend | Node.js, Express, MongoDB, Mongoose |
| Auth | JWT + Refresh Tokens |
| Storage | Cloudinary (images) |
| PDF | PDFKit (invoices) |

## Project Structure

```
ABC_ERP/
├── backend/                 # Express API
│   ├── src/
│   │   ├── config/          # DB, env, Cloudinary
│   │   ├── controllers/     # Route handlers (16 modules)
│   │   ├── middleware/      # Auth, RBAC, validation, audit
│   │   ├── models/          # Mongoose schemas (17 collections)
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── seed/            # Database seeder
│   │   ├── utils/           # Helpers, permissions
│   │   ├── app.ts
│   │   └── server.ts
│   └── .env.example
├── frontend/                # React SPA
│   └── src/
│       ├── components/      # UI + Layout
│       ├── contexts/        # Auth context
│       ├── lib/             # API client, utils
│       ├── pages/           # All ERP modules
│       └── types/
└── README.md
```

## Modules

1. **Authentication** - 5 roles with RBAC (Super Admin, Admin, Salesman, Warehouse, Accountant)
2. **Category Builder** - Dynamic categories & custom fields (no hardcoded product attributes)
3. **Products** - SKU, pricing, barcode, dynamic attributes
4. **Inventory** - Stock in/out, adjustments, transfers, audit, valuation
5. **Purchases** - PO, receiving, supplier ledger
6. **Customers** - Profiles, credit limit, outstanding, ledger
7. **POS** - Fast billing, barcode scan, multi-payment, invoice PDF
8. **Orders** - Pending, partial, completed, cancelled
9. **Accounting** - Cash book, bank book, payments, expenses
10. **Reports** - Sales, profit, stock analytics with charts
11. **Barcode** - Auto generation, search, scanner support
12. **Notifications** - Low stock, out of stock alerts
13. **Import/Export** - Excel export, bulk product import
14. **Audit Logs** - Full action tracking
15. **Settings** - Company info, tax, prefixes
16. **Dashboard** - Real-time business overview

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and secrets
npm install
npm run seed    # Creates admin user + sample categories
npm run dev     # http://localhost:5000
```

**Default Login:** `admin@jewelleryerp.com` / `admin123`

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev     # http://localhost:5173
```

## API Endpoints

Base URL: `http://localhost:5000/api`

| Module | Endpoints |
|--------|-----------|
| Auth | `/auth/login`, `/auth/refresh`, `/auth/me` |
| Categories | `/categories`, `/categories/:id/fields` |
| Products | `/products`, `/products/search`, `/products/barcode/:code` |
| Inventory | `/inventory/stock-in`, `/inventory/stock-out`, `/inventory/valuation` |
| Sales/POS | `/sales`, `/sales/:id/pdf` |
| Reports | `/dashboard`, `/reports/sales`, `/reports/profit` |

## Deployment

| Service | Platform |
|---------|----------|
| Frontend | Vercel |
| Backend | Railway / Render |
| Database | MongoDB Atlas |
| Images | Cloudinary |

### Environment Variables (Production)

**Backend:** `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `CLOUDINARY_*`

**Frontend:** `VITE_API_URL=https://your-api.railway.app/api`

## Dynamic Category System

No product fields are hardcoded. Admin creates categories and defines fields:

```
Category: AD Stones
Fields: Shape (dropdown), Color (color), Size (text), Grade (dropdown)
```

Products inherit category fields automatically. Adding new categories requires zero code changes.

## License

Private - All rights reserved.
