import { useTranslation } from 'react-i18next'
import { useAuth } from '@/app/auth'
import { Select } from '@/components/ui/form'
import { Badge, Card, PageHeader } from '@/components/ui/layout'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { unwrap, useData, useSave } from '@/lib/data'
import { date } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'

const ROLES: Role[] = ['ADMIN', 'ACCOUNTANT', 'OPERATOR', 'VIEWER']

export function TeamPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile: me } = useAuth()
  const { data, isLoading } = useData<Profile[]>(['team'], () => supabase.from('profiles').select('*').order('created_at'))
  const update = useSave(({ id, patch }: { id: string; patch: Partial<Profile> }) => unwrap(supabase.from('profiles').update(patch).eq('id', id)))
  const change = (id: string, patch: Partial<Profile>) =>
    update.mutate({ id, patch }, { onSuccess: () => toast(t('common.saved')), onError: (e) => toast(errorMessage(e), 'error') })

  return (
    <>
      <PageHeader title={t('nav.team')} subtitle={t('team.subtitle')} />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(p) => p.id}
          columns={[
            {
              key: 'name',
              header: t('common.name'),
              cell: (p) => (
                <div>
                  <div className="font-medium">{p.full_name || '—'}</div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                </div>
              ),
            },
            { key: 'since', header: t('team.joined'), cell: (p) => date(p.created_at) },
            {
              key: 'role',
              header: t('team.role'),
              cell: (p) =>
                p.id === me?.id ? (
                  <Badge tone="green">{t(`role.${p.role}`)}</Badge>
                ) : (
                  <Select value={p.role} onChange={(e) => change(p.id, { role: e.target.value as Role })} className="w-40">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </Select>
                ),
            },
            {
              key: 'active',
              header: t('common.status'),
              cell: (p) =>
                p.id === me?.id ? (
                  <Badge tone="green">{t('common.active')}</Badge>
                ) : (
                  <Select value={p.is_active ? '1' : '0'} onChange={(e) => change(p.id, { is_active: e.target.value === '1' })} className="w-32">
                    <option value="1">{t('common.active')}</option>
                    <option value="0">{t('team.blocked')}</option>
                  </Select>
                ),
            },
          ]}
        />
      </Card>
      <Card className="mt-4">
        <div className="space-y-1 text-sm text-slate-600">
          <p className="font-medium text-slate-800">{t('team.howToAdd')}</p>
          {ROLES.map((r) => (
            <p key={r}>
              <span className="font-medium">{t(`role.${r}`)}:</span> {t(`team.roleHelp.${r}`)}
            </p>
          ))}
        </div>
      </Card>
    </>
  )
}
