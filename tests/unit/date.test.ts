import { describe, it, expect } from 'vitest'
import { formatDateInSeoul, todayInSeoul, weekdayIndexOf } from '@/lib/date'

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
