import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Account, Item, Party, Warehouse } from './types'

type Result<T> = { data: T | null; error: { message: string } | null }

export async function unwrap<T>(p: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

// Query wrapper: key + async loader
export function useData<T>(key: unknown[], load: () => PromiseLike<Result<T>>, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: key, queryFn: () => unwrap(load()), ...opts })
}

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  return unwrap<T>(supabase.rpc(fn, args) as unknown as PromiseLike<Result<T>>)
}

// Mutation that refreshes all data afterwards: documents touch stock, ledgers and reports at once.
// The refresh runs in the background so the screen can move on (e.g. leave a deleted record) right away.
export function useSave<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}

// Common lookups
export const useParties = (type?: string) =>
  useData<Party[]>(['parties', type ?? 'all'], () => {
    let q = supabase.from('v_party_balances').select('*').order('name')
    if (type) q = q.contains('types', [type])
    return q
  })

export const useItems = () => useData<Item[]>(['items'], () => supabase.from('items').select('*').order('category').order('code'))

export const useWarehouses = () => useData<Warehouse[]>(['warehouses'], () => supabase.from('warehouses').select('*').order('name'))

export const useAccounts = () =>
  useData<Account[]>(['accounts'], () => supabase.from('v_account_balances').select('*').order('code'))

// Payment method that matches the chosen cash/bank account (a cheque stays a cheque)
export function useMethodFor() {
  const { data } = useAccounts()
  return (accountId: string, current: string) =>
    current === 'CHEQUE' ? current : data?.find((a) => a.id === accountId)?.subtype === 'BANK' ? 'BANK' : 'CASH'
}

export function useMoneyAccounts() {
  const q = useAccounts()
  return { ...q, data: q.data?.filter((a) => (a.subtype === 'CASH' || a.subtype === 'BANK') && a.is_active) }
}
