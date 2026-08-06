import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NoteForm } from '@/components/NoteForm'
import { updateNote } from '../../actions'
import { todayInSeoul } from '@/lib/date'

type Props = { params: Promise<{ id: string }> }

export default async function EditNotePage({ params }: Props) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createSupabaseServerClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, title, body_md, studied_on, author_id')
    .eq('id', id)
    .maybeSingle()

  if (!note) notFound()
  // RLS가 남의 노트 수정을 이미 막지만, 화면에서도 미리 돌려보낸다.
  if (note.author_id !== profile.id) redirect(`/notes/${id}`)

  return (
    <section className="page-enter">
      <div className="mb-10 border-b border-hairline pb-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Edit study note</p>
        <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">스터디 기록 수정</h1>
      </div>
      <NoteForm
        action={updateNote}
        initial={{ title: note.title, bodyMd: note.body_md, studiedOn: note.studied_on }}
        submitLabel="저장"
        defaultStudiedOn={todayInSeoul()}
        hiddenFields={{ id: note.id }}
        author={{ displayName: profile.display_name, slug: profile.slug }}
      />
    </section>
  )
}
