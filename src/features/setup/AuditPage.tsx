import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge, Card, PageHeader } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useData } from '@/lib/data'
import { supabase } from '@/lib/supabase'

type AuditRow = {
  id: number
  table_name: string
  row_id: string | null
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string | null
  created_at: string
  user: { full_name: string; email: string } | null
}

const PAGE = 50

// Fields that changed between old and new row, ignoring bookkeeping columns
function changes(r: AuditRow) {
  if (r.action !== 'UPDATE' || !r.old_data || !r.new_data) return ''
  return Object.keys(r.new_data)
    .filter((k) => !['updated_at', 'created_at'].includes(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k]))
    .join(', ')
}

const label = (r: AuditRow) => {
  const d = r.new_data ?? r.old_data ?? {}
  return String(d.name ?? d.purchase_no ?? d.sale_no ?? d.txn_no ?? d.batch_no ?? d.return_no ?? d.transfer_no ?? d.adjustment_no ?? d.email ?? '')
}

export function AuditPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const { data, isLoading } = useData<AuditRow[]>(['audit', page], () =>
    supabase
      .from('audit_log')
      .select('*, user:profiles!audit_log_user_id_fkey(full_name, email)')
      .order('id', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1) as never,
  )
  return (
    <>
      <PageHeader title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(r) => String(r.id)}
          columns={[
            { key: 'when', header: t('audit.when'), cell: (r) => new Date(r.created_at).toLocaleString(), className: 'whitespace-nowrap' },
            { key: 'who', header: t('audit.who'), cell: (r) => r.user?.full_name || r.user?.email || '—' },
            {
              key: 'what',
              header: t('audit.action'),
              cell: (r) => <Badge tone={r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'amber'}>{t(`audit.actions.${r.action}`)}</Badge>,
            },
            { key: 'table', header: t('audit.record'), cell: (r) => `${r.table_name} ${label(r)}` },
            { key: 'chg', header: t('audit.changed'), cell: (r) => <span className="text-xs text-slate-500">{changes(r)}</span> },
          ]}
        />
        <div className="flex justify-between border-t border-slate-100 p-3">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('common.previous')}
          </Button>
          <Button variant="secondary" size="sm" disabled={(data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>
            {t('common.next')}
          </Button>
        </div>
      </Card>
    </>
  )
}
