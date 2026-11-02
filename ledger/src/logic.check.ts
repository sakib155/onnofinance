import assert from 'node:assert'
import { emptyForm, missingOf, monthName, pct, roll, sortLines, taka, today, validate, type Sale } from './logic.ts'

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
