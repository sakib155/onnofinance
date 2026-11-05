// Checks the rice mix price sums. Run: npm run test:mix
import assert from 'node:assert/strict'
import { mixPrice } from './mix.ts'

// 150 kg at 3000 a bag and 50 kg at 3400 a bag: 12,400 for 200 kg
assert.deepEqual(mixPrice([{ kg: 150, rate: 3000, sorting: 0 }, { kg: 50, rate: 3400, sorting: 0 }]), { kg: 200, bags: 4, riceCost: 12400, sorting: 0, cost: 12400, perBag: 3100, perKg: 62 })
// Sorting only on the first rice: 100 a bag on its 3 bags, shared across the whole mix
assert.deepEqual(mixPrice([{ kg: 150, rate: 3000, sorting: 100 }, { kg: 50, rate: 3400, sorting: 0 }]), { kg: 200, bags: 4, riceCost: 12400, sorting: 300, cost: 12700, perBag: 3175, perKg: 63.5 })
// Weights that are not whole bags
assert.equal(mixPrice([{ kg: 75, rate: 3000, sorting: 0 }, { kg: 25, rate: 3400, sorting: 0 }]).perBag, 3100)
// A half-filled row does not change the price, even with sorting on it
assert.equal(mixPrice([{ kg: 500, rate: 2000, sorting: 0 }, { kg: 500, rate: 0, sorting: 500 }, { kg: 0, rate: 9000, sorting: 500 }]).perBag, 2000)
assert.equal(mixPrice([{ kg: 50, rate: 2000, sorting: -50 }]).perBag, 2000)
assert.deepEqual(mixPrice([]), { kg: 0, bags: 0, riceCost: 0, sorting: 0, cost: 0, perBag: 0, perKg: 0 })
console.log('mix.check ok')
