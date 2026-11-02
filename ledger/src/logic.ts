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

export const emptyForm: SaleForm = { date: '', product: '', party: '', kg: '', rate: '', cost: '', description: '', note: '' }

export const roll = (lines: Sale[]) => {
  const kg = lines.reduce((a, s) => a + s.kg, 0)
  const revenue = lines.reduce((a, s) => a + s.kg * s.rate, 0)
  const cogs = lines.reduce((a, s) => a + s.kg * s.cost, 0)
  return { kg, revenue, cogs, gp: revenue - cogs }
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
