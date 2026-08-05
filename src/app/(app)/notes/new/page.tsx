import { NoteForm } from '@/components/NoteForm'
import { createNote } from '../actions'
import { todayInSeoul } from '@/lib/date'

export default function NewNotePage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-bold">스터디 올리기</h1>
      <NoteForm action={createNote} submitLabel="올리기" defaultStudiedOn={todayInSeoul()} />
    </>
  )
}
