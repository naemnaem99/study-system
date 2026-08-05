import { createClient } from '@supabase/supabase-js'
import { getPublicEnv, getServiceRoleKey } from '@/lib/env'

/**
 * service role 키로 만든 클라이언트. RLS를 통째로 우회하므로 크론·정리본
 * 생성 API처럼 서버에서만, 그것도 자체 인증을 마친 뒤에만 써야 한다.
 * 쿠키·세션을 다루지 않는 단순 클라이언트다 — createSupabaseServerClient와 다르다.
 */
export function createSupabaseServiceClient() {
  const { supabaseUrl } = getPublicEnv()
  return createClient(supabaseUrl, getServiceRoleKey())
}
