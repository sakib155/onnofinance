import { useData } from '@/lib/data'
import { supabase } from '@/lib/supabase'

export type Company = {
  id: number
  name: string
  name_bn: string | null
  address: string | null
  phone: string | null
  email: string | null
  header_image_url: string | null
  default_bag_kg: number
  invoice_footer: string | null
}

export const useCompany = () =>
  useData<Company>(['company'], () => supabase.from('company_settings').select('*').eq('id', 1).single(), { staleTime: 5 * 60_000 })
