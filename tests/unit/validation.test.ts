import { describe, it, expect } from 'vitest'
import { parseNoteInput } from '@/lib/validation'

const 정상 = { title: '토큰 최적화 정리', bodyMd: '오늘 배운 것', studiedOn: '2026-08-05' }

describe('parseNoteInput', () => {
  it('정상 입력을 통과시키고 공백을 정리한다', () => {
    const r = parseNoteInput({ ...정상, title: '  토큰 최적화 정리  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.title).toBe('토큰 최적화 정리')
  })

  it('제목이 비면 거부한다', () => {
    const r = parseNoteInput({ ...정상, title: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/제목/)
  })

  it('제목이 200자를 넘으면 거부한다', () => {
    const r = parseNoteInput({ ...정상, title: 'ㄱ'.repeat(201) })
    expect(r.ok).toBe(false)
  })

  it('본문이 비면 거부한다', () => {
    const r = parseNoteInput({ ...정상, bodyMd: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/내용/)
  })

  it('날짜 형식이 다르면 거부한다', () => {
    const r = parseNoteInput({ ...정상, studiedOn: '2026/08/05' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/날짜/)
  })

  it('달력에 없는 날짜를 거부한다', () => {
    const r = parseNoteInput({ ...정상, studiedOn: '2026-02-31' })
    expect(r.ok).toBe(false)
  })

  it('문자열이 아닌 값을 거부한다', () => {
    const r = parseNoteInput({ title: 123, bodyMd: null, studiedOn: undefined })
    expect(r.ok).toBe(false)
  })
})
