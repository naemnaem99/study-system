import { weekdayIndexOf } from '@/lib/date'

export type DayActivity = { date: string; count: number }
export type GrassLevel = 0 | 1 | 2 | 3 | 4
export type GrassCell = { date: string; count: number; level: GrassLevel } | null

/** 소규모 팀이라 활동량 절대치가 매번 크게 흔들리므로,
 *  하드코딩 임계값 대신 이번 기간 창의 최댓값 대비 비율로 4단계를 나눈다. */
export function activityLevel(count: number, max: number): GrassLevel {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio >= 1) return 4
  if (ratio >= 0.66) return 3
  if (ratio >= 0.33) return 2
  return 1
}

/** activity는 오래된 날짜 → 오늘 순서(recentDatesInSeoul 결과와 1:1 대응)여야 한다. */
export function buildGrassCells(activity: DayActivity[]): GrassCell[] {
  if (activity.length === 0) return []
  const max = Math.max(...activity.map((a) => a.count))
  const leadingPad = weekdayIndexOf(activity[0].date)
  const pad: GrassCell[] = Array.from({ length: leadingPad }, () => null)
  const cells: GrassCell[] = activity.map((a) => ({ ...a, level: activityLevel(a.count, max) }))
  return [...pad, ...cells]
}

export function summarizeActivity(activity: DayActivity[]) {
  const total = activity.reduce((sum, a) => sum + a.count, 0)
  const activeDays = activity.filter((a) => a.count > 0).length
  return { total, activeDays }
}
