// Checks that friendlyError() translates the messages raised by our SQL functions.
// Run: npm run test:errors
import { build } from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

// i18n/index.ts touches the browser on load
globalThis.localStorage = { getItem: () => 'bn', setItem: () => {} }
globalThis.document = { documentElement: {} }

const out = await build({
  stdin: { contents: "export { friendlyError } from '@/lib/errors'; export { default as i18n } from '@/i18n'", resolveDir: root, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@': join(root, 'src') },
  external: ['i18next', 'react-i18next', 'react'],
  logLevel: 'silent',
})
// data: URLs cannot resolve bare imports, so point them at node_modules
const code = out.outputFiles[0].text.replace(/from "(i18next|react-i18next|react)"/g, (_, p) =>
  `from ${JSON.stringify(import.meta.resolve(p, 'file://' + root + '/'))}`)
const { friendlyError, i18n } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

// Every literal message (no % placeholders) raised by the latest definition of each function must be translated
const funcs = new Map()
const dir = join(root, 'supabase/migrations')
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(dir, f), 'utf8')
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(.*?\$\$(.*?)\$\$/gis)) funcs.set(m[1], m[2])
}
const literals = new Set()
for (const body of funcs.values()) {
  for (const m of body.matchAll(/raise exception\s+'([^']*)'([^;]*);/gi)) {
    if (!m[1].includes('%')) literals.add(m[1])
    else if (m[1] === '%') for (const q of m[2].matchAll(/then '([^']*)'|else '([^']*)'/g)) literals.add(q[1] ?? q[2])
  }
}
assert.ok(literals.size > 30, `found only ${literals.size} SQL messages`)
const missed = [...literals].filter((msg) => friendlyError(msg) === msg)
assert.deepEqual(missed, [], 'SQL messages with no Bangla translation')

// Messages with values
const samples = {
  'Not enough stock of Broken Rice (short by 300.000 kg)': 'Broken Rice-এর যথেষ্ট মজুদ নেই (300.000 কেজি কম)',
  'Order SO-0012 is for another customer': 'অর্ডার SO-0012 অন্য ক্রেতার',
  'Order SO-0012 is closed; reopen it to deliver more': 'অর্ডার SO-0012 বন্ধ; আরও ডেলিভারি দিতে আবার চালু করুন',
  'Batch DB-0003 is completed. Reopen it first.': 'ব্যাচ DB-0003 শেষ হয়েছে। আগে আবার চালু করুন।',
  'Line 2: enter the number of bags for a per-bag rate': 'লাইন 2: বস্তা প্রতি দরের জন্য বস্তার সংখ্যা দিন',
  'Miniket Rice is not paddy': 'Miniket Rice ধান নয়',
  'This was recorded with SL-0044 — change it there': 'এটি SL-0044-এর সাথে লেখা হয়েছে — সেখানে গিয়ে বদলান',
  'This was recorded with a sale or purchase — change it there': 'এটি একটি বিক্রয় বা ক্রয়ের সাথে লেখা হয়েছে — সেখানে গিয়ে বদলান',
  'Choose the cash or bank account the money was received into': 'টাকা যে নগদ বা ব্যাংক হিসাবে জমা হয়েছে সেটি বাছুন',
  'Add at least one item': 'অন্তত একটি পণ্য যোগ করুন',
  'Some message we do not know': 'Some message we do not know',
}
for (const [msg, want] of Object.entries(samples)) {
  const got = friendlyError(msg)
  console.log(`${msg}\n  -> ${got}`)
  assert.equal(got.normalize('NFC'), want.normalize('NFC'))
}

// English stays as the SQL wrote it
await i18n.changeLanguage('en')
for (const msg of [...literals, ...Object.keys(samples)]) assert.equal(friendlyError(msg), msg)

console.log(`\nok: ${literals.size} SQL messages translated, ${Object.keys(samples).length} samples checked`)
