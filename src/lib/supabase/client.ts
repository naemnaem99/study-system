import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
