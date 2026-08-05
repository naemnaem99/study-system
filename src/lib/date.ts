const SEOUL = 'Asia/Seoul'

const 서울날짜포맷 = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Date를 KST 기준 'YYYY-MM-DD' 문자열로 바꾼다. */
export function formatDateInSeoul(d: Date): string {
  return 서울날짜포맷.format(d)
}

/** 지금(또는 주어진 시각)의 KST 날짜. 기본 인자는 테스트를 위해 열어둔다. */
export function todayInSeoul(now: Date = new Date()): string {
  return formatDateInSeoul(now)
}

/** 'YYYY-MM-DD' (KST 기준 달력 날짜) 의 요일 인덱스. 0=일 … 6=토 */
export function weekdayIndexOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}
