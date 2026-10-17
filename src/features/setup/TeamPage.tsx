import { Check, Mail, Trash2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Card, ErrorBox, PageHeader } from '@/components/ui/layout'
import { Modal } from '@/components/ui/modal'
import { Table } from '@/components/ui/table'
import { errorMessage, useToast } from '@/components/ui/toast'
import { rpc, unwrap, useData, useSave } from '@/lib/data'
import { date } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { ROLES, type MemberStatus, type Profile, type Role } from '@/lib/types'

type Invite = { id: string; email: string; full_name: string | null; role: Role; created_at: string; used_at: string | null }

// Roles the super admin hands out; SUPER_ADMIN itself is only given to an existing member
const ASSIGNABLE = ROLES.filter((r) => r !== 'SUPER_ADMIN' && r !== 'OPERATOR')

function RoleSelect({ value, onChange, allowSuper, disabled }: { value: Role; onChange: (r: Role) => void; allowSuper?: boolean; disabled?: boolean }) {
  const { t } = useTranslation()
  const options = [...(allowSuper ? ['SUPER_ADMIN' as Role] : []), ...ASSIGNABLE, ...(value === 'OPERATOR' ? ['OPERATOR' as Role] : [])]
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Role)} className="w-44" disabled={disabled}>
      {options.map((r) => (
        <option key={r} value={r}>
          {t(`role.${r}`)}
        </option>
      ))}
    </Select>
  )
}

function AddMember({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [v, setV] = useState({ full_name: '', email: '', role: 'PURCHASER' as Role })
  const save = useSave(() => rpc<string>('invite_member', { p_email: v.email, p_full_name: v.full_name, p_role: v.role }))
  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.addMember')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: (r) => {
                  toast(r === 'APPROVED' ? t('team.approvedNow', { email: v.email }) : t('team.invited', { email: v.email }))
                  onClose()
                },
              })
            }
          >
            {t('team.add')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-500">{t('team.addHelp')}</p>
      <div className="grid gap-3">
        <Field label={t('auth.fullName')}>
          <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} autoFocus />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label={t('team.role')} hint={t(`team.roleHelp.${v.role}`)}>
          <RoleSelect value={v.role} onChange={(role) => setV({ ...v, role })} />
        </Field>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

export function TeamPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { profile: me } = useAuth()
  const [adding, setAdding] = useState(false)
  // the role picked for each pending sign-up before approving
  const [pick, setPick] = useState<Record<string, Role>>({})
  const { data: people, isLoading } = useData<Profile[]>(['team'], () => supabase.from('profiles').select('*').order('created_at'))
  const { data: invites } = useData<Invite[]>(['invites'], () => supabase.from('team_invites').select('*').is('used_at', null).order('created_at', { ascending: false }))

  const update = useSave(({ id, patch }: { id: string; patch: Partial<Profile> }) => unwrap(supabase.from('profiles').update(patch).eq('id', id)))
  const removeInvite = useSave((id: string) => unwrap(supabase.from('team_invites').delete().eq('id', id)))
  const change = (id: string, patch: Partial<Profile>, done?: string) =>
    update.mutate({ id, patch }, { onSuccess: () => toast(done ?? t('common.saved')), onError: (e) => toast(errorMessage(e), 'error') })

  const pending = (people ?? []).filter((p) => p.status === 'PENDING')
  const members = (people ?? []).filter((p) => p.status !== 'PENDING')

  return (
    <>
      <PageHeader
        title={t('nav.team')}
        subtitle={t('team.subtitle')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="size-4" />
            {t('team.addMember')}
          </Button>
        }
      />

      {pending.length > 0 && (
        <Card title={t('team.waiting', { count: pending.length })} padded={false} className="mb-4 ring-2 ring-amber-300">
          <Table
            rows={pending}
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
              { key: 'since', header: t('team.signedUp'), cell: (p) => date(p.created_at) },
              { key: 'role', header: t('team.giveRole'), cell: (p) => <RoleSelect value={pick[p.id] ?? 'VIEWER'} onChange={(r) => setPick({ ...pick, [p.id]: r })} /> },
              {
                key: 'act',
                header: '',
                align: 'right',
                cell: (p) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => change(p.id, { status: 'ACTIVE', role: pick[p.id] ?? 'VIEWER' }, t('team.approved', { name: p.full_name || p.email }))}>
                      <Check className="size-4" />
                      {t('team.approve')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => change(p.id, { status: 'BLOCKED' }, t('team.rejected'))}>
                      <X className="size-4" />
                      {t('team.reject')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Card title={t('team.members')} padded={false}>
        <Table
          loading={isLoading}
          rows={members}
          rowKey={(p) => p.id}
          rowClassName={(p) => (p.status === 'BLOCKED' ? 'opacity-60' : undefined)}
          columns={[
            {
              key: 'name',
              header: t('common.name'),
              cell: (p) => (
                <div>
                  <div className="font-medium">
                    {p.full_name || '—'} {p.id === me?.id && <span className="text-xs font-normal text-slate-500">({t('team.you')})</span>}
                  </div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                </div>
              ),
            },
            { key: 'since', header: t('team.joined'), cell: (p) => date(p.approved_at ?? p.created_at) },
            {
              key: 'role',
              header: t('team.role'),
              cell: (p) =>
                p.id === me?.id ? (
                  <Badge tone="green">{t(`role.${p.role}`)}</Badge>
                ) : (
                  <RoleSelect value={p.role} allowSuper onChange={(role) => change(p.id, { role })} />
                ),
            },
            {
              key: 'status',
              header: t('common.status'),
              cell: (p) =>
                p.id === me?.id ? (
                  <Badge tone="green">{t('team.status.ACTIVE')}</Badge>
                ) : (
                  <Select value={p.status} onChange={(e) => change(p.id, { status: e.target.value as MemberStatus })} className="w-32">
                    <option value="ACTIVE">{t('team.status.ACTIVE')}</option>
                    <option value="BLOCKED">{t('team.status.BLOCKED')}</option>
                  </Select>
                ),
            },
          ]}
        />
      </Card>

      {!!invites?.length && (
        <Card title={t('team.invitations')} padded={false} className="mt-4">
          <Table
            rows={invites}
            rowKey={(i) => i.id}
            columns={[
              {
                key: 'who',
                header: t('common.name'),
                cell: (i) => (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-slate-400" />
                    <div>
                      <div className="font-medium">{i.full_name || '—'}</div>
                      <div className="text-xs text-slate-500">{i.email}</div>
                    </div>
                  </div>
                ),
              },
              { key: 'role', header: t('team.role'), cell: (i) => <Badge>{t(`role.${i.role}`)}</Badge> },
              { key: 'when', header: t('team.invitedOn'), cell: (i) => date(i.created_at) },
              {
                key: 'del',
                header: '',
                align: 'right',
                cell: (i) => (
                  <Button size="sm" variant="ghost" onClick={() => removeInvite.mutate(i.id, { onSuccess: () => toast(t('team.inviteRemoved')) })} aria-label={t('common.remove')}>
                    <Trash2 className="size-4" />
                  </Button>
                ),
              },
            ]}
          />
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{t('team.inviteNote')}</p>
        </Card>
      )}

      <Card className="mt-4" title={t('team.rolesTitle')}>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {ROLES.filter((r) => r !== 'OPERATOR').map((r) => (
            <div key={r}>
              <dt className="font-medium text-slate-800">{t(`role.${r}`)}</dt>
              <dd className="text-slate-600">{t(`team.roleHelp.${r}`)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {adding && <AddMember onClose={() => setAdding(false)} />}
    </>
  )
}
