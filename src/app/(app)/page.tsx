import Link from 'next/link'
import { getAllProfiles } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { todayInSeoul } from '@/lib/date'

const 요일 = ['일', '월', '화', '수', '목', '금', '토']

export default async function HomePage() {
  const 오늘 = todayInSeoul()
  const profiles = await getAllProfiles()
  const supabase = await createSupabaseServerClient()

  const { data: 오늘노트 } = await supabase
    .from('notes')
    .select('id, title, author_id')
    .eq('studied_on', 오늘)

  const 올린사람 = new Set((오늘노트 ?? []).map((n) => n.author_id))
  const 요일이름 = 요일[new Date(`${오늘}T00:00:00+09:00`).getUTCDay()]

  return (
    <>
      <h1 className="mb-6 text-xl font-bold">
        {오늘} ({요일이름})
      </h1>

      <ul className="mb-8 flex gap-6">
        {profiles.map((p) => {
          const 올림 = 올린사람.has(p.id)
          return (
            <li key={p.id} className="flex items-center gap-1.5">
              <Link href={`/members/${p.slug}`} className="hover:underline">
                {p.display_name}
              </Link>
              <span className={올림 ? 'text-green-600' : 'text-gray-300'}>
                {올림 ? '✓' : '—'}
              </span>
            </li>
          )
        })}
      </ul>

      <Link
        href="/notes/new"
        className="mb-10 inline-block rounded bg-black px-4 py-2 text-sm text-white"
      >
        오늘 내 스터디 올리기
      </Link>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">오늘 올라온 노트</h2>
        {(오늘노트 ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">아직 아무도 올리지 않았습니다.</p>
        ) : (
          <ul className="divide-y">
            {오늘노트!.map((n) => (
              <li key={n.id} className="py-2">
                <Link href={`/notes/${n.id}`} className="hover:underline">
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
