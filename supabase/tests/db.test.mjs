// Runs all migrations in PGlite with a stubbed Supabase auth schema, then exercises a full business flow.
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'

process.on('uncaughtException', (e) => { console.log('ERROR', e.message, e.query || ''); process.exit(1) })
const dir = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname
const db = new PGlite()

const stub = `
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`
await db.exec(stub)
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
    console.log('ok   ', f)
  } catch (e) {
    console.log('FAIL ', f, e.message)
    process.exit(1)
  }
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
               grant usage on all sequences in schema public to authenticated;`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const rpc = async (fn, arg) => (await one(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(arg)])).r
let failures = 0
const check = (label, cond, extra = '') => {
  console.log(cond ? 'PASS ' : 'FAIL ', label, extra)
  if (!cond) failures++
}
const expectError = async (label, fn, match) => {
  try { await fn(); check(label, false, '(no error)') }
  catch (e) { check(label, !match || e.message.includes(match), e.message) }
}

// Users: first sign-up becomes the active super admin, later sign-ups wait for approval
const admin = '11111111-1111-1111-1111-111111111111'
const viewer = '22222222-2222-2222-2222-222222222222'
await q(`insert into auth.users (id, email) values ($1, 'a@x.com'), ($2, 'v@x.com')`, [admin, viewer])
const roles = await q(`select email, role, status from public.profiles order by email`)
check('first sign-up is active SUPER_ADMIN, next is PENDING', roles[0].role === 'SUPER_ADMIN' && roles[0].status === 'ACTIVE' && roles[1].status === 'PENDING', JSON.stringify(roles))
await db.exec(`set request.jwt.claim.sub = '${admin}'`)

const acc = async (sub) => (await one(`select id from accounts where subtype = $1 order by code limit 1`, [sub])).id
const item = async (code) => (await one(`select id from items where code = $1`, [code])).id
const cash = await acc('CASH')
await q(`update accounts set opening_balance = 100000, opening_date = '2026-01-01' where id = $1`, [cash])
const bank = (await one(`insert into accounts (code, name, type, subtype, bank_name, opening_balance, opening_date)
  values ('1010', 'Sonali Bank', 'ASSET', 'BANK', 'Sonali', 50000, '2026-01-01') returning id`)).id
const wh = (await one(`select id from warehouses limit 1`)).id
const wh2 = (await one(`insert into warehouses (name) values ('Godown 2') returning id`)).id
const sup = (await one(`insert into parties (name, types, opening_balance, opening_date) values ('Rahim Traders', '{SUPPLIER}', -5000, '2026-01-01') returning id`)).id
const cus = (await one(`insert into parties (name, types) values ('Karim Store', '{CUSTOMER}') returning id`)).id
const brk = (await one(`insert into parties (name, types) values ('Broker Jamal', '{BROKER}') returning id`)).id
const lender = (await one(`insert into parties (name, types) values ('Uncle Loan', '{LENDER}') returning id`)).id
const paddy = await item('P-01'), rice = await item('R-01'), broken = await item('B-01'), bran = await item('B-02'), husk = await item('B-03')

// Purchase
const pur = await rpc('save_purchase', {
  purchase_date: '2026-02-01', supplier_id: sup, broker_id: brk, warehouse_id: wh,
  transport_cost: 3000, costs_account_id: cash, commission_amount: 1000, paid_amount: 100000, paid_account_id: cash,
  lines: [{ item_id: paddy, bags: 100, bag_size_kg: 75, gross_kg: 7500, deduction_kg: 100, rate: 30, rate_unit: 'KG' }],
})
const p = await one(`select * from purchases where id = $1`, [pur])
check('purchase totals', +p.goods_amount === 222000 && +p.total_cost === 226000 && +p.supplier_total === 222000, JSON.stringify({ g: p.goods_amount, t: p.total_cost }))
const lot = await one(`select * from lots where source_id = $1`, [pur])
check('purchase lot landed cost', Math.abs(lot.unit_cost - 226000 / 7400) < 0.001 && +lot.qty_kg === 7400, lot.unit_cost)

// Second purchase, to test FIFO and editing
const pur2 = await rpc('save_purchase', {
  purchase_date: '2026-02-05', supplier_id: sup, warehouse_id: wh,
  lines: [{ item_id: paddy, bags: 20, bag_size_kg: 75, gross_kg: 1500, rate: 2400, rate_unit: 'BAG' }],
})
check('rate per bag', +(await one(`select goods_amount from purchases where id=$1`, [pur2])).goods_amount === 48000)
await rpc('save_purchase', { id: pur2, purchase_date: '2026-02-05', supplier_id: sup, warehouse_id: wh,
  lines: [{ item_id: paddy, bags: 20, bag_size_kg: 75, gross_kg: 1500, rate: 2500, rate_unit: 'BAG' }] })
check('edit purchase reposts', +(await one(`select goods_amount from purchases where id=$1`, [pur2])).goods_amount === 50000
  && +(await one(`select count(*) c from lots where source_id=$1`, [pur2])).c === 1)

// Production: dryer (paddy → unsorted + husk + bran), then sorter (unsorted → sorted rice + broken + polish)
const unsorted = await item('U-01'), polish = await item('B-04')
const price = async (id) => +(await one(`select standard_price from items where id = $1`, [id])).standard_price
await rpc('save_stock_adjustment', { adjustment_date: '2026-01-01', kind: 'OPENING', item_id: husk, warehouse_id: wh, qty_kg: 1000, unit_cost: 4 })
await expectError('dryer material must be paddy', () => rpc('save_production_batch', { kind: 'DRYER', start_date: '2026-02-10', input_warehouse_id: wh, output_warehouse_id: wh,
  inputs: [{ item_id: husk, qty_kg: 10 }] }), 'is not paddy')
const bat = await rpc('save_production_batch', {
  kind: 'DRYER', start_date: '2026-02-10', input_warehouse_id: wh, output_warehouse_id: wh,
  inputs: [{ item_id: paddy, bags: 93, qty_kg: 7000 }, { item_id: husk, qty_kg: 300, purpose: 'CONSUMABLE' }],
})
const b0 = await one(`select * from production_batches where id = $1`, [bat])
check('dryer batch numbered DRY and counts only paddy as material', b0.batch_no.startsWith('DRY-') && +b0.input_kg === 7000, `${b0.batch_no} ${b0.input_kg}`)
check('own husk burned as fuel is part of the batch cost', Math.abs(b0.input_cost - (7000 * lot.unit_cost + 300 * 4)) < 1, b0.input_cost)
const fuel = (await one(`select id from accounts where code='6010'`)).id
const labour = (await one(`select id from accounts where code='6000'`)).id
const elec = (await one(`select id from accounts where code='6020'`)).id
await rpc('save_production_cost', { batch_id: bat, stage: 'GENERAL', cost_date: '2026-02-10', cost_head_id: fuel, amount: 5000, paid_account_id: cash })
const c2 = await rpc('save_production_cost', { batch_id: bat, stage: 'GENERAL', cost_date: '2026-02-13', cost_head_id: labour, amount: 3000, party_id: brk })
await db.query(`select public.delete_production_cost($1)`, [c2])
await rpc('save_production_cost', { batch_id: bat, stage: 'GENERAL', cost_date: '2026-02-13', cost_head_id: labour, amount: 2000, paid_account_id: cash })
const complete = (id, date, outputs) => db.query(`select public.complete_production_batch($1::jsonb)`, [JSON.stringify({ batch_id: id, completed_date: date, outputs })])
await expectError('dryer cannot output sorted rice', () => complete(bat, '2026-02-14', [{ item_id: rice, qty_kg: 4900 }]), 'unsorted rice and by-products only')
await expectError('dryer needs an unsorted rice output', () => complete(bat, '2026-02-14', [{ item_id: husk, qty_kg: 1400 }]), 'Add the unsorted rice')
await complete(bat, '2026-02-14', [{ item_id: unsorted, bags: 98, bag_size_kg: 50, qty_kg: 4900 }, { item_id: husk, qty_kg: 1400 }, { item_id: bran, qty_kg: 500 }])
const dryTotal = +b0.input_cost + 7000
const byVal = 1400 * (await price(husk)) + 500 * (await price(bran))
const dv = await one(`select * from v_production_batches where id = $1`, [bat])
const huskOut = await one(`select cost_share, unit_cost from production_outputs where batch_id = $1 and item_id = $2`, [bat, husk])
check('by-products are valued at their current price', Math.abs(+huskOut.unit_cost - (await price(husk))) < 0.0001 && Math.abs(+dv.byproduct_value - byVal) < 0.01, `${huskOut.unit_cost} ${dv.byproduct_value}`)
check('unsorted rice carries the rest of the dryer cost', Math.abs(+dv.main_cost - (dryTotal - byVal)) < 0.01 && Math.abs(+dv.main_cost_per_kg - (dryTotal - byVal) / 4900) < 0.001,
  `${dv.main_cost} ${dv.main_cost_per_kg} yield ${dv.main_yield_pct}%`)
check('dryer yield = unsorted kg / paddy kg', +dv.main_yield_pct === 70, dv.main_yield_pct)
check('WIP is zero after completion', +(await one(`select balance from v_account_balances where subtype='WIP'`)).balance === 0)
await expectError('cannot add cost to completed batch', () => rpc('save_production_cost', { batch_id: bat, cost_date: '2026-02-15', cost_head_id: fuel, amount: 1, paid_account_id: cash }), 'completed')

// unsorted rice bought from another mill, then sorted together with our own
const otherMill = (await one(`insert into parties (name, types) values ('Other Mill', '{SUPPLIER}') returning id`)).id
await rpc('save_purchase', { purchase_date: '2026-02-15', supplier_id: otherMill, warehouse_id: wh, lines: [{ item_id: unsorted, bags: 10, bag_size_kg: 50, gross_kg: 500, rate: 44 }] })
await expectError('sorter material must be unsorted rice', () => rpc('save_production_batch', { kind: 'SORTER', start_date: '2026-02-16', input_warehouse_id: wh, output_warehouse_id: wh,
  inputs: [{ item_id: paddy, qty_kg: 10 }] }), 'is not unsorted rice')
const sbat = await rpc('save_production_batch', { kind: 'SORTER', start_date: '2026-02-16', input_warehouse_id: wh, output_warehouse_id: wh,
  inputs: [{ item_id: unsorted, qty_kg: 5400 }] })
await rpc('save_production_cost', { batch_id: sbat, stage: 'GENERAL', cost_date: '2026-02-16', cost_head_id: elec, amount: 1500, paid_account_id: cash })
await expectError('sorter needs a sorted rice output', () => complete(sbat, '2026-02-17', [{ item_id: broken, qty_kg: 300 }]), 'Add the sorted rice')
await complete(sbat, '2026-02-17', [{ item_id: rice, bags: 90, bag_size_kg: 50, qty_kg: 4500 }, { item_id: broken, qty_kg: 300 }, { item_id: polish, qty_kg: 400 }])
const sv = await one(`select * from v_production_batches where id = $1`, [sbat])
const sortTotal = (dryTotal - byVal) + 500 * 44 + 1500
const sortBy = 300 * (await price(broken)) + 400 * (await price(polish))
check('sorter batch numbered SOR, mixes own and bought unsorted rice', sv.batch_no.startsWith('SOR-') && Math.abs(+sv.input_cost - ((dryTotal - byVal) + 22000)) < 0.05, `${sv.batch_no} ${sv.input_cost}`)
check('sorted rice cost chains paddy + dryer + bought unsorted + sorter costs', Math.abs(+sv.main_cost - (sortTotal - sortBy)) < 0.05, `${sv.main_cost} vs ${sortTotal - sortBy}, ${sv.main_cost_per_kg}/kg`)
await q(`update items set standard_price = 5 where id = $1`, [husk])
const hist = await q(`select old_price, new_price from item_price_history where item_id = $1 order by id`, [husk])
check('price changes are kept in the history', hist.length === 2 && +hist[1].old_price === 4 && +hist[1].new_price === 5, JSON.stringify(hist))
await q(`update items set standard_price = 4 where id = $1`, [husk])
// by-products worth more than the batch are refused
const tiny = await rpc('save_production_batch', { kind: 'DRYER', start_date: '2026-02-18', input_warehouse_id: wh, output_warehouse_id: wh, inputs: [{ item_id: paddy, qty_kg: 10 }] })
await expectError('by-products cannot be worth more than the batch', () => complete(tiny, '2026-02-18', [{ item_id: unsorted, qty_kg: 5 }, { item_id: bran, qty_kg: 1000 }]), 'worth more than the whole batch')
await db.query(`select public.delete_production_batch($1)`, [tiny])

// Sales
const sale = await rpc('save_sale', {
  sale_date: '2026-02-20', customer_id: cus, warehouse_id: wh, transport_charge: 500, discount: 1000,
  received_amount: 50000, received_account_id: bank,
  lines: [{ item_id: rice, bags: 40, bag_size_kg: 50, qty_kg: 2000, rate: 55 }],
})
const s = await one(`select * from sales where id = $1`, [sale])
check('sale totals', +s.goods_amount === 110000 && +s.total_amount === 109500 && +s.cost_amount > 0, `${s.total_amount} cost ${s.cost_amount}`)
const sale2 = await rpc('save_sale', { sale_date: '2026-02-21', customer_id: cus, warehouse_id: wh, broker_id: brk, commission_amount: 500,
  lines: [{ item_id: paddy, qty_kg: 600, rate: 36 }] })
const s2alloc = await q(`select l.source_id, a.qty_kg from lot_allocations a join lots l on l.id=a.lot_id where a.source_id=$1`, [sale2])
check('trading sale FIFO splits across lots', s2alloc.length === 2 && s2alloc[0].source_id === pur && +s2alloc[0].qty_kg === 400, JSON.stringify(s2alloc))
await expectError('cannot oversell', () => rpc('save_sale', { sale_date: '2026-02-21', customer_id: cus, warehouse_id: wh, lines: [{ item_id: rice, qty_kg: 99999, rate: 1 }] }), 'Not enough stock')
await expectError('cannot edit purchase whose stock was used', () => rpc('save_purchase', { id: pur, purchase_date: '2026-02-01', supplier_id: sup, warehouse_id: wh, lines: [{ item_id: paddy, gross_kg: 10, rate: 1 }] }), 'already been')
// edit sale
await rpc('save_sale', { id: sale2, sale_date: '2026-02-21', customer_id: cus, warehouse_id: wh, broker_id: brk, commission_amount: 500,
  lines: [{ item_id: paddy, qty_kg: 300, rate: 36 }] })
check('edit sale gives stock back', +(await one(`select sum(qty_kg) q from lot_allocations where source_id=$1`, [sale2])).q === 300)

// Money
const rcv = await rpc('save_money_txn', { txn_date: '2026-02-25', txn_type: 'RECEIPT', party_id: cus, money_account_id: cash, amount: 60000, allocations: null })
const settled = await q(`select sale_id, amount from bill_settlements where money_txn_id = $1 order by id`, [rcv])
check('receipt with allocations: null settles oldest bill first', settled[0].sale_id === sale && +settled[0].amount === 59500 && +settled[1].amount === 500, JSON.stringify(settled))
await rpc('save_money_txn', { txn_date: '2026-02-25', txn_type: 'PAYMENT', party_id: sup, money_account_id: bank, amount: 50000, method: 'CHEQUE', cheque_no: '123' })
const chq = (await one(`select id from money_txns where cheque_no='123'`)).id
await db.query(`select public.set_cheque_status($1, 'BOUNCED')`, [chq])
check('bounced cheque removes posting', +(await one(`select count(*) c from journal_entries where source_id=$1`, [chq])).c === 0)
await db.query(`select public.set_cheque_status($1, 'CLEARED')`, [chq])
check('cleared cheque posts again', +(await one(`select count(*) c from journal_entries where source_id=$1`, [chq])).c === 1)
const salary = (await one(`select id from accounts where code='6040'`)).id
await rpc('save_money_txn', { txn_date: '2026-02-28', txn_type: 'EXPENSE', money_account_id: cash, counter_account_id: salary, amount: 10000 })
await rpc('save_money_txn', { txn_date: '2026-02-28', txn_type: 'TRANSFER', money_account_id: cash, counter_account_id: bank, amount: 20000 })
await rpc('save_money_txn', { txn_date: '2026-02-28', txn_type: 'CAPITAL_IN', money_account_id: bank, amount: 200000 })
await rpc('save_money_txn', { txn_date: '2026-02-28', txn_type: 'DRAWING', money_account_id: cash, amount: 5000 })
await rpc('save_money_txn', { txn_date: '2026-02-28', txn_type: 'LOAN_TAKEN', party_id: lender, money_account_id: bank, amount: 100000 })
await rpc('save_money_txn', { txn_date: '2026-03-01', txn_type: 'LOAN_REPAY', party_id: lender, money_account_id: bank, amount: 10000 })

// Stock transfer, adjustments, returns
const trf = await rpc('save_stock_transfer', { transfer_date: '2026-03-01', item_id: rice, from_warehouse_id: wh, to_warehouse_id: wh2, qty_kg: 500, bags: 10 })
check('transfer moves stock', +(await one(`select qty_kg from v_stock_summary where item_id=$1 and warehouse_id=$2`, [rice, wh2])).qty_kg === 500)
await rpc('save_stock_adjustment', { adjustment_date: '2026-03-01', kind: 'LOSS', item_id: rice, warehouse_id: wh2, qty_kg: 20, reason: 'rat damage' })
await rpc('save_stock_adjustment', { adjustment_date: '2026-01-01', kind: 'OPENING', item_id: broken, warehouse_id: wh, qty_kg: 1000, unit_cost: 28 })
await expectError('cannot undo transfer after its stock was used', () => db.query(`select public.delete_stock_transfer($1)`, [trf]), 'already been used')
const sr = await rpc('save_sale_return', { return_date: '2026-03-02', sale_id: sale, customer_id: cus, warehouse_id: wh, item_id: rice, qty_kg: 100, amount: 5500 })
await rpc('save_purchase_return', { return_date: '2026-03-02', purchase_id: pur2, supplier_id: sup, warehouse_id: wh, item_id: paddy, qty_kg: 100, amount: 3500 })
await expectError('cannot edit sale with returns', () => rpc('save_sale', { id: sale, sale_date: '2026-02-20', customer_id: cus, warehouse_id: wh, lines: [{ item_id: rice, qty_kg: 1, rate: 1 }] }), 'returns')
await db.query(`select public.delete_sale_return($1)`, [sr])

// Business rules (0012)
const cus2 = (await one(`insert into parties (name, types) values ('Shop Two', '{CUSTOMER}') returning id`)).id
const sup2 = (await one(`insert into parties (name, types) values ('Mill Two', '{SUPPLIER}') returning id`)).id
await expectError('per-bag rate needs a bag count', () => rpc('save_sale', { sale_date: '2026-03-03', customer_id: cus2, warehouse_id: wh,
  lines: [{ item_id: rice, qty_kg: 100, rate: 2500, rate_unit: 'BAG' }] }), 'number of bags')
const s3head = { sale_date: '2026-03-03', customer_id: cus2, warehouse_id: wh, received_amount: 1000, received_account_id: bank, received_method: 'CHEQUE', received_cheque_no: 'C1' }
const s3 = await rpc('save_sale', { ...s3head, lines: [{ item_id: rice, qty_kg: 100, rate: 60 }, { item_id: rice, warehouse_id: wh2, qty_kg: 50, rate: 60 }] })
const s3wh = await q(`select distinct l.warehouse_id from lot_allocations a join lots l on l.id = a.lot_id where a.source_id = $1`, [s3])
check('one sale can ship from two godowns', s3wh.length === 2)
const linked = await one(`select * from money_txns where linked_sale_id = $1`, [s3])
check('money received at a sale becomes a linked cheque receipt', linked?.method === 'CHEQUE' && linked.cheque_status === 'PENDING' && +linked.amount === 1000)
const due = async (id) => +(await one(`select due_amount from v_sale_dues where id = $1`, [id])).due_amount
check('invoice due after money at sale', (await due(s3)) === 8000, await due(s3))
await db.query(`select public.set_cheque_status($1, 'BOUNCED')`, [linked.id])
check('bounced cheque at sale puts the full amount back on the invoice', (await due(s3)) === 9000
  && +(await one(`select balance from v_party_balances where id = $1`, [cus2])).balance === 9000)
await db.query(`select public.set_cheque_status($1, 'CLEARED')`, [linked.id])
check('cleared cheque at sale settles the invoice again', (await due(s3)) === 8000)
await expectError('linked receipt cannot be edited on its own', () => rpc('save_money_txn', { id: linked.id, txn_date: '2026-03-03', txn_type: 'RECEIPT', party_id: cus2, money_account_id: bank, amount: 5 }), 'change it there')
await expectError('linked receipt cannot be deleted on its own', () => db.query(`select public.delete_money_txn($1)`, [linked.id]), 'change it there')
await rpc('save_money_txn', { txn_date: '2026-03-04', txn_type: 'RECEIPT', party_id: cus2, money_account_id: cash, amount: 5000 })
await expectError('invoice cannot be lowered below what was received', () => rpc('save_sale', { id: s3, ...s3head, lines: [{ item_id: rice, qty_kg: 10, rate: 60 }] }), 'already been received')
await rpc('save_sale', { id: s3, ...s3head, lines: [{ item_id: rice, qty_kg: 100, rate: 61 }, { item_id: rice, warehouse_id: wh2, qty_kg: 50, rate: 61 }] })
check('editing a sale keeps exactly one linked receipt', +(await one(`select count(*) c from money_txns where linked_sale_id = $1`, [s3])).c === 1 && (await due(s3)) === 9150 - 6000, await due(s3))
const p3 = await rpc('save_purchase', { purchase_date: '2026-03-03', supplier_id: sup2, warehouse_id: wh, paid_amount: 500, paid_account_id: bank, paid_method: 'BANK',
  lines: [{ item_id: paddy, gross_kg: 100, rate: 30 }] })
check('money paid at a purchase becomes a linked payment', +(await one(`select count(*) c from money_txns where linked_purchase_id = $1 and txn_type = 'PAYMENT'`, [p3])).c === 1
  && +(await one(`select due_amount from v_purchase_dues where id = $1`, [p3])).due_amount === 2500)
await expectError('per-bag purchase rate needs a bag count', () => rpc('save_purchase', { purchase_date: '2026-03-03', supplier_id: sup2, warehouse_id: wh,
  lines: [{ item_id: paddy, gross_kg: 100, rate: 2000, rate_unit: 'BAG' }] }), 'number of bags')
await rpc('save_money_txn', { txn_date: '2026-03-05', txn_type: 'LOAN_REPAY', party_id: lender, money_account_id: bank, amount: 6000, interest_amount: 1000 })
check('loan repayment splits principal and interest', +(await one(`select balance from v_party_balances where id = $1`, [lender])).balance === -85000
  && +(await one(`select balance from v_account_balances where subtype = 'INTEREST_EXPENSE'`)).balance === 1000)
await expectError('interest cannot exceed the amount', () => rpc('save_money_txn', { txn_date: '2026-03-05', txn_type: 'LOAN_REPAY', party_id: lender, money_account_id: bank, amount: 100, interest_amount: 200 }), 'Interest')
const ageing = await q(`select * from report_ageing('2026-12-31')`)
check('ageing buckets add up to each party balance', ageing.length > 0 && ageing.every((r) => Math.abs(+r.b0 + +r.b30 + +r.b60 + +r.b90 - Math.abs(+r.balance)) < 0.01),
  JSON.stringify(ageing.map((r) => [r.name, r.balance, r.b0, r.b30, r.b60, r.b90])))

// Integrity checks
const unbalanced = await q(`select entry_id from journal_lines group by entry_id having sum(debit) <> sum(credit)`)
check('every journal entry balances', unbalanced.length === 0)
const tb = await one(`select sum(debit) d, sum(credit) c from report_trial_balance('2026-12-31')`)
check('trial balance totals match', +tb.d === +tb.c, `${tb.d} = ${tb.c}`)
const lotsSum = await one(`select round(sum(remaining_kg),3) kg, round(sum(remaining_kg*unit_cost),2) v from lots`)
const movSum = await one(`select round(sum(qty_kg),3) kg from stock_movements`)
check('stock on hand equals sum of movements', +lotsSum.kg === +movSum.kg, `${lotsSum.kg} vs ${movSum.kg}`)
const inv = +(await one(`select balance from v_account_balances where subtype='INVENTORY'`)).balance
check('inventory account equals stock value', Math.abs(inv - lotsSum.v) < 0.05, `${inv} vs ${lotsSum.v}`)
const bs = await q(`select section, sum(amount) a from report_balance_sheet('2026-12-31') group by section`)
const bsm = Object.fromEntries(bs.map((r) => [r.section, +r.a]))
check('balance sheet balances', Math.abs(bsm.ASSET - (bsm.LIABILITY + bsm.EQUITY)) < 0.01, JSON.stringify(bsm))
const sup_bal = +(await one(`select balance from v_party_balances where id=$1`, [sup])).balance
// -5000 opening -222000 bill +100000 paid -50000 (pur2) +50000 cheque +3500 return
check('supplier balance', sup_bal === -123500, sup_bal)
const dues = await one(`select sum(due_amount) d from v_sale_dues where customer_id=$1`, [cus])
const cusBal = +(await one(`select balance from v_party_balances where id=$1`, [cus])).balance
check('customer dues match ledger balance', Math.abs(+dues.d - cusBal) < 0.01, `${dues.d} vs ${cusBal}`)
const ledger = await q(`select * from report_ledger($1, null, '2026-02-01', '2026-12-31')`, [cash])
const cashBal = +(await one(`select balance from v_account_balances where id=$1`, [cash])).balance
check('cash book running balance ends at account balance', +ledger.at(-1).balance === cashBal, `${ledger.at(-1).balance} vs ${cashBal}`)
const pl = await q(`select * from report_profit_loss('2026-01-01', '2026-12-31')`)
console.log('     P&L', pl.map((r) => `${r.name}: ${r.amount}`).join(' | '))
const lp = await q(`select lot_no, item_name, sold_kg, revenue, cost_of_sold, profit, milled_kg, remaining_kg from v_lot_profit order by lot_no`)
console.log('     lots', JSON.stringify(lp))
const dash = await one(`select dashboard_stats('2026-02-01', '2026-03-31') d`)
console.log('     dashboard', JSON.stringify(dash.d))
const cs = await q(`select * from report_cash_summary('2026-02-01', '2026-02-28')`)
check('cash summary closing = opening + in - out', cs.every((r) => Math.abs(+r.opening + +r.money_in - +r.money_out - +r.closing) < 0.01))

// Security: run as the authenticated role
await db.exec(`set role authenticated`)
await expectError('app cannot call internal post_journal', () => db.query(`select public.post_journal(current_date, 'X', null, null, '[]'::jsonb)`), 'permission denied')
await expectError('documents cannot be written directly', () => db.query(`insert into public.money_txns (txn_no, txn_date, txn_type, money_account_id, amount) values ('x', current_date, 'EXPENSE', $1, 1)`, [cash]), 'row-level security')
check('super admin can read journal', (await q(`select count(*) c from journal_lines`))[0].c > 0)
const as = async (id) => db.exec(`set request.jwt.claim.sub = '${id}'`)
const sa = async (sql, params) => { await as(admin); return q(sql, params) }

// pending sign-up sees nothing
await as(viewer)
check('pending user sees no data', +(await q(`select count(*) c from sales`))[0].c === 0 && +(await q(`select count(*) c from parties`))[0].c === 0)
check('pending user can see their own pending profile', (await q(`select status from profiles where id = $1`, [viewer]))[0]?.status === 'PENDING')
await expectError('pending user cannot approve themselves', async () => {
  const r = await db.query(`update profiles set status = 'ACTIVE' where id = $1`, [viewer])
  if (r.affectedRows === 0) throw new Error('row-level security: no rows updated')
}, 'row-level security')
await expectError('pending user cannot save anything', () => rpc('save_sale', { sale_date: '2026-03-05', customer_id: cus, warehouse_id: wh, lines: [{ item_id: rice, qty_kg: 1, rate: 1 }] }), 'permission')

// super admin approves as viewer
await sa(`update profiles set status = 'ACTIVE', role = 'VIEWER' where id = $1`, [viewer])
check('approval records who approved', (await q(`select approved_by from profiles where id = $1`, [viewer]))[0].approved_by === admin)
await as(viewer)
check('approved viewer can read', +(await q(`select count(*) c from sales`))[0].c > 0)
check('viewer can read the books', +(await q(`select count(*) c from journal_lines`))[0].c > 0)
await expectError('viewer cannot save a sale', () => rpc('save_sale', { sale_date: '2026-03-05', customer_id: cus, warehouse_id: wh, lines: [{ item_id: rice, qty_kg: 1, rate: 1 }] }), 'permission')
await expectError('viewer cannot add a party', () => db.query(`insert into parties (name) values ('x')`), 'row-level security')
await expectError('viewer cannot change roles', async () => {
  const r = await db.query(`update profiles set role = 'ADMIN' where id = $1`, [viewer])
  if (r.affectedRows === 0) throw new Error('row-level security: no rows updated')
}, 'row-level security')

// department roles
const tryRole = async (role) => {
  await sa(`update profiles set role = $2 where id = $1`, [viewer, role]); await as(viewer)
  const ok = async (fn) => { try { await fn(); return true } catch { return false } }
  return {
    purchase: await ok(() => rpc('save_purchase', { purchase_date: '2026-03-06', supplier_id: sup2, warehouse_id: wh, lines: [{ item_id: paddy, gross_kg: 10, rate: 30 }] })),
    sale: await ok(() => rpc('save_sale', { sale_date: '2026-03-06', customer_id: cus2, warehouse_id: wh, lines: [{ item_id: broken, qty_kg: 1, rate: 30 }] })),
    production: await ok(() => rpc('save_production_batch', { start_date: '2026-03-06', input_warehouse_id: wh, output_warehouse_id: wh, inputs: [{ item_id: paddy, qty_kg: 10 }] })),
    stock: await ok(() => rpc('save_stock_adjustment', { adjustment_date: '2026-03-06', kind: 'GAIN', item_id: bran, warehouse_id: wh, qty_kg: 1, unit_cost: 1 })),
    money: await ok(() => rpc('save_money_txn', { txn_date: '2026-03-06', txn_type: 'EXPENSE', money_account_id: cash, counter_account_id: salary, amount: 1 })),
    books: +(await q(`select count(*) c from journal_lines`))[0].c > 0,
    party: await ok(() => q(`insert into parties (name, types) values ('Role test ' || $1, '{CUSTOMER}')`, [role])),
  }
}
const want = {
  PURCHASER: { purchase: true, sale: false, production: false, stock: false, money: false, books: false, party: true },
  SALES: { purchase: false, sale: true, production: false, stock: false, money: false, books: false, party: true },
  PRODUCTION: { purchase: false, sale: false, production: true, stock: true, money: false, books: false, party: false },
  ACCOUNTANT: { purchase: true, sale: true, production: true, stock: true, money: true, books: true, party: true },
  OPERATOR: { purchase: true, sale: true, production: true, stock: true, money: false, books: false, party: true },
}
for (const [role, w] of Object.entries(want)) {
  const got = await tryRole(role)
  check(`${role} can do exactly its job`, JSON.stringify(got) === JSON.stringify(w), JSON.stringify(got))
}
await as(viewer)
await expectError('only the super admin manages the team', () => q(`select public.invite_member('x@x.com', 'X', 'SALES')`), 'permission')

// invitations
await as(admin)
check('invite for a new email', (await one(`select public.invite_member('Buyer@Mill.com', 'Buyer One', 'PURCHASER') r`)).r === 'INVITED')
await db.exec(`reset role`)
const buyer = '33333333-3333-3333-3333-333333333333'
await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'buyer@mill.com', '{}')`, [buyer])
const bp = await one(`select role, status, full_name, approved_by from profiles where id = $1`, [buyer])
check('invited person is active with the invited role on sign-up', bp.role === 'PURCHASER' && bp.status === 'ACTIVE' && bp.full_name === 'Buyer One' && bp.approved_by === admin, JSON.stringify(bp))
const late = '44444444-4444-4444-4444-444444444444'
await q(`insert into auth.users (id, email) values ($1, 'late@mill.com')`, [late])
await db.exec(`set role authenticated`); await as(admin)
check('adding a member who already signed up approves them', (await one(`select public.invite_member('late@mill.com', 'Late', 'SALES') r`)).r === 'APPROVED'
  && (await one(`select role, status from profiles where id = $1`, [late])).status === 'ACTIVE')
await expectError('nobody can be invited as super admin', () => q(`select public.invite_member('z@z.com', 'Z', 'SUPER_ADMIN')`), 'Choose a role')

// there is always a super admin
await expectError('the last super admin cannot step down', () => q(`update profiles set role = 'ADMIN' where id = $1`, [admin]), 'always be one active super admin')
await expectError('the last super admin cannot be blocked', () => q(`update profiles set status = 'BLOCKED' where id = $1`, [admin]), 'always be one active super admin')
await q(`update profiles set status = 'BLOCKED' where id = $1`, [late])
await as(late)
check('blocked user sees nothing', +(await q(`select count(*) c from sales`))[0].c === 0)
await db.exec(`reset role`); await as(admin)

const audit = +(await one(`select count(*) c from audit_log`)).c
check('audit log records changes', audit > 10, audit)

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
