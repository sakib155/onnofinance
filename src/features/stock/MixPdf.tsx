import { FileDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DocPage, DocRow, td, th } from '@/components/doc/Document'
import { PdfButton } from '@/components/doc/PdfButton'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { date, money, qty, today } from '@/lib/format'
import { mixPrice, rowCost, type MixRow } from './mix'

// Previews a mix on an A4 page and downloads it. The page exists only while open, so it never prints with the screen behind it
export function MixPdfButton({ rows, orderNo, day = today(), disabled }: {
  rows: (MixRow & { name: string })[]
  orderNo?: string
  day?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filled = rows.filter((r) => r.kg > 0 && r.rate > 0)
  const mix = mixPrice(filled)
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        <FileDown className="size-4" />
        PDF
      </Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t('stock.mix.title')} size="xl">
          <div className="mb-3 flex justify-end">
            <PdfButton target={ref} variant="primary" filename={`mix-${orderNo ?? day}.pdf`} />
          </div>
          <div className="max-h-[65vh] overflow-auto rounded-lg bg-slate-100 p-4" ref={ref}>
            <DocPage
              title={t('stock.mix.title')}
              meta={
                <>
                  {orderNo && <div>{t('orders.orderNo')}: <b>{orderNo}</b></div>}
                  <div>{t('common.date')}: {date(day)}</div>
                </>
              }
            >
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={th}>#</th>
                    <th className={th}>{t('stock.mix.rice')}</th>
                    <th className={`${th} text-right`}>{t('stock.mix.weight')}</th>
                    <th className={`${th} text-right`}>{t('stock.mix.share')}</th>
                    <th className={`${th} text-right`}>{t('stock.mix.rate')}</th>
                    <th className={`${th} text-right`}>{t('stock.mix.sorting')}</th>
                    <th className={`${th} text-right`}>{t('stock.mix.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filled.map((r, i) => (
                    <tr key={i}>
                      <td className={td}>{i + 1}</td>
                      <td className={`${td} font-medium`}>{r.name || t('stock.mix.riceN', { n: i + 1 })}</td>
                      <td className={`${td} text-right`}>{qty(r.kg)}</td>
                      <td className={`${td} text-right`}>{qty((r.kg / mix.kg) * 100, 1)}%</td>
                      <td className={`${td} text-right`}>{money(r.rate)}</td>
                      <td className={`${td} text-right`}>{money(r.sorting)}</td>
                      <td className={`${td} text-right`}>{money(rowCost(r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 ml-auto w-80">
                <DocRow label={t('stock.mix.total')} value={`${qty(mix.kg)} ${t('unit.kg')} (${qty(mix.bags)} ${t('unit.bags')})`} />
                <DocRow label={t('stock.mix.rice')} value={money(mix.riceCost)} />
                <DocRow label={t('stock.mix.sortingCost')} value={money(mix.sorting)} />
                <DocRow label={t('stock.mix.totalCost')} value={money(mix.cost)} />
                <DocRow strong label={t('stock.mix.perBag')} value={money(mix.perBag)} />
                <DocRow strong label={t('stock.mix.perKg')} value={money(mix.perKg)} />
              </div>
            </DocPage>
          </div>
        </Modal>
      )}
    </>
  )
}
