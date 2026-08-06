import { describe, it, expect, vi } from 'vitest'
import { buildDigest, type NoteForDigest } from '@/lib/digest-generation'

const 노트1개: NoteForDigest[] = [
  { authorSlug: 'jiho', authorName: '지호', title: '이분 탐색', bodyMd: '내용' },
]
const 노트2개: NoteForDigest[] = [
  { authorSlug: 'jiho', authorName: '지호', title: '이분 탐색', bodyMd: '내용' },
  { authorSlug: 'minsu', authorName: '민수', title: '그래프', bodyMd: '내용' },
]

function 정상응답(overrides: { members?: unknown; connections?: unknown } = {}) {
  return {
    one_liner: '오늘 배운 것',
    members: overrides.members ?? [{ profile_slug: 'jiho', summary: '요약' }],
    connections: overrides.connections ?? [],
  }
}

describe('buildDigest', () => {
  it('노트가 0개면 생성하지 않는다', async () => {
    const callAi = vi.fn()
    const r = await buildDigest('2026-08-05', [], callAi)
    expect(r.status).toBe('skipped')
    expect(callAi).not.toHaveBeenCalled()
  })

  it('노트가 1개면 요약만 있고 겹치는 지점이 없다', async () => {
    const callAi = vi.fn().mockResolvedValue(정상응답())
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') {
      expect(r.hasConnections).toBe(false)
      expect(r.bodyMd).not.toContain('겹치는 지점')
      expect(r.oneLiner).toBe('오늘 배운 것')
    }
  })

  it('connections가 빈 배열이면 겹치는 지점 섹션이 마크다운에 없다', async () => {
    const callAi = vi.fn().mockResolvedValue(정상응답({ connections: [] }))
    const r = await buildDigest('2026-08-05', 노트2개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') expect(r.bodyMd).not.toContain('겹치는 지점')
  })

  it('유효한 연결이 있으면 겹치는 지점 섹션이 출력된다', async () => {
    const callAi = vi.fn().mockResolvedValue(
      정상응답({
        members: [
          { profile_slug: 'jiho', summary: '요약1' },
          { profile_slug: 'minsu', summary: '요약2' },
        ],
        connections: [{ title: '공통 주제', detail: '둘 다 탐색을 다뤘다', member_slugs: ['jiho', 'minsu'] }],
      }),
    )
    const r = await buildDigest('2026-08-05', 노트2개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') {
      expect(r.hasConnections).toBe(true)
      expect(r.bodyMd).toContain('겹치는 지점')
    }
  })

  it('스키마가 깨지면 1회 재시도하고, 재시도가 성공하면 정상 처리한다', async () => {
    const callAi = vi
      .fn()
      .mockResolvedValueOnce({ 이상한: '응답' })
      .mockResolvedValueOnce(정상응답())
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(r.status).toBe('done')
  })

  it('재시도까지 스키마가 깨지면 failed로 끝난다', async () => {
    const callAi = vi.fn().mockResolvedValue({ 이상한: '응답' })
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(r.status).toBe('failed')
  })

  // AI 호출이 예외를 던져도 buildDigest 밖으로 나가면 안 된다. 나가면 라우트가
  // 본문 없는 500을 돌려주고, 브라우저의 res.json()이 SyntaxError로 죽는다.
  it('AI 호출이 예외를 던지면 failed로 끝나고 메시지를 담는다', async () => {
    const callAi = vi.fn().mockRejectedValue(new Error('환경변수 GEMINI_API_KEY 가 설정되지 않았습니다'))
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(r.status).toBe('failed')
    if (r.status === 'failed') {
      expect(r.errorMessage).toContain('GEMINI_API_KEY')
    }
  })

  it('예외를 던질 때는 재시도하지 않는다', async () => {
    const callAi = vi.fn().mockRejectedValue(new Error('실패'))
    await buildDigest('2026-08-05', 노트1개, callAi)
    expect(callAi).toHaveBeenCalledTimes(1)
  })
})
