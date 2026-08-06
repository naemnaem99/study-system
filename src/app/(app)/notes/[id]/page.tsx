import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DeleteNoteButton } from '@/components/DeleteNoteButton'
import { Markdown } from '@/components/Markdown'

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
    <article className="page-enter">
      <nav aria-label="기록 위치" className="mb-8 flex flex-wrap items-center gap-2 text-xs text-ink/40">
        <Link href={`/members/${author.slug}`} className="font-semibold transition-colors hover:text-study">{author.display_name}의 저장소</Link>
        <span aria-hidden="true">/</span>
        <span>{note.studied_on}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[160px_minmax(0,780px)] lg:gap-12">
        <aside className="lg:pt-2">
          <div className="flex items-center gap-3 lg:block">
            <span className="relative grid size-11 place-items-center rounded-full bg-mist text-sm font-bold text-study">
              {author.display_name.slice(0, 1)}
            </span>
            <div className="lg:mt-5">
              <p className="text-xs font-bold text-ink">{author.display_name}</p>
              <p className="mt-1 font-mono text-[10px] text-ink/38">{note.studied_on}</p>
            </div>
          </div>
          <Link href={`/members/${author.slug}`} className="mt-5 hidden text-xs font-semibold text-study transition-colors hover:text-ink lg:inline-flex">저장소로 돌아가기 →</Link>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-hairline pb-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Study note</p>
            <h1 className="font-display mt-4 text-3xl font-bold leading-[1.3] text-ink sm:text-[2.55rem]">{note.title}</h1>
          </header>

          <div className="pt-7 sm:pt-9">
            <Markdown>{note.body_md}</Markdown>
          </div>

          {내노트 && (
            <div className="mt-14 flex flex-wrap items-center gap-3 border-t border-hairline pt-6 text-sm">
              <Link href={`/notes/${note.id}/edit`} className="inline-flex min-h-10 items-center rounded-xl border border-hairline bg-white px-4 text-sm font-bold text-ink transition-all hover:-translate-y-0.5 hover:border-study/35 hover:text-study hover:shadow-[0_10px_24px_rgba(25,53,42,0.08)]">
                기록 수정
              </Link>
              <DeleteNoteButton noteId={note.id} />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
