import { Calculator, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '@/app/auth'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, Empty } from '@/components/ui/layout'
import { ConfirmModal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { mixPrice, rowCost, type MixRow } from '@/features/stock/mix'
import { MixPdfButton } from '@/features/stock/MixPdf'
import { rpc, useData, useSave } from '@/lib/data'
import { date, kg, money, num } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type OrderMix = { id: string; created_at: string; rows: (MixRow & { name: string })[] }

// Rice mix estimates saved from the mix calculator
export function OrderMixes({ orderId, orderNo, canAdd }: { orderId: string; orderNo: string; canAdd: boolean }) {
  const { t } = useTranslation()
  const can = useCan()
  const toast = useToast()
  const [removing, setRemoving] = useState<string | null>(null)
  const { data } = useData<OrderMix[]>(['order-mixes', orderId], () =>
    supabase.from('order_mixes').select('id, created_at, rows').eq('order_id', orderId).order('created_at', { ascending: false }) as never,
  )
  const del = useSave((id: string) => rpc('delete_order_mix', { p_id: id }))

  return (
    <Card
      className="no-print mb-4"
      title={t('stock.mix.onOrder')}
      actions={
        can('sale') &&
        canAdd && (
          <ButtonLink to={`/stock/mix?order=${orderId}`} variant="secondary" size="sm">
            <Calculator className="size-4" />
            {t('nav.mixCalculator')}
          </ButtonLink>
        )
      }
    >
      {!data?.length && <Empty>{t('stock.mix.noneOnOrder')}</Empty>}
      <div className="space-y-5">
        {data?.map((m) => {
          const mix = mixPrice(m.rows.map((r) => ({ kg: num(r.kg), rate: num(r.rate), sorting: num(r.sorting) })))
          return (
            <div key={m.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">
                    {t('stock.mix.perBag')}: {money(mix.perBag)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {money(mix.perKg)}/{t('unit.kg')} · {kg(mix.kg)} · {date(m.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MixPdfButton rows={m.rows.map((r) => ({ name: r.name, kg: num(r.kg), rate: num(r.rate), sorting: num(r.sorting) }))} orderNo={orderNo} day={m.created_at} />
                  {can('sale') && (
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(m.id)} aria-label={t('common.delete')} title={t('common.delete')}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <Table
                rows={m.rows}
                rowKey={(_, i) => String(i)}
                columns={[
                  { key: 'name', phone: 'title', header: t('stock.mix.rice'), cell: (r) => r.name || t('stock.mix.riceN', { n: m.rows.indexOf(r) + 1 }) },
                  { key: 'kg', header: t('stock.mix.weight'), align: 'right', cell: (r) => kg(r.kg) },
                  { key: 'rate', header: t('stock.mix.rate'), align: 'right', cell: (r) => money(r.rate) },
                  { key: 'sort', header: t('stock.mix.sorting'), align: 'right', cell: (r) => money(r.sorting) },
                  { key: 'amt', phone: 'value', header: t('stock.mix.amount'), align: 'right', cell: (r) => money(rowCost({ kg: num(r.kg), rate: num(r.rate), sorting: num(r.sorting) })) },
                ]}
              />
            </div>
          )
        })}
      </div>
      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('common.delete')}
        message={t('stock.mix.deleteConfirm')}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(removing!, {
            onSuccess: () => toast(t('common.deleted')),
            onError: (e) => toast(errorMessage(e), 'error'),
            onSettled: () => setRemoving(null),
          })
        }
      />
    </Card>
  )
}
