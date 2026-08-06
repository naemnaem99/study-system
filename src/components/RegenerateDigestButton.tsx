'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RegenerateDigestButton({ date }: { date: string }) {
  const [생성중, set생성중] = useState(false)
  const [오류, set오류] = useState<string | null>(null)
  const router = useRouter()

  async function 생성하기() {
    if (!window.confirm('AI를 사용해 이 날짜의 정리본을 다시 생성할까요? 무료 API 사용량이 차감될 수 있습니다.')) return
    set생성중(true)
    set오류(null)
    try {
      const res = await fetch(`/api/digests/${date}/generate`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        set오류(body.error ?? '생성에 실패했습니다')
        return
      }
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
        {생성중 ? '생성 중…' : '다시 생성'}
      </button>
      {오류 && <p className="mt-2 text-sm text-red-600">{오류}</p>}
    </div>
  )
}
