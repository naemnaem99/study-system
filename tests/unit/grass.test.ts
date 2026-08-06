import { describe, it, expect } from 'vitest'
import { activityLevel, buildGrassCells, summarizeActivity } from '@/lib/grass'

describe('activityLevel', () => {
  it('count가 0이면 레벨 0이다', () => {
    expect(activityLevel(0, 5)).toBe(0)
  })

  it('max가 0(전체 활동 없음)이면 레벨 0이다', () => {
    expect(activityLevel(0, 0)).toBe(0)
  })

  it('count가 max와 같으면 레벨 4다', () => {
    expect(activityLevel(5, 5)).toBe(4)
  })

  it('비율이 0.66 이상이면 레벨 3이다', () => {
    expect(activityLevel(2, 3)).toBe(3)
  })

  it('비율이 0.33 이상 0.66 미만이면 레벨 2다', () => {
    expect(activityLevel(1, 3)).toBe(2)
  })

  it('비율이 0.33 미만이면 레벨 1이다', () => {
    expect(activityLevel(1, 10)).toBe(1)
  })
})

describe('buildGrassCells', () => {
  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(buildGrassCells([])).toEqual([])
  })

  it('시작 날짜의 요일만큼 앞에 null 패딩을 넣는다 (2026-08-05는 수요일=3)', () => {
    const cells = buildGrassCells([
      { date: '2026-08-05', count: 1 },
      { date: '2026-08-06', count: 2 },
    ])
    expect(cells.slice(0, 3)).toEqual([null, null, null])
    expect(cells).toHaveLength(3 + 2)
  })

  it('일요일(패딩 0)로 시작하면 패딩이 없다 (2026-08-09는 일요일)', () => {
    const cells = buildGrassCells([{ date: '2026-08-09', count: 1 }])
    expect(cells).toHaveLength(1)
    expect(cells[0]).not.toBeNull()
  })

  it('각 셀은 원본 date/count를 보존하고 max 대비 level을 계산한다', () => {
    const cells = buildGrassCells([
      { date: '2026-08-09', count: 0 },
      { date: '2026-08-10', count: 4 },
    ])
    expect(cells[0]).toEqual({ date: '2026-08-09', count: 0, level: 0 })
    expect(cells[1]).toEqual({ date: '2026-08-10', count: 4, level: 4 })
  })
})

describe('summarizeActivity', () => {
  it('total과 activeDays를 계산한다', () => {
    const result = summarizeActivity([
      { date: '2026-08-05', count: 2 },
      { date: '2026-08-06', count: 0 },
      { date: '2026-08-07', count: 3 },
    ])
    expect(result).toEqual({ total: 5, activeDays: 2 })
  })

  it('활동이 전혀 없으면 0을 반환한다', () => {
    expect(summarizeActivity([{ date: '2026-08-05', count: 0 }])).toEqual({ total: 0, activeDays: 0 })
  })
})
