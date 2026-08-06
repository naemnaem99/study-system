import { NoteForm } from '@/components/NoteForm'
import { createNote } from '../actions'
import { todayInSeoul } from '@/lib/date'
import { requireProfile } from '@/lib/auth'

export default async function NewNotePage() {
  const profile = await requireProfile()

  return (
    <section className="page-enter">
      <div className="mb-10 border-b border-hairline pb-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">New study note</p>
        <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">새 스터디 기록</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink/50">오늘 배운 내용을 남기면 내 저장소에 쌓이고, 팀의 정리본으로 이어집니다.</p>
      </div>
      <NoteForm
        action={createNote}
        submitLabel="내 저장소에 기록하기"
        defaultStudiedOn={todayInSeoul()}
        author={{ displayName: profile.display_name, slug: profile.slug }}
      />
    </section>
  )
}
