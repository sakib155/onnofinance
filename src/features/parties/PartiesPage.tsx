import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCan } from '@/app/auth'
import { Balance, nameOf } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge, Card, PageHeader } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { useParties } from '@/lib/data'
import { money, num } from '@/lib/format'
import { PARTY_TYPES, type Party } from '@/lib/types'
import { PartyForm } from './PartyForm'

export function PartiesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<'all' | 'receivable' | 'payable'>('all')
  const [editing, setEditing] = useState<Party | null | undefined>(undefined)
  const { data, isLoading } = useParties(type || undefined)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((p) => {
      if (q && !`${p.name} ${p.name_bn ?? ''} ${p.phone ?? ''} ${p.code ?? ''}`.toLowerCase().includes(q)) return false
      if (show === 'receivable' && num(p.balance) <= 0.005) return false
      if (show === 'payable' && num(p.balance) >= -0.005) return false
      return true
    })
  }, [data, search, show])

  const receivable = rows.reduce((s, p) => s + Math.max(num(p.balance), 0), 0)
  const payable = rows.reduce((s, p) => s + Math.max(-num(p.balance), 0), 0)

  return (
    <>
      <PageHeader
        title={t('nav.parties')}
        subtitle={t('parties.subtitle')}
        actions={
          can('parties') && (
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4" />
              {t('parties.new')}
            </Button>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
            <option value="">{t('parties.allTypes')}</option>
            {PARTY_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {t(`partyType.${pt}`)}
              </option>
            ))}
          </Select>
          <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="w-44">
            <option value="all">{t('parties.allBalances')}</option>
            <option value="receivable">{t('parties.theyOwe')}</option>
            <option value="payable">{t('parties.weOwe')}</option>
          </Select>
        </div>
        <Table
          loading={isLoading}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/parties/${p.id}`)}
          rowClassName={(p) => (p.is_active ? undefined : 'opacity-50')}
          columns={[
            {
              key: 'name',
              phone: 'title',
              header: t('common.name'),
              cell: (p) => (
                <div>
                  <div className="font-medium text-slate-900">{nameOf(p)}</div>
                  <div className="text-xs text-slate-500">{[p.phone, p.address].filter(Boolean).join(' · ')}</div>
                </div>
              ),
            },
            {
              key: 'types',
              phone: 'sub',
              header: t('parties.types'),
              cell: (p) => (
                <div className="flex flex-wrap gap-1">
                  {p.types.map((x) => (
                    <Badge key={x}>{t(`partyType.${x}`)}</Badge>
                  ))}
                </div>
              ),
            },
            {
              key: 'balance',
              phone: 'value',
              header: t('common.balance'),
              align: 'right',
              cell: (p) => <Balance value={p.balance} />,
              footer: (
                <div className="space-y-0.5 text-xs">
                  <div className="text-brand-800">
                    {t('parties.theyOwe')}: {money(receivable)}
                  </div>
                  <div className="text-red-600">
                    {t('parties.weOwe')}: {money(payable)}
                  </div>
                </div>
              ),
            },
            {
              key: 'edit',
              phone: 'hide',
              header: '',
              align: 'right',
              cell: (p) =>
                can('parties') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(p)
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      {editing !== undefined && <PartyForm open party={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
