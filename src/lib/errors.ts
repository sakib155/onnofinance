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

// Messages raised by our own SQL functions (supabase/migrations) -> dberr.* keys.
// Capture groups become the named params, in order. Keep in step with the SQL text.
const DB_MESSAGES: [RegExp, string, string[]?][] = [
  [/^You do not have permission for this action$/, 'permission'],
  [/^Add at least one item$/, 'addItem'],
  [/^Line (\d+): choose an item$/, 'lineItem', ['line']],
  [/^Line (\d+): enter the number of bags for a per-bag rate$/, 'lineBags', ['line']],
  [/^Line (\d+): enter the ordered weight$/, 'lineOrderedWeight', ['line']],
  [/^Line (\d+): net weight must be greater than zero$/, 'lineNetWeight', ['line']],
  [/^Line (\d+): this item is already on the order; put the whole quantity on one line$/, 'lineDuplicate', ['line']],
  [/^Not enough stock of (.+) \(short by ([\d.]+) kg\)$/, 'notEnoughStock', ['item', 'kg']],
  [/^Quantity must be greater than zero$/, 'quantityPositive'],
  [/^Stock from this document has already been sold, milled or moved\. Reverse those first\.$/, 'stockUsed'],
  [/^Transferred stock has already been used\. Reverse that first\.$/, 'transferUsed'],
  [/^System account (.+) is missing$/, 'systemAccount', ['name']],
  [/^Journal not balanced for (.+) \(difference (.+)\)$/, 'journalUnbalanced', ['source', 'diff']],
  [/^Choose a role$/, 'chooseRole'],
  [/^Enter a valid email address$/, 'validEmail'],
  [/^There must always be one active super admin$/, 'lastSuperAdmin'],
  [/^Choose the account$/, 'chooseAccount'],
  [/^Choose the party$/, 'chooseParty'],
  [/^Choose the broker to pay commission to$/, 'chooseBroker'],
  [/^Choose the cash or bank account$/, 'chooseMoneyAccount'],
  [/^Choose the cash or bank account the money was received into$/, 'chooseReceivedInto'],
  [/^Choose the cash or bank account the payment was made from$/, 'choosePaidFrom'],
  [/^Choose the customer$/, 'chooseCustomer'],
  [/^Choose the section$/, 'chooseSection'],
  [/^Choose two different accounts for a transfer$/, 'transferSameAccount'],
  [/^Interest cannot be more than the amount$/, 'interestTooHigh'],
  [/^This was recorded with a sale or purchase — change it there$/, 'recordedWithTrade'],
  [/^This was recorded with (.+) — change it there$/, 'recordedWith', ['doc']],
  [/^This sale has returns\. Delete the returns first\.$/, 'saleHasReturns'],
  [/^The supplier bill \((.+)\) is less than what has already been paid or returned against it \((.+)\)$/, 'billBelowPaid', ['bill', 'paid']],
  [/^The invoice total \((.+)\) is less than what has already been received or returned against it \((.+)\)$/, 'invoiceBelowReceived', ['total', 'received']],
  [/^Enter the order date$/, 'orderDate'],
  [/^Order not found$/, 'orderNotFound'],
  [/^This order is cancelled; reopen it before editing$/, 'orderCancelledEdit'],
  [/^Invoices for this order are made out to another customer; the customer cannot be changed$/, 'orderCustomerLocked'],
  [/^Invoices have been made against this order; delete them first, or cancel\/close the order$/, 'orderHasInvoices'],
  [/^Goods have already been delivered on this order; close it instead of cancelling$/, 'orderDelivered'],
  [/^Order (.+) is for another customer$/, 'orderOtherCustomer', ['no']],
  [/^Order (.+) is (\w+); reopen it to deliver more$/, 'orderNotOpen', ['no', 'status']],
  [/^Unknown order status (.*)$/, 'orderUnknownStatus', ['status']],
  [/^Batch not found$/, 'batchNotFound'],
  [/^Batch (.+) is (\w+)\. Reopen it first\.$/, 'batchNotOpen', ['no', 'status']],
  [/^(.+) is not (paddy|unsorted rice)$/, 'batchWrongInput', ['item', 'kind']],
  [/^Add the paddy going into this batch$/, 'batchAddPaddy'],
  [/^Add the unsorted rice going into this batch$/, 'batchAddUnsorted'],
  [/^Add what came out of this batch$/, 'batchAddOutput'],
  [/^The dryer section gives unsorted rice and by-products only$/, 'batchDryerOutputs'],
  [/^The sorter section gives sorted rice and by-products only$/, 'batchSorterOutputs'],
  [/^Add the unsorted rice that came out$/, 'batchAddUnsortedOut'],
  [/^Add the sorted rice that came out$/, 'batchAddSortedOut'],
  [/^The by-products \((.+)\) are worth more than the whole batch cost \((.+)\)\. Check their current prices\.$/, 'byproductsTooDear', ['byproducts', 'total']],
]

// Words the SQL fills in itself (lower-cased statuses, input kinds) -> their translation
const DB_WORDS: Record<string, Record<string, string>> = {
  status: { open: 'dberr.status.open', closed: 'dberr.status.closed', cancelled: 'dberr.status.cancelled', running: 'dberr.status.running', completed: 'dberr.status.completed' },
  kind: { paddy: 'dberr.inputKind.paddy', 'unsorted rice': 'dberr.inputKind.unsorted' },
}

function dbMessage(message: string): string | null {
  const t = i18n.t.bind(i18n)
  for (const [re, key, names = []] of DB_MESSAGES) {
    const m = message.match(re)
    if (!m) continue
    const params: Record<string, string> = {}
    names.forEach((name, i) => {
      const value = m[i + 1]
      const word = DB_WORDS[name]?.[value]
      params[name] = word ? t(word) : value
    })
    return t(`dberr.${key}`, params)
  }
  return null
}

// Turns technical database messages into plain words, and our own SQL messages
// (e.g. "Not enough stock of …") into the user's language.
export function friendlyError(message: string): string {
  const t = i18n.t.bind(i18n)
  const own = dbMessage(message)
  if (own) return own
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
