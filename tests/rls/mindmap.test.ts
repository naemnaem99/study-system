import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const testSlug = `rls-mindmap-${Date.now()}`

let member: SupabaseClient
let anonymous: SupabaseClient
let service: SupabaseClient

beforeAll(async () => {
  member = createClient(url, anonKey)
  anonymous = createClient(url, anonKey)
  service = createClient(url, serviceRoleKey)

  const { error } = await member.auth.signInWithPassword({
    email: process.env.TEST_USER_A_EMAIL!,
    password: process.env.TEST_USER_A_PASSWORD!,
  })
  if (error) throw new Error(`로그인 실패: ${error.message}`)
})

afterAll(async () => {
  if (service) await service.from('topics').delete().eq('slug', testSlug)
})

describe('mindmap 권한', () => {
  it('등록된 팀원은 주제와 연결을 읽을 수 있다', async () => {
    const [topics, mappings, relations] = await Promise.all([
      member.from('topics').select('id').limit(1),
      member.from('note_topics').select('note_id').limit(1),
      member.from('topic_relations').select('source_topic_id').limit(1),
    ])

    expect(topics.error).toBeNull()
    expect(mappings.error).toBeNull()
    expect(relations.error).toBeNull()
  })

  it('비로그인 사용자는 마인드맵 데이터를 읽을 수 없다', async () => {
    const { data, error } = await anonymous.from('topics').select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('일반 팀원은 AI 주제를 직접 쓸 수 없다', async () => {
    const { error } = await member.from('topics').insert({
      name: 'RLS 테스트 주제',
      slug: testSlug,
      summary_md: '저장되면 안 됩니다.',
    })

    expect(error).not.toBeNull()
  })
})
