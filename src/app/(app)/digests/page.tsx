import Link from 'next/link'
import type { CSSProperties } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { todayInSeoul } from '@/lib/date'
import { GenerateDigestButton } from '@/components/GenerateDigestButton'
import { hasDigestContent } from '@/lib/digest'

export default async function DigestsPage() {
  // 대상 날짜는 서버에서 KST로 정한다. 클라이언트 시계를 쓰면 시간대에 따라
  // 조용히 다른 날짜의 정리본을 만들게 된다(설계 §8.1).
  const 오늘 = todayInSeoul()
  const supabase = await createSupabaseServerClient()
  const { data: digests } = await supabase
    .from('digests')
    .select('digest_date, status, one_liner, body_md')
    .order('digest_date', { ascending: false })

  // status가 아니라 body_md 존재 여부로 판단한다: 이미 완성된 정리본을 재생성하다
  // AI 호출이 실패하면 status만 'failed'로 바뀌고 body_md는 그대로 남기 때문이다.
  const 완료목록 = (digests ?? []).filter(hasDigestContent)
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
    <section className="page-enter">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-7">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Daily digest</p>
          <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">팀 정리본</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink/52">팀원이 남긴 기록을 날짜별 한 편의 문서로 정리합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-mist px-3 py-1.5 font-mono text-[10px] font-semibold text-study">23:50 KST · AUTO</span>
          <GenerateDigestButton
            date={오늘}
            label="오늘 정리본 만들기"
            afterSuccess="navigate"
            confirmMessage="오늘 기록을 정리본과 마인드맵에 반영할까요? AI를 다시 호출합니다."
          />
        </div>
      </header>
      {완료목록.length === 0 ? (
        <div className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-hairline bg-mist/35 px-6 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-xl text-study shadow-[0_10px_30px_rgba(25,53,42,0.06)]">✦</span>
            <p className="mt-6 text-sm font-bold text-ink/70">아직 생성된 정리본이 없습니다.</p>
            <p className="mt-2 text-xs leading-5 text-ink/42">오늘 기록이 있다면 23:50에 첫 정리본이 만들어집니다.</p>
          </div>
        </div>
      ) : (
        <ol className="border-t border-hairline">
          {완료목록.map((digest, index) => {
            const participants = [...(날짜별참여자.get(digest.digest_date) ?? [])]
            return (
            <li key={digest.digest_date} className="stagger-item border-b border-hairline" style={{ '--item-index': index } as CSSProperties}>
              <Link href={`/digests/${digest.digest_date}`} className="group grid gap-4 rounded-2xl px-3 py-6 transition-all duration-200 hover:bg-mist/70 sm:grid-cols-[145px_1fr_auto] sm:items-center sm:px-5">
                <span className="font-mono text-xs font-semibold text-study">{digest.digest_date}</span>
                <div>
                  <p className="font-display text-lg font-bold text-ink transition-colors group-hover:text-study">{digest.one_liner ?? '하루의 스터디 정리'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {participants.length > 0 ? participants.map((name) => (
                      <span key={name} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-ink/48 ring-1 ring-hairline">{name}</span>
                    )) : <span className="text-xs text-ink/35">참여자 정보 없음</span>}
                  </div>
                </div>
                <span className="text-xs font-bold text-ink/30 transition-all group-hover:translate-x-1 group-hover:text-study">정리본 열기 →</span>
              </Link>
            </li>
          )})}
        </ol>
      )}
    </section>
  )
}
