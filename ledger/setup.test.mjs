// Runs setup.sql in PGlite with a stubbed Supabase auth schema, then checks who can reach the data.
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import fs from 'node:fs'

const db = new PGlite()
const MEMBER = '00000000-0000-0000-0000-000000000001'
const STRANGER = '00000000-0000-0000-0000-000000000002'
const UNCONFIRMED = '00000000-0000-0000-0000-000000000003'

await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values
  ('${MEMBER}', 'Owner@Example.com', now()),
  ('${STRANGER}', 'stranger@example.com', now()),
  ('${UNCONFIRMED}', 'pending@example.com', null);
`)
const setup = fs.readFileSync(new URL('./setup.sql', import.meta.url), 'utf8')
await db.exec(setup)
await db.exec(setup) // must be safe to run twice
await db.exec(`insert into public.ledger_members values ('owner@example.com'), ('pending@example.com');
insert into public.ledger_sales (id, month, product, party, kg, rate, cost) values ('s1', '2026-09', 'Katari', 'Test Buyer', 1000, 70, 65);`)

const as = async (role, uid, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try { return await fn() } finally { await db.exec(`reset role;`) }
}
const count = async (t) => (await db.query(`select count(*)::int as n from public.${t}`)).rows[0].n
const fails = async (sql) => { await assert.rejects(db.exec(sql)) }
const insert = `insert into public.ledger_sales (month, product, party, kg, rate, cost) values ('2026-10', 'Katari', 'Test Buyer', 10, 70, 65)`

await as('authenticated', MEMBER, async () => {
  assert.equal(await count('ledger_sales'), 1)
  assert.equal(await count('ledger_settings'), 1)
  await db.exec(insert)
  assert.equal(await count('ledger_sales'), 2)
  await db.exec(`update public.ledger_settings set overhead = 200000`)
  await db.exec(`delete from public.ledger_sales where month = '2026-10'`)
  await fails(`select * from public.ledger_members`)
  await fails(`insert into public.ledger_sales (month, date, product, party, kg, rate, cost) values ('2026-09', '2027-09-29', 'K', 'S', 10, 70, 65)`)
  await fails(`insert into public.ledger_sales (month, product, party, kg, rate, cost) values ('2026-09', 'K', 'S', 0, 70, 65)`)
  await fails(`insert into public.ledger_sales (month, product, party, kg, rate, cost) values ('2026-09', ' ', 'S', 10, 70, 65)`)
})
for (const uid of [STRANGER, UNCONFIRMED]) {
  await as('authenticated', uid, async () => {
    assert.equal(await count('ledger_sales'), 0)
    assert.equal(await count('ledger_settings'), 0)
    await fails(insert)
    await db.exec(`update public.ledger_sales set kg = 1; delete from public.ledger_sales; update public.ledger_settings set overhead = 1;`)
  })
}
await as('anon', '', async () => {
  await fails(`select * from public.ledger_sales`)
  await fails(`select public.is_ledger_member()`)
})
const row = (await db.query(`select s.kg::int as kg, (select overhead::int from public.ledger_settings) as overhead from public.ledger_sales s`)).rows
assert.deepEqual(row, [{ kg: 1000, overhead: 200000 }], 'outsiders must not change data')
console.log('setup.sql: all access checks passed')
