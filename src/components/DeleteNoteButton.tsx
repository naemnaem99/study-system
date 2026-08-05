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
      <button type="submit" className="rounded border px-3 py-1 text-red-600">
        삭제
      </button>
    </form>
  )
}
