'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import type { NoteFormState } from '@/lib/validation'
import { parseMarkdownFile } from '@/lib/markdown-import'

type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>
  initial?: { title: string; bodyMd: string; studiedOn: string }
  submitLabel: string
  defaultStudiedOn: string
  hiddenFields?: Record<string, string>
  author: { displayName: string; slug: string }
}

const 초기상태: NoteFormState = { error: null }

export function NoteForm({ action, initial, submitLabel, defaultStudiedOn, hiddenFields, author }: Props) {
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
    <form action={formAction} className="flex max-w-4xl flex-col gap-7">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <div className="surface-lift flex flex-wrap items-center gap-4 rounded-2xl border border-leaf/35 bg-mist/75 px-5 py-4 sm:px-6">
        <span className="growth-ring relative grid size-11 shrink-0 place-items-center rounded-full bg-study text-sm font-bold text-white">
          {author.displayName.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-study">Writing as</p>
          <p className="mt-1 font-bold text-ink">{author.displayName}</p>
          <p className="mt-1 text-xs leading-5 text-ink/50">저장하면 {author.displayName}의 개인 저장소에 기록됩니다.</p>
        </div>
        <Link href={`/members/${author.slug}`} className="ml-auto hidden shrink-0 text-xs font-semibold text-study hover:text-ink sm:block">
          내 저장소 보기
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="markdownFile" className="text-xs font-bold text-ink/62">
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
          className="rounded-2xl border border-dashed border-hairline bg-white p-3 text-sm text-ink/55 transition-colors hover:border-leaf file:mr-3 file:rounded-xl file:border-0 file:bg-mist file:px-4 file:py-2 file:text-xs file:font-bold file:text-study"
        />
        {불러오기오류 && <p className="text-sm text-red-600">{불러오기오류}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="title" className="text-xs font-bold text-ink/62">제목</label>
        <input
          ref={제목참조}
          id="title"
          name="title"
          defaultValue={initial?.title}
          maxLength={200}
          required
          placeholder="오늘 무엇을 배웠나요?"
          className="min-h-13 rounded-xl border border-hairline bg-white px-4 py-3 text-lg font-bold text-ink outline-none transition-all placeholder:font-medium placeholder:text-ink/25 focus:border-study focus:ring-4 focus:ring-study/10"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="studiedOn" className="text-xs font-bold text-ink/62">공부한 날짜</label>
        <input
          id="studiedOn"
          name="studiedOn"
          type="date"
          defaultValue={initial?.studiedOn ?? defaultStudiedOn}
          required
          className="min-h-11 w-full rounded-xl border border-hairline bg-white px-4 py-2.5 outline-none transition-all focus:border-study focus:ring-4 focus:ring-study/10 sm:w-52"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="bodyMd" className="text-xs font-bold text-ink/62">내용</label>
          <span className="font-mono text-[10px] text-ink/32">Markdown supported</span>
        </div>
        <textarea
          ref={본문참조}
          id="bodyMd"
          name="bodyMd"
          defaultValue={initial?.bodyMd}
          rows={20}
          required
          placeholder="배운 내용, 질문, 다음에 확인할 것을 자유롭게 적어보세요."
          className="min-h-[460px] resize-y rounded-2xl border border-hairline bg-white px-5 py-4 font-mono text-[13px] leading-7 text-ink outline-none transition-all placeholder:text-ink/25 focus:border-study focus:ring-4 focus:ring-study/10"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-xl bg-study px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(47,125,90,0.16)] transition-all hover:-translate-y-0.5 hover:bg-ink hover:shadow-[0_14px_30px_rgba(25,53,42,0.2)] disabled:translate-y-0 disabled:opacity-50"
        >
          {pending ? '저장 중…' : submitLabel}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
