import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  display_name: string
  slug: string
  avatar_url: string | null
}

const 프로필컬럼 = 'id, display_name, slug, avatar_url'

/** 로그인 상태이고 profiles에 등록돼 있으면 프로필을, 아니면 null을 반환한다. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select(프로필컬럼)
    .eq('id', user.id)
    .maybeSingle()

  return (data as Profile | null) ?? null
}

/**
 * 등록된 팀원만 통과시킨다.
 * 비로그인은 미들웨어가 이미 /login 으로 보내므로, 여기 걸리는 것은
 * '로그인은 됐지만 profiles에 없는 계정'이다.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/no-access')
  return profile
}

export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('profiles')
    .select(프로필컬럼)
    .order('sort_order', { ascending: true })

  return (data as Profile[] | null) ?? []
}
