import assert from 'node:assert'
import { bagRateFromKg, clientFromHash, clientsOf, emptyForm, isClient, kgRateFromBag, missingOf, monthName, pct, roll, sortLines, taka, today, validate, type Sale } from './logic.ts'

const sale = (over: Partial<Sale>): Sale => ({ id: 'a', month: '2026-09', date: '2026-09-01', description: '', product: 'Katari', party: 'Test Buyer', kg: 1000, rate: 70, cost: 75, note: '', ...over })

assert.deepEqual(roll([sale({}), sale({ kg: 2000, rate: 80, cost: 75 })]), { kg: 3000, revenue: 230000, cogs: 225000, gp: 5000 })
assert.equal(taka(-5000), '−৳5,000')
assert.equal(pct(-0.0714), '−7.1%')
assert.equal(pct(NaN), '—')
assert.equal(monthName('2026-11'), 'November 2026')
assert.deepEqual(missingOf(sale({ date: null, product: 'Not named', party: 'Not named' })), ['No date', 'No product', 'No name'])
assert.deepEqual(['x', 'y'].map((id, i) => sale({ id, date: i ? null : '2026-09-02' })).sort(sortLines).map((s) => s.id), ['x', 'y'])
// Dhaka is UTC+6, so 20:00 UTC is already the next day there.
assert.equal(today(new Date('2026-11-01T20:00:00Z')), '2026-11-02')

const book = [sale({ id: 'a', party: 'Buyer One', date: '2026-09-01' }), sale({ id: 'b', party: 'buyer one ', date: null }), sale({ id: 'c', party: 'Buyer One', date: '2026-10-03', kg: 2000 }), sale({ id: 'd', party: 'Buyer Two', rate: 500 })]
const clients = clientsOf(book)
assert.deepEqual(clients.map((c) => [c.name, c.sales, c.kg, c.lastDate]), [['Buyer Two', 1, 1000, '2026-09-01'], ['Buyer One', 3, 4000, '2026-10-03']])
assert.equal(clients.reduce((a, c) => a + c.revenue, 0), roll(book).revenue)
assert.equal(clientsOf([sale({ date: null })])[0].lastDate, '')
assert.equal(book.filter((s) => isClient(s, 'BUYER ONE')).length, 3)
assert.equal(clientFromHash('#client=Buyer%20One'), 'Buyer One')
assert.equal(clientFromHash('#client=%E0%A4%A'), null)
assert.equal(clientFromHash(''), null)

assert.equal(kgRateFromBag(3700), 74)
assert.equal(roll([sale({ kg: 20000, rate: kgRateFromBag(3700), cost: 0 })]).revenue, 1480000)
for (const r of [73.51, 74.7, 44.4, 38.2, 192, 74.8]) assert.equal(kgRateFromBag(bagRateFromKg(r)), r)

const good = { ...emptyForm, date: '2026-11-01', product: 'Katari', party: 'Test Buyer', kg: '1000', rate: '70', cost: '0' }
assert.equal(validate(good, undefined, '2026-11-02'), '')
assert.match(validate({ ...good, date: '' }, undefined, '2026-11-02'), /date/)
assert.equal(validate({ ...good, date: '' }, '2026-10', '2026-11-02'), '')
assert.match(validate({ ...good, date: '2027-11-01' }, undefined, '2026-11-02'), /future/)
assert.match(validate({ ...good, product: '  ' }, undefined, '2026-11-02'), /product/)
assert.match(validate({ ...good, party: '' }, undefined, '2026-11-02'), /name/)
assert.match(validate({ ...good, kg: '0' }, undefined, '2026-11-02'), /Kg/)
assert.match(validate({ ...good, rate: '-1' }, undefined, '2026-11-02'), /rate/)
assert.match(validate({ ...good, cost: '' }, undefined, '2026-11-02'), /cost/)
console.log('logic: all checks passed')
