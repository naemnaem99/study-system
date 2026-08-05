import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPublicEnv, getServiceRoleKey } from '@/lib/env'

const 원래값 = { ...process.env }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
})

afterEach(() => {
  process.env = { ...원래값 }
  delete (globalThis as Record<string, unknown>).window
})

describe('getPublicEnv', () => {
  it('설정된 값을 읽는다', () => {
    expect(getPublicEnv()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    })
  })

  it('값이 없으면 변수 이름을 알려주며 실패한다', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})

describe('getServiceRoleKey', () => {
  it('서버에서는 값을 반환한다', () => {
    expect(getServiceRoleKey()).toBe('service-key')
  })

  it('브라우저 환경이면 값을 읽기 전에 막는다', () => {
    ;(globalThis as Record<string, unknown>).window = {}
    expect(() => getServiceRoleKey()).toThrow(/브라우저/)
  })
})
