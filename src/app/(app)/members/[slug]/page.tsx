import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; month?: string }>
}

const 월형식 = /^\d{4}-\d{2}$/

export default async function MemberPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { q, month } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!profile) notFound()

  let query = supabase
    .from('notes')
    .select('id, title, studied_on', { count: 'exact' })
    .eq('author_id', profile.id)
    .order('studied_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (q && q.trim()) {
    query = query.ilike('title', `%${q.trim()}%`)
  }

  if (month && 월형식.test(month)) {
    const [y, m] = month.split('-').map(Number)
    if (m >= 1 && m <= 12) {
      // 해당 월의 1일 이상, 다음 달 1일 미만
      const 시작 = `${month}-01`
      const 다음달 = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      query = query.gte('studied_on', 시작).lt('studied_on', 다음달)
    }
  }

  const { data: notes, count } = await query

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{profile.display_name}의 스터디 저장소</h1>
        <span className="text-sm text-gray-500">총 {count ?? 0}개</span>
      </div>

      <form className="mb-6 flex gap-2 text-sm">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="제목 검색"
          className="rounded border px-3 py-1.5"
        />
        <input
          name="month"
          type="month"
          defaultValue={month ?? ''}
          className="rounded border px-3 py-1.5"
        />
        <button type="submit" className="rounded border px-3 py-1.5">찾기</button>
        {(q || month) && (
          <Link href={`/members/${slug}`} className="px-3 py-1.5 text-gray-500">
            초기화
          </Link>
        )}
      </form>

      {(notes ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">아직 올린 노트가 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {notes!.map((n) => (
            <li key={n.id} className="py-3">
              <Link href={`/notes/${n.id}`} className="flex gap-4 hover:underline">
                <span className="w-24 shrink-0 text-sm text-gray-500">{n.studied_on}</span>
                <span>{n.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
