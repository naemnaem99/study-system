'use client'

import { useActionState, useRef, useState } from 'react'
import type { NoteFormState } from '@/lib/validation'
import { parseMarkdownFile } from '@/lib/markdown-import'

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
  const [불러오기오류, set불러오기오류] = useState<string | null>(null)
  const 제목참조 = useRef<HTMLInputElement>(null)
  const 본문참조 = useRef<HTMLTextAreaElement>(null)
  const 파일입력참조 = useRef<HTMLInputElement>(null)

  async function 파일불러오기(file: File) {
    set불러오기오류(null)

    if (!file.name.toLowerCase().endsWith('.md')) {
      set불러오기오류('마크다운(.md) 파일만 불러올 수 있습니다')
      if (파일입력참조.current) 파일입력참조.current.value = ''
      return
    }

    const content = await file.text()
    const { title, bodyMd } = parseMarkdownFile(file.name, content)

    if (제목참조.current) 제목참조.current.value = title
    if (본문참조.current) 본문참조.current.value = bodyMd
    if (파일입력참조.current) 파일입력참조.current.value = ''
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="markdownFile" className="text-sm text-gray-600">
          마크다운 파일 불러오기
        </label>
        <input
          ref={파일입력참조}
          id="markdownFile"
          type="file"
          accept=".md,text/markdown"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void 파일불러오기(f)
          }}
          className="text-sm file:mr-3 file:rounded file:border file:bg-white file:px-3 file:py-1"
        />
        {불러오기오류 && <p className="text-sm text-red-600">{불러오기오류}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm text-gray-600">제목</label>
        <input
          ref={제목참조}
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
          ref={본문참조}
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
