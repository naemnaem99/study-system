'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  date: string
  label?: string
  /** 목록 화면은 만든 정리본으로 이동하고, 상세 화면은 제자리에서 새로고침한다. */
  afterSuccess?: 'refresh' | 'navigate'
  /** 실행 전 사용자가 의도를 확인한다. */
  confirmMessage?: string
}

/** 클릭하면 기록이 그대로여도 항상 AI를 다시 호출해 정리본과 마인드맵을 재분류한다(temperature>0이라 결과가 달라질 수 있음). */
export function GenerateDigestButton({
  date,
  label = '다시 생성',
  afterSuccess = 'refresh',
  confirmMessage = '정리본과 마인드맵을 다시 생성할까요? AI를 다시 호출합니다.',
}: Props) {
  const [생성중, set생성중] = useState(false)
  const [안내, set안내] = useState<{ text: string; 오류: boolean } | null>(null)
  const router = useRouter()

  async function 생성하기() {
    if (!window.confirm(confirmMessage)) return
    set생성중(true)
    set안내(null)
    try {
      const res = await fetch(`/api/digests/${date}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const body = await res.json()
      if (!res.ok) {
        set안내({ text: body.error ?? '생성에 실패했습니다', 오류: true })
        return
      }

      if (body.skipped) {
        const text = body.reason === 'in-progress'
          ? '같은 날짜의 생성 작업이 이미 진행 중입니다.'
          : '아직 올라온 노트가 없습니다.'
        set안내({ text, 오류: false })
        return
      }

      set안내({ text: '정리본과 마인드맵을 함께 업데이트했습니다.', 오류: false })
      if (afterSuccess === 'navigate') router.push(`/digests/${date}`)
      router.refresh()
    } finally {
      set생성중(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void 생성하기()}
        disabled={생성중}
        className="inline-flex min-h-10 items-center rounded-xl bg-study px-4 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-ink disabled:translate-y-0 disabled:opacity-50"
      >
        {생성중 ? '생성 중…' : label}
      </button>
      {안내 && (
        <p className={`mt-2 text-sm ${안내.오류 ? 'text-red-600' : 'text-ink/50'}`}>
          {안내.text}
        </p>
      )}
    </div>
  )
}
