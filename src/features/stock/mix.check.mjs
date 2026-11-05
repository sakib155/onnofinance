// Checks the rice mix price sums. Run: npm run test:mix
import assert from 'node:assert/strict'
import { mixPrice } from './mix.ts'

// 3 bags at 3000 and 1 bag at 3400: 12,400 over 4 bags
assert.deepEqual(mixPrice([{ bags: 3, rate: 3000 }, { bags: 1, rate: 3400 }]), { bags: 4, kg: 200, cost: 12400, perBag: 3100, perKg: 62 })
// A half-filled row does not change the price
assert.equal(mixPrice([{ bags: 10, rate: 2000 }, { bags: 10, rate: 0 }, { bags: 0, rate: 9000 }]).perBag, 2000)
assert.deepEqual(mixPrice([]), { bags: 0, kg: 0, cost: 0, perBag: 0, perKg: 0 })
console.log('mix.check ok')
