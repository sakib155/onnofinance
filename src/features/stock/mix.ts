export const BAG_KG = 50

export type MixRow = { bags: number; rate: number }

// A row missing its bags or its rate is left out: counting it at 0 would pull the price down
export function mixPrice(rows: MixRow[]) {
  const filled = rows.filter((r) => r.bags > 0 && r.rate > 0)
  const bags = filled.reduce((s, r) => s + r.bags, 0)
  const cost = filled.reduce((s, r) => s + r.bags * r.rate, 0)
  const perBag = bags ? cost / bags : 0
  return { bags, kg: bags * BAG_KG, cost, perBag, perKg: perBag / BAG_KG }
}
