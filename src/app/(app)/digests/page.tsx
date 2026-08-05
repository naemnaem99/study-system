import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function DigestsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: digests } = await supabase
    .from('digests')
    .select('digest_date, status')
    .order('digest_date', { ascending: false })

  const 완료목록 = (digests ?? []).filter((d) => d.status === 'done')
  const 날짜들 = 완료목록.map((d) => d.digest_date)

  const { data: 참여노트 } =
    날짜들.length === 0
      ? { data: [] }
      : await supabase.from('notes').select('studied_on, profiles(display_name)').in('studied_on', 날짜들)

  const 날짜별참여자 = new Map<string, Set<string>>()
  for (const n of 참여노트 ?? []) {
    const 이름 = (n.profiles as unknown as { display_name: string }).display_name
    const set = 날짜별참여자.get(n.studied_on) ?? new Set<string>()
    set.add(이름)
    날짜별참여자.set(n.studied_on, set)
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-bold">정리본</h1>
      {완료목록.length === 0 ? (
        <p className="text-sm text-gray-500">아직 생성된 정리본이 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {완료목록.map((d) => (
            <li key={d.digest_date} className="py-2">
              <Link href={`/digests/${d.digest_date}`} className="hover:underline">
                {d.digest_date}
              </Link>
              <span className="ml-2 text-sm text-gray-500">
                {[...(날짜별참여자.get(d.digest_date) ?? [])].join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
