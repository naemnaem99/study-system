import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DeleteNoteButton } from '@/components/DeleteNoteButton'

type Props = { params: Promise<{ id: string }> }

export default async function NotePage({ params }: Props) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createSupabaseServerClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, title, body_md, studied_on, author_id, profiles(display_name, slug)')
    .eq('id', id)
    .maybeSingle()

  if (!note) notFound()

  const author = note.profiles as unknown as { display_name: string; slug: string }
  const 내노트 = note.author_id === profile.id

  return (
    <article>
      <div className="mb-2 text-sm text-gray-500">
        <Link href={`/members/${author.slug}`} className="hover:underline">
          {author.display_name}
        </Link>
        {' · '}
        {note.studied_on}
      </div>

      <h1 className="mb-6 text-2xl font-bold">{note.title}</h1>

      <div className="whitespace-pre-wrap leading-relaxed">{note.body_md}</div>

      {내노트 && (
        <div className="mt-10 flex gap-3 border-t pt-4 text-sm">
          <Link href={`/notes/${note.id}/edit`} className="rounded border px-3 py-1">
            수정
          </Link>
          <DeleteNoteButton noteId={note.id} />
        </div>
      )}
    </article>
  )
}
