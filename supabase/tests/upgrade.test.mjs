// Upgrade test: builds a database from migrations before 0012, records data the old way, applies 0012,
// and checks that balances, dues and the books are unchanged and money taken at sale/purchase became linked vouchers.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'

process.on('uncaughtException', (e) => {
  console.log('ERROR', e.message)
  process.exit(1)
})
const dir = new URL('../migrations/', import.meta.url)
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const before = files.filter((f) => f < '0012')
const after = files.filter((f) => f >= '0012')

const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`)
for (const f of before) await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'))

const q = async (sql, p) => (await db.query(sql, p)).rows
const one = async (sql, p) => (await q(sql, p))[0]
const rpc = async (fn, arg) => (await one(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(arg)])).r
let failures = 0
const check = (label, cond, extra = '') => {
  console.log(cond ? 'PASS ' : 'FAIL ', label, extra)
  if (!cond) failures++
}

const admin = '11111111-1111-1111-1111-111111111111'
await q(`insert into auth.users (id, email) values ($1, 'a@x.com')`, [admin])
await db.exec(`set request.jwt.claim.sub = '${admin}'`)
const id = async (sql) => (await one(sql)).id
const cash = await id(`select id from accounts where subtype = 'CASH'`)
await q(`update accounts set opening_balance = 100000 where id = $1`, [cash])
const bank = await id(`insert into accounts (code, name, type, subtype, opening_balance) values ('1010', 'Bank', 'ASSET', 'BANK', 500000) returning id`)
const wh = await id(`select id from warehouses limit 1`)
const sup = await id(`insert into parties (name, types) values ('Supplier', '{SUPPLIER}') returning id`)
const cus = await id(`insert into parties (name, types, opening_balance) values ('Customer', '{CUSTOMER}', 15000) returning id`)
const paddy = await id(`select id from items where code = 'P-01'`)

const pur = await rpc('save_purchase', { purchase_date: '2026-10-05', supplier_id: sup, warehouse_id: wh, paid_amount: 100000, paid_account_id: bank,
  lines: [{ item_id: paddy, gross_kg: 7400, rate: 30 }] })
const sale = await rpc('save_sale', { sale_date: '2026-10-13', customer_id: cus, warehouse_id: wh, received_amount: 50000, received_account_id: bank,
  lines: [{ item_id: paddy, qty_kg: 2000, rate: 40 }] })
await rpc('save_money_txn', { txn_date: '2026-10-15', txn_type: 'RECEIPT', party_id: cus, money_account_id: cash, amount: 20000 })

const snapshot = async () => ({
  parties: await q(`select name, balance from v_party_balances order by name`),
  accounts: await q(`select code, balance from v_account_balances where balance <> 0 order by code`),
  saleDue: (await one(`select due_amount from v_sale_dues where id = $1`, [sale])).due_amount,
  purDue: (await one(`select due_amount from v_purchase_dues where id = $1`, [pur])).due_amount,
})
const old = await snapshot()

for (const f of after) await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'))
const now = await snapshot()

check('party balances unchanged', JSON.stringify(old.parties) === JSON.stringify(now.parties), JSON.stringify(now.parties))
check('account balances unchanged', JSON.stringify(old.accounts) === JSON.stringify(now.accounts), JSON.stringify(now.accounts))
check('sale and purchase dues unchanged', old.saleDue === now.saleDue && old.purDue === now.purDue, `${now.saleDue} ${now.purDue}`)
check('money received at the sale is now a linked receipt', +(await one(`select count(*) c from money_txns where linked_sale_id = $1 and amount = 50000`, [sale])).c === 1)
check('money paid at the purchase is now a linked payment', +(await one(`select count(*) c from money_txns where linked_purchase_id = $1 and amount = 100000`, [pur])).c === 1)
check('every journal entry balances', (await q(`select entry_id from journal_lines group by entry_id having sum(debit) <> sum(credit)`)).length === 0)
// running it a second time must not duplicate anything
for (const f of after) await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'))
check('running 0012 again changes nothing', JSON.stringify(await snapshot()) === JSON.stringify(now)
  && +(await one(`select count(*) c from money_txns where linked_sale_id is not null or linked_purchase_id is not null`)).c === 2)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
