'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  date: string
  label?: string
  /** 목록 화면은 만든 정리본으로 이동하고, 상세 화면은 제자리에서 새로고침한다. */
  afterSuccess?: 'refresh' | 'navigate'
}

export function GenerateDigestButton({
  date,
  label = '다시 생성',
  afterSuccess = 'refresh',
}: Props) {
  const [생성중, set생성중] = useState(false)
  const [안내, set안내] = useState<{ text: string; 오류: boolean } | null>(null)
  const router = useRouter()

  async function 생성하기() {
    set생성중(true)
    set안내(null)
    try {
      const res = await fetch(`/api/digests/${date}/generate`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        set안내({ text: body.error ?? '생성에 실패했습니다', 오류: true })
        return
      }

      // 그날 노트가 0개면 파이프라인이 DB에 아무것도 쓰지 않고 skipped로 돌아온다.
      // 이때 이동하거나 새로고침하면 화면이 그대로라 버튼이 고장 난 것처럼 보인다.
      if (body.skipped) {
        set안내({ text: '아직 올라온 노트가 없습니다', 오류: false })
        return
      }

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
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        {생성중 ? '생성 중…' : label}
      </button>
      {안내 && (
        <p className={`mt-2 text-sm ${안내.오류 ? 'text-red-600' : 'text-gray-500'}`}>
          {안내.text}
        </p>
      )}
    </div>
  )
}
