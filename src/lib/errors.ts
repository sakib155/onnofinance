import i18n from '@/i18n'

// Database column -> the field name the user sees on the form
const FIELDS: Record<string, string> = {
  supplier_id: 'trading.supplier',
  customer_id: 'trading.customer',
  broker_id: 'trading.broker',
  warehouse_id: 'stock.warehouse',
  input_warehouse_id: 'stock.warehouse',
  output_warehouse_id: 'stock.warehouse',
  money_account_id: 'errors.moneyAccount',
  counter_account_id: 'common.account',
  account_id: 'common.account',
  party_id: 'common.party',
  item_id: 'common.item',
  name: 'common.name',
  year: 'common.date',
}

// Turns technical database messages into plain words. Messages written for users
// (raised by our own functions, e.g. "Not enough stock of …") pass through unchanged.
export function friendlyError(message: string): string {
  const t = i18n.t.bind(i18n)
  const col = message.match(/null value in column "(\w+)"/)?.[1]
  if (col) {
    const key = FIELDS[col] ?? (col.endsWith('_date') ? 'common.date' : null)
    return key ? t('errors.required', { field: t(key) }) : t('errors.missing')
  }
  if (/invalid input syntax for type (uuid|date|numeric|integer)/.test(message)) return t('errors.missing')
  if (/violates check constraint "\w*(qty_kg|_kg)\w*"/.test(message)) return t('errors.positiveWeight')
  if (/violates check constraint "\w*amount\w*"/.test(message)) return t('errors.positiveAmount')
  if (/violates check constraint/.test(message)) return t('errors.invalid')
  if (/duplicate key value violates unique constraint/.test(message)) return t('errors.duplicate')
  if (/violates foreign key constraint/.test(message)) return t('errors.inUse')
  if (/JWT expired|invalid JWT|refresh token/i.test(message)) return t('errors.session')
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return t('errors.network')
  return message
}
