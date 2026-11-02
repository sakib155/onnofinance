export const NOT_NAMED = 'Not named'

export type Sale = {
  id: string
  month: string
  date: string | null
  description: string
  product: string
  party: string
  kg: number
  rate: number
  cost: number
  note: string
}

export type SaleForm = {
  date: string
  product: string
  party: string
  kg: string
  rate: string
  cost: string
  description: string
  note: string
}

// The form takes the price of a 50 kg bag; sales are stored and calculated per kg.
const BAG_KG = 50
export const kgRateFromBag = (bag: number) => bag / BAG_KG
export const bagRateFromKg = (perKg: number) => Number((perKg * BAG_KG).toFixed(4))

export const emptyForm: SaleForm = { date: '', product: '', party: '', kg: '', rate: '', cost: '', description: '', note: '' }

export const roll = (lines: Sale[]) => {
  const kg = lines.reduce((a, s) => a + s.kg, 0)
  const revenue = lines.reduce((a, s) => a + s.kg * s.rate, 0)
  const cogs = lines.reduce((a, s) => a + s.kg * s.cost, 0)
  return { kg, revenue, cogs, gp: revenue - cogs }
}

const clientKey = (name: string) => name.trim().toLowerCase()
export const isClient = (s: Sale, name: string) => clientKey(s.party) === clientKey(name)

// One entry per customer, biggest revenue first. Spelling differences in capital letters count as the same customer.
export function clientsOf(lines: Sale[]) {
  const groups = new Map<string, Sale[]>()
  for (const s of lines) groups.set(clientKey(s.party), [...(groups.get(clientKey(s.party)) ?? []), s])
  return [...groups.values()]
    .map((sales) => ({
      name: sales[0].party,
      sales: sales.length,
      lastDate: sales.reduce((a, s) => ((s.date ?? '') > a ? (s.date as string) : a), ''),
      ...roll(sales),
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export function clientFromHash(hash: string) {
  const m = hash.match(/^#client=(.+)$/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

export const missingOf = (s: Sale) =>
  [!s.date && 'No date', s.product === NOT_NAMED && 'No product', s.party === NOT_NAMED && 'No name'].filter((x): x is string => Boolean(x))

export const sortLines = (a: Sale, b: Sale) =>
  b.month.localeCompare(a.month) || (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id)

export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now)

// Returns the first problem, or '' when the form can be saved. existingMonth is set when editing a line that has no date.
export function validate(f: SaleForm, existingMonth: string | undefined, now = today()) {
  if (!f.date && !existingMonth) return 'Enter the date of the sale.'
  if (f.date && f.date > now) return 'That date is in the future. Check the year.'
  if (!f.product.trim()) return 'Enter the product.'
  if (!f.party.trim()) return 'Enter the customer or name.'
  if (!(Number(f.kg) > 0)) return 'Kg must be more than 0.'
  if (!(Number(f.rate) > 0)) return 'Sell rate must be more than 0.'
  if (f.cost === '' || !(Number(f.cost) >= 0)) return 'Enter the unit cost.'
  return ''
}

const neg = (v: number, s: string) => (v < 0 ? '−' : '') + s
export const taka = (v: number) => neg(v, '৳' + Math.abs(Math.round(v)).toLocaleString('en-US'))
export const kgs = (v: number) => Math.round(v).toLocaleString('en-US')
export const rate = (v: number) => '৳' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = (v: number) => (Number.isFinite(v) ? neg(v, (Math.abs(v) * 100).toFixed(1) + '%') : '—')
export const monthName = (m: string) => {
  const [y, n] = m.split('-').map(Number)
  return new Date(y, n - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}
