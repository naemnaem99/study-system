import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TemporaryMember = {
  id: string
  email: string
  password: string
  slug: string
}

export async function createTemporaryMember(
  service: SupabaseClient,
  label: string,
): Promise<TemporaryMember> {
  const token = randomUUID().replaceAll('-', '').slice(0, 16)
  const email = `study-grove-rls-${label}-${token}@example.com`
  const password = `Rls!${randomUUID()}Aa1`
  const slug = `rls-${label}-${token}`

  const { data, error: userError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (userError || !data.user) {
    throw new Error(`임시 인증 사용자를 만들지 못했습니다: ${userError?.message ?? '사용자 정보 없음'}`)
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: data.user.id,
    display_name: `RLS ${label.toUpperCase()}`,
    slug,
    sort_order: 999,
  })

  if (profileError) {
    await service.auth.admin.deleteUser(data.user.id)
    throw new Error(`임시 프로필을 만들지 못했습니다: ${profileError.message}`)
  }

  return { id: data.user.id, email, password, slug }
}

export async function deleteTemporaryMember(
  service: SupabaseClient,
  member: TemporaryMember | undefined,
): Promise<void> {
  if (!member) return

  const { error } = await service.auth.admin.deleteUser(member.id)
  if (error) throw new Error(`임시 인증 사용자를 삭제하지 못했습니다: ${error.message}`)
}
