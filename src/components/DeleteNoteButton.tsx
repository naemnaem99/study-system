'use client'

import { deleteNote } from '@/app/(app)/notes/actions'

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  return (
    <form
      action={deleteNote}
      onSubmit={(e) => {
        if (!confirm('이 노트를 삭제할까요? 되돌릴 수 없습니다.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={noteId} />
      <button type="submit" className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700">
        기록 삭제
      </button>
    </form>
  )
}
