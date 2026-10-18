import i18n from '@/i18n'

const locale = () => (i18n.language === 'bn' ? 'bn-BD' : 'en-IN')

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

// Taka with lakh/crore grouping: 12,34,567.00
export function money(v: unknown, opts: { decimals?: number; sign?: boolean } = {}) {
  const n = num(v)
  const d = opts.decimals ?? 2
  const s = new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(n))
  return (n < 0 ? '-' : opts.sign && n > 0 ? '+' : '') + s
}

export function qty(v: unknown, decimals = 2) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: decimals }).format(num(v))
}

export const kg = (v: unknown) => `${qty(v)} ${i18n.t('unit.kg')}`
export const bags = (v: unknown) => `${qty(v)} ${i18n.t('unit.bags')}`

export function date(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export function today() {
  const d = new Date()
  return iso(d)
}

export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Whole days from a date to today on this device (the server's clock is UTC)
export function ageDays(v: string) {
  return Math.max(0, Math.round((new Date(`${today()}T00:00:00`).getTime() - new Date(`${v}T00:00:00`).getTime()) / 86_400_000))
}

export function monthStart(d = new Date()) {
  return iso(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function yearStart(d = new Date()) {
  return iso(new Date(d.getFullYear(), 0, 1))
}

// Party balance in words: positive = they owe us
export function balanceLabel(v: unknown) {
  const n = num(v)
  if (Math.abs(n) < 0.005) return i18n.t('balance.settled')
  return n > 0 ? i18n.t('balance.receivable') : i18n.t('balance.payable')
}

// Date and time for a <input type="datetime-local">, on this device's clock: "2026-10-18T10:15"
export function localDateTime(d = new Date()) {
  return `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const toLocalInput = (v: string | null | undefined) => (v ? localDateTime(new Date(v)) : '')

// Back from the input to a timestamp the database stores with its time zone
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export function dateTime(v: string | null | undefined) {
  if (!v) return ''
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v))
}

// "3 h 40 min", "2 d 4 h"
export function duration(minutes: unknown) {
  const m = Math.max(0, Math.round(num(minutes)))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  const u = (k: string, n: number) => `${qty(n, 0)} ${i18n.t(`unit.${k}`)}`
  if (d) return h ? `${u('day', d)} ${u('hour', h)}` : u('day', d)
  if (h) return min ? `${u('hour', h)} ${u('minute', min)}` : u('hour', h)
  return u('minute', min)
}

export const minutesBetween = (from: string | null | undefined, to: Date | string = new Date()) =>
  from ? (new Date(to).getTime() - new Date(from).getTime()) / 60_000 : 0
