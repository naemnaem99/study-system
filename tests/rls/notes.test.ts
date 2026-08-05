import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function 로그인(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`로그인 실패 (${email}): ${error.message}`)
  return client
}

let A: SupabaseClient
let B: SupabaseClient
let 비로그인: SupabaseClient
let A의프로필ID: string
let 만든노트ID: string | undefined

beforeAll(async () => {
  A = await 로그인(process.env.TEST_USER_A_EMAIL!, process.env.TEST_USER_A_PASSWORD!)
  B = await 로그인(process.env.TEST_USER_B_EMAIL!, process.env.TEST_USER_B_PASSWORD!)
  비로그인 = createClient(url, anonKey)

  const { data } = await A.auth.getUser()
  A의프로필ID = data.user!.id
})

afterAll(async () => {
  // beforeAll이 실패하면 A/B가 생성되지 않는다. 이때 정리를 시도하면
  // TypeError가 원래 오류(로그인 실패 등)를 덮어버리므로 조용히 넘어간다.
  if (!A || !B) return

  // 테스트가 실제 DB에 쓰므로 반드시 치운다.
  if (만든노트ID) await A.from('notes').delete().eq('id', 만든노트ID)

  // 사칭 테스트가 실패하면(= 정책이 잘못돼 INSERT가 통과하면) 추적되지 않은
  // 행이 남아 팀 홈 화면에 '[테스트] 사칭 시도'가 뜬다. 제목으로 한 번 더 쓸어낸다.
  await A.from('notes').delete().like('title', '[테스트]%')
  await B.from('notes').delete().like('title', '[테스트]%')
})

describe('notes 권한', () => {
  it('A는 자기 노트를 만들 수 있다', async () => {
    const { data, error } = await A
      .from('notes')
      .insert({
        author_id: A의프로필ID,
        title: '[테스트] 권한 확인용 노트',
        body_md: '지워도 되는 노트입니다.',
        studied_on: '2026-08-05',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    만든노트ID = data!.id
  })

  it('B는 A의 노트를 읽을 수 있다', async () => {
    const { data, error } = await B.from('notes').select('id, title').eq('id', 만든노트ID!)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('B는 A의 노트를 수정할 수 없다', async () => {
    const { data } = await B
      .from('notes')
      .update({ title: '가로챈 제목' })
      .eq('id', 만든노트ID!)
      .select()

    // 에러가 아니라 '수정된 행 0개'로 막힌다.
    expect(data).toHaveLength(0)

    const { data: 확인 } = await A.from('notes').select('title').eq('id', 만든노트ID!).single()
    expect(확인!.title).toBe('[테스트] 권한 확인용 노트')
  })

  it('B는 A의 노트를 삭제할 수 없다', async () => {
    const { data } = await B.from('notes').delete().eq('id', 만든노트ID!).select()
    expect(data).toHaveLength(0)

    const { data: 확인 } = await A.from('notes').select('id').eq('id', 만든노트ID!)
    expect(확인).toHaveLength(1)
  })

  it('B는 A의 이름으로 노트를 만들 수 없다', async () => {
    const { error } = await B.from('notes').insert({
      author_id: A의프로필ID,
      title: '[테스트] 사칭 시도',
      body_md: '이건 저장되면 안 됩니다.',
      studied_on: '2026-08-05',
    })

    // INSERT는 with check 위반이므로 에러가 난다.
    expect(error).not.toBeNull()
  })

  it('비로그인 상태에서는 노트를 하나도 읽을 수 없다', async () => {
    const { data } = await 비로그인.from('notes').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('profiles 권한', () => {
  it('로그인한 사용자는 팀원 목록을 읽을 수 있다 (재귀 오류가 나지 않아야 한다)', async () => {
    const { data, error } = await A.from('profiles').select('id, display_name, slug')
    expect(error).toBeNull()
    expect(data!.length).toBe(4)
  })

  it('비로그인 상태에서는 팀원 목록도 읽을 수 없다', async () => {
    const { data } = await 비로그인.from('profiles').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})
