export const BAG_KG = 50

// Rate and sorting are per 50 kg bag, weight is in kg
export type MixRow = { kg: number; rate: number; sorting: number }

export const rowCost = (r: MixRow) => (r.kg * (r.rate + Math.max(r.sorting, 0))) / BAG_KG

// A row missing its weight or its rate is left out: counting it at 0 would pull the price down. Sorting can be blank: not all rice is sorted
export function mixPrice(rows: MixRow[]) {
  const filled = rows.filter((r) => r.kg > 0 && r.rate > 0)
  const kg = filled.reduce((s, r) => s + r.kg, 0)
  const riceCost = filled.reduce((s, r) => s + rowCost({ ...r, sorting: 0 }), 0)
  const cost = filled.reduce((s, r) => s + rowCost(r), 0)
  const perKg = kg ? cost / kg : 0
  return { kg, bags: kg / BAG_KG, riceCost, sorting: cost - riceCost, cost, perBag: perKg * BAG_KG, perKg }
}
