'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RegenerateDigestButton({ date }: { date: string }) {
  const [생성중, set생성중] = useState(false)
  const [오류, set오류] = useState<string | null>(null)
  const router = useRouter()

  async function 생성하기() {
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
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        {생성중 ? '생성 중…' : '다시 생성'}
      </button>
      {오류 && <p className="mt-2 text-sm text-red-600">{오류}</p>}
    </div>
  )
}
