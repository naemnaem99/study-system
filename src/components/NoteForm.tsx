'use client'

import { useActionState } from 'react'
import type { NoteFormState } from '@/lib/validation'

type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>
  initial?: { title: string; bodyMd: string; studiedOn: string }
  submitLabel: string
  defaultStudiedOn: string
  hiddenFields?: Record<string, string>
}

const 초기상태: NoteFormState = { error: null }

export function NoteForm({ action, initial, submitLabel, defaultStudiedOn, hiddenFields }: Props) {
  const [state, formAction, pending] = useActionState(action, 초기상태)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm text-gray-600">제목</label>
        <input
          id="title"
          name="title"
          defaultValue={initial?.title}
          maxLength={200}
          required
          className="rounded border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="studiedOn" className="text-sm text-gray-600">공부한 날짜</label>
        <input
          id="studiedOn"
          name="studiedOn"
          type="date"
          defaultValue={initial?.studiedOn ?? defaultStudiedOn}
          required
          className="w-44 rounded border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bodyMd" className="text-sm text-gray-600">내용 (마크다운)</label>
        <textarea
          id="bodyMd"
          name="bodyMd"
          defaultValue={initial?.bodyMd}
          rows={20}
          required
          className="rounded border px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? '저장 중…' : submitLabel}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
