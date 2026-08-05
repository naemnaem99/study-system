import { describe, it, expect } from 'vitest'
import { formatDateInSeoul, todayInSeoul } from '@/lib/date'

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
