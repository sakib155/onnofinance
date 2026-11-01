# Onno (অন্ন)

Business management for a rice mill and rice trading company: purchases, milling, stock, sales, money and the books, in English and Bangla.

## What it covers

- **Trading**: purchases from suppliers (bags, gross weight, moisture/bag deductions, broker commission, transport and labour), sales orders with the customer's PO number, sales invoices and challans with PDF, customer and supplier returns.
- **Mill**: two sections. The dryer turns paddy into unsorted rice; the sorter turns unsorted rice (own or bought) into sorted rice. Each batch records its input and output times, the lots and suppliers it used, and its costs. By-products (husk, bran, broken rice…) are valued at their current price and the main product carries the rest of the cost. A live mill floor page and a supplier yield report show what each supplier's material really made.
- **Stock**: every purchase and batch output is a lot with its own cost per kg. Sales and milling take from the oldest lot first unless a lot is picked. Godown transfers, shortages, gains and opening stock.
- **Money**: receipts, payments, expenses, other income, cash↔bank transfers, owner capital and drawings, loans taken and given, cheques (pending / cleared / bounced). Payments settle the oldest unpaid bills first, or the ones you pick.
- **Reports**: dashboard, cash and bank books, cash summary, party statements, dues with ageing, lot profit, batch yield and cost, profit & loss, balance sheet, trial balance, stock summary.
- **Users**: Super admin (manages the team), Admin, Accountant, Purchaser, Sales, Production, Operator and Viewer, each limited to its own work. Every change is recorded in an audit log.

Behind the screens every document posts double-entry journal lines, so the books, party balances and stock value always agree.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Build the database script and run it in the project's SQL editor:
   ```bash
   npm install
   ```
   ```bash
   npm run db:bundle
   ```
   Then paste `supabase/setup.sql` into the SQL editor and run it.
3. Copy `.env.example` to `.env` and fill in the project URL and anon key (Project Settings → API).
4. Start the app:
   ```bash
   npm run dev
   ```
5. Create an account. The first account becomes the super admin. Later sign-ups wait, seeing nothing, until the super admin approves them under Setup → Team (or invites their email first).

## Updating the database

Each change to the database is a new file in `supabase/migrations/`. Run only the new file in the Supabase SQL editor; every migration is safe to run again. The newest migration sets `schema_version()`, and `SCHEMA_VERSION` in `src/app/Layout.tsx` must match it: when the database is behind, the app shows a red bar instead of quietly showing wrong data.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type check and production build |
| `npm run lint` | ESLint |
| `npm run test:db` | Runs every migration in an in-memory Postgres (PGlite) and checks a full business flow: purchases, milling, sales, payments, cheques, returns, transfers, permissions, and that the books balance |
| `npm run db:bundle` | Joins `supabase/migrations/*.sql` into `supabase/setup.sql` |

## Layout

```
supabase/migrations/   database: tables, posting functions, reports, security, starting data
supabase/tests/        database test
src/app/               router, layout, sign-in and roles
src/components/        shared UI
src/features/          one folder per area: trading, production, stock, money, parties, accounts, reports, setup
src/i18n/              English and Bangla text
src/lib/               Supabase client, data hooks, formatting
```

All writes to documents go through database functions (`save_purchase`, `save_sale`, `save_production_batch`, `save_money_txn`, …) that check the user's role and post stock and journal entries in one transaction. Editing a document reverses its old entries and posts it again.
