import { FileDown, Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/app/auth'
import { DateRange } from '@/components/common'
import { DocPage, SignatureFooter, td, th } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { errorMessage, useToast } from '@/components/ui/toast'
import { date, money, monthStart, num, today } from '@/lib/format'
import { openPdf } from '@/lib/pdf'
import { useLedger, type LedgerRow } from './Ledger'

// Page splitting by estimated height (px, measured on the rendered A4 page) so no page grows past A4.
// Usable height is A4 minus padding and the page-number line; the first page also carries the
// company header and the party block, the last page the totals, summary box and signatures.
const USABLE = 1123 - 80 - 60
const FIRST_PAGE_FIXED = 62 + 48 + 86 + 30 + 30 // header, title, party block, table head, opening row
const OTHER_PAGE_FIXED = 48 + 30 // title, table head
const LAST_PAGE_EXTRA = 30 + 131 + 130 // totals row, summary box, signature footer

export type StatementSubject = {
  title: string // e.g. "Party statement", "Cash book"
  name: string
  lines?: (string | null | undefined)[] // address, phone, account no...
}

function rowHeight(r: LedgerRow, isParty: boolean) {
  const lines = Math.max(1, Math.ceil((r.narration?.length ?? 0) / 55))
  return 13 + lines * 17 + (r.memo || (!isParty && r.party_name) ? 16 : 0)
}

function paginate(rows: LedgerRow[], isParty: boolean) {
  const pages: LedgerRow[][] = [[]]
  let used = FIRST_PAGE_FIXED
  for (const r of rows) {
    const h = rowHeight(r, isParty)
    if (used + h > USABLE && pages[pages.length - 1].length) {
      pages.push([])
      used = OTHER_PAGE_FIXED
    }
    pages[pages.length - 1].push(r)
    used += h
  }
  // The last page needs room for totals and signatures; move rows to a new page until they fit
  if (used + LAST_PAGE_EXTRA > USABLE) {
    const last = pages[pages.length - 1]
    const moved: LedgerRow[] = []
    while (last.length > 1 && used + LAST_PAGE_EXTRA > USABLE) {
      const r = last.pop()!
      used -= rowHeight(r, isParty)
      moved.unshift(r)
    }
    if (moved.length || used + LAST_PAGE_EXTRA > USABLE) pages.push(moved)
  }
  return pages
}

// For a party, a positive balance means they owe us; for a cash/bank account it is money held
function balanceWords(t: (k: string) => string, v: number, isParty: boolean) {
  if (!isParty) return ''
  if (Math.abs(v) < 0.005) return t('balance.settled')
  return v > 0 ? t('statement.theyOweUs') : t('statement.weOweThem')
}

export function StatementPdfButton(props: {
  subject: StatementSubject
  party?: string
  account?: string
  debitLabel: string
  creditLabel: string
  filename: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FileDown className="size-4" />
        {t('statement.button')}
      </Button>
      {open && <StatementModal {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function StatementModal({ subject, party, account, debitLabel, creditLabel, filename, onClose }: {
  subject: StatementSubject
  party?: string
  account?: string
  debitLabel: string
  creditLabel: string
  filename: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile } = useAuth()
  const ref = useRef<HTMLDivElement>(null)
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [printing, setPrinting] = useState(false)
  const { data, isLoading } = useLedger(account ?? null, party ?? null, from, to)
  const rows = data ?? []
  const opening = rows[0]?.row_no === 0 ? num(rows[0].balance) : 0
  const entries = rows.filter((r) => r.row_no !== 0)
  const closing = rows.length ? num(rows[rows.length - 1].balance) : 0
  const totalDr = entries.reduce((s, r) => s + num(r.debit), 0)
  const totalCr = entries.reduce((s, r) => s + num(r.credit), 0)
  const isParty = Boolean(party)
  const pages = paginate(entries, isParty)

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('statement.title', { name: subject.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="secondary"
            loading={printing}
            onClick={async () => {
              if (!ref.current) return
              setPrinting(true)
              try {
                await openPdf(ref.current)
              } catch (e) {
                toast(`${t('doc.pdfFailed')}: ${errorMessage(e)}`, 'error')
              } finally {
                setPrinting(false)
              }
            }}
          >
            {!printing && <Printer className="size-4" />}
            {t('statement.openToPrint')}
          </Button>
          <PdfButton target={ref} filename={filename.replace('.pdf', `_${from}_${to}.pdf`)} label={t('statement.download')} variant="primary" />
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRange
          from={from}
          to={to}
          onChange={(f, tt) => {
            setFrom(f)
            setTo(tt)
          }}
        />
        <button className="text-sm text-brand-700 hover:underline" onClick={() => setFrom('2000-01-01')}>
          {t('statement.fromStart')}
        </button>
        <span className="text-sm text-slate-500">{t('statement.pages', { count: pages.length, entries: entries.length })}</span>
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <div className="max-h-[65vh] space-y-4 overflow-auto rounded-lg bg-slate-100 p-4" ref={ref}>
          {pages.map((pageRows, pi) => {
            const last = pi === pages.length - 1
            return (
              <DocPage
                key={pi}
                compactHeader={pi > 0}
                title={subject.title}
                meta={
                  <>
                    <div>
                      {t('statement.period')}: <b>{date(from)} – {date(to)}</b>
                    </div>
                    <div>
                      {t('statement.printed')}: {date(today())}
                    </div>
                  </>
                }
                page={{ n: pi + 1, of: pages.length }}
                footer={
                  last ? (
                    <SignatureFooter
                      createdBy={profile?.full_name || profile?.email || ''}
                      createdAt={new Date().toISOString()}
                      signers={isParty ? [t('statement.confirmedByParty')] : []}
                    />
                  ) : undefined
                }
              >
                {pi === 0 && (
                  <div className="mb-4 flex items-start justify-between gap-4 rounded border border-slate-200 p-3">
                    <div>
                      <div className="text-base font-semibold">{subject.name}</div>
                      {subject.lines?.filter(Boolean).map((l) => (
                        <div key={l} className="text-xs text-slate-600">
                          {l}
                        </div>
                      ))}
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-slate-500">{t('statement.closingBalance')}</div>
                      <div className="text-lg font-bold tabular-nums">{money(Math.abs(closing))}</div>
                      <div className="font-medium">{balanceWords(t, closing, isParty)}</div>
                    </div>
                  </div>
                )}
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>
                      <th className={th}>{t('common.date')}</th>
                      <th className={th}>{t('ledger.details')}</th>
                      <th className={`${th} text-right`}>{debitLabel}</th>
                      <th className={`${th} text-right`}>{creditLabel}</th>
                      <th className={`${th} text-right`}>{t('common.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pi === 0 && (
                      <tr className="bg-slate-50 font-medium">
                        <td className={td}>{date(from)}</td>
                        <td className={td}>{t('ledger.opening')}</td>
                        <td className={td} />
                        <td className={td} />
                        <td className={`${td} text-right tabular-nums`}>{money(opening)}</td>
                      </tr>
                    )}
                    {pageRows.map((r) => (
                      <tr key={`${r.row_no}-${r.entry_id}`}>
                        <td className={`${td} whitespace-nowrap`}>{date(r.entry_date)}</td>
                        <td className={td}>
                          {r.narration}
                          {(r.memo || (!isParty && r.party_name)) && (
                            <div className="text-[10.5px] text-slate-500">{[r.memo, isParty ? null : r.party_name].filter(Boolean).join(' · ')}</div>
                          )}
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{r.debit ? money(r.debit) : ''}</td>
                        <td className={`${td} text-right tabular-nums`}>{r.credit ? money(r.credit) : ''}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(r.balance)}</td>
                      </tr>
                    ))}
                    {last && (
                      <tr className="bg-slate-50 font-semibold">
                        <td className={td} />
                        <td className={td}>{t('statement.totals')}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(totalDr)}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(totalCr)}</td>
                        <td className={`${td} text-right tabular-nums`}>{money(closing)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {last && (
                  <div className="mt-4 ml-auto w-80 space-y-1 rounded border border-slate-200 p-3 text-[12px]">
                    <div className="flex justify-between">
                      <span>{t('ledger.opening')}</span>
                      <span className="tabular-nums">{money(opening)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{debitLabel}</span>
                      <span className="tabular-nums">{money(totalDr)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{creditLabel}</span>
                      <span className="tabular-nums">{money(totalCr)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold">
                      <span>{t('statement.closingBalance')}</span>
                      <span className="tabular-nums">{money(Math.abs(closing))}</span>
                    </div>
                    {isParty && <div className="text-right font-medium">{balanceWords(t, closing, isParty)}</div>}
                  </div>
                )}
              </DocPage>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
