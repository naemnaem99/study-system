import type { CSSProperties } from 'react'
import { buildGrassCells, summarizeActivity, type DayActivity } from '@/lib/grass'

type Props = {
  activity: DayActivity[]
  className?: string
}

const LEVEL_CLASS = ['bg-mist', 'bg-grass-1', 'bg-grass-2', 'bg-leaf', 'bg-study'] as const

export function GrassGraph({ activity, className = '' }: Props) {
  const cells = buildGrassCells(activity)
  const { total, activeDays } = summarizeActivity(activity)
  const columns = Math.max(1, Math.ceil(cells.length / 7))
  const weeks = Math.round(activity.length / 7)
  const label =
    total > 0
      ? `최근 ${weeks}주 동안 ${activeDays}일에 걸쳐 팀 전체 ${total}건의 학습 기록이 있었습니다.`
      : `최근 ${weeks}주 동안 기록된 학습이 아직 없습니다.`

  return (
    <div
      role="img"
      aria-label={label}
      className={`grid grid-flow-col gap-[3px] sm:gap-1.5 ${className}`}
      style={
        {
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
        } as CSSProperties
      }
    >
      {cells.map((cell, i) =>
        cell ? (
          <span
            key={cell.date}
            aria-hidden="true"
            title={`${cell.date} · ${cell.count}건`}
            className={`aspect-square w-full rounded-[3px] ${LEVEL_CLASS[cell.level]}`}
          />
        ) : (
          <span key={`pad-${i}`} aria-hidden="true" className="aspect-square w-full" />
        ),
      )}
    </div>
  )
}
