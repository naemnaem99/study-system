import { describe, it, expect } from 'vitest'
import { formatDateInSeoul, todayInSeoul, weekdayIndexOf, recentDatesInSeoul } from '@/lib/date'

describe('formatDateInSeoul', () => {
  it('YYYY-MM-DD 형식으로 반환한다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T05:00:00Z'))).toBe('2026-08-05')
  })

  it('크론 실행 시각(14:50 UTC)은 같은 날 KST다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T14:50:00Z'))).toBe('2026-08-05')
  })

  it('15:00 UTC를 넘기면 KST로는 다음 날이다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T15:10:00Z'))).toBe('2026-08-06')
  })

  it('UTC 자정 직전도 KST로는 이미 다음 날이다', () => {
    expect(formatDateInSeoul(new Date('2026-08-04T23:00:00Z'))).toBe('2026-08-05')
  })
})

describe('todayInSeoul', () => {
  it('주어진 시각을 KST 날짜로 바꾼다', () => {
    expect(todayInSeoul(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })
})

// 요일 인덱스: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토
// 기대값은 실제 달력(외부 사실)에서 손으로 확인한 값이며, weekdayIndexOf와
// 같은 계산 방식으로 재도출한 것이 아니다.
describe('weekdayIndexOf', () => {
  it('2026-08-05 는 수요일이다', () => {
    expect(weekdayIndexOf('2026-08-05')).toBe(3)
  })

  it('2026-08-09 는 일요일이다', () => {
    expect(weekdayIndexOf('2026-08-09')).toBe(0)
  })

  it('2026-01-01 은 목요일이다', () => {
    expect(weekdayIndexOf('2026-01-01')).toBe(4)
  })

  it('2026-12-31 은 목요일이다', () => {
    expect(weekdayIndexOf('2026-12-31')).toBe(4)
  })
})

describe('recentDatesInSeoul', () => {
  it('요청한 일수만큼 날짜를 반환한다', () => {
    expect(recentDatesInSeoul(30, new Date('2026-08-05T05:00:00Z'))).toHaveLength(30)
  })

  it('마지막 원소는 오늘(KST)이다', () => {
    const now = new Date('2026-08-05T05:00:00Z')
    const dates = recentDatesInSeoul(30, now)
    expect(dates[dates.length - 1]).toBe(todayInSeoul(now))
  })

  it('오래된 날짜 → 오늘 순서로 오름차순 정렬된다', () => {
    const dates = recentDatesInSeoul(7, new Date('2026-08-05T05:00:00Z'))
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
  })

  it('KST 자정 경계를 넘긴 시각(15:10 UTC)도 정확히 다음 날로 계산한다', () => {
    const dates = recentDatesInSeoul(3, new Date('2026-08-05T15:10:00Z'))
    expect(dates).toEqual(['2026-08-04', '2026-08-05', '2026-08-06'])
  })
})
