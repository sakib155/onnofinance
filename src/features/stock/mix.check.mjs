// Checks the rice mix price sums. Run: npm run test:mix
import assert from 'node:assert/strict'
import { mixPrice } from './mix.ts'

// 3 bags at 3000 and 1 bag at 3400: 12,400 over 4 bags
assert.deepEqual(mixPrice([{ bags: 3, rate: 3000, sorting: 0 }, { bags: 1, rate: 3400, sorting: 0 }]), { bags: 4, kg: 200, riceCost: 12400, sorting: 0, cost: 12400, perBag: 3100, perKg: 62 })
// Sorting only on the first rice: 100 on its 3 bags, shared across the 4 bags of the mix
assert.deepEqual(mixPrice([{ bags: 3, rate: 3000, sorting: 100 }, { bags: 1, rate: 3400, sorting: 0 }]), { bags: 4, kg: 200, riceCost: 12400, sorting: 300, cost: 12700, perBag: 3175, perKg: 63.5 })
// A half-filled row does not change the price, even with sorting on it
assert.equal(mixPrice([{ bags: 10, rate: 2000, sorting: 0 }, { bags: 10, rate: 0, sorting: 500 }, { bags: 0, rate: 9000, sorting: 500 }]).perBag, 2000)
assert.equal(mixPrice([{ bags: 1, rate: 2000, sorting: -50 }]).perBag, 2000)
assert.deepEqual(mixPrice([]), { bags: 0, kg: 0, riceCost: 0, sorting: 0, cost: 0, perBag: 0, perKg: 0 })
console.log('mix.check ok')
