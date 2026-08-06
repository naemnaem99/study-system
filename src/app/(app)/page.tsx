import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getAllProfiles } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { todayInSeoul, weekdayIndexOf, recentDatesInSeoul } from '@/lib/date'
import { StorysetTeam } from '@/components/StorysetTeam'
import { GrassGraph } from '@/components/GrassGraph'

const 요일 = ['일', '월', '화', '수', '목', '금', '토']

export default async function HomePage() {
  const 오늘 = todayInSeoul()
  const profiles = await getAllProfiles()
  const supabase = await createSupabaseServerClient()

  const { data: 오늘노트 } = await supabase
    .from('notes')
    .select('id, title, author_id')
    .eq('studied_on', 오늘)

  const 최근12주 = recentDatesInSeoul(84)
  const { data: 최근12주노트 } = await supabase
    .from('notes')
    .select('studied_on')
    .gte('studied_on', 최근12주[0])
    .lte('studied_on', 오늘)

  const { data: 최근정리본 } = await supabase
    .from('digests')
    .select('digest_date')
    .eq('status', 'done')
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const 올린사람 = new Set((오늘노트 ?? []).map((n) => n.author_id))
  const 작성자맵 = new Map(profiles.map((profile) => [profile.id, profile]))
  const 날짜별카운트 = new Map<string, number>()
  for (const row of 최근12주노트 ?? []) {
    날짜별카운트.set(row.studied_on, (날짜별카운트.get(row.studied_on) ?? 0) + 1)
  }
  const 잔디데이터 = 최근12주.map((date) => ({ date, count: 날짜별카운트.get(date) ?? 0 }))
  // 오늘은 이미 KST 기준 달력 날짜 문자열이므로, UTC 자정으로 파싱해 getUTCDay()로
  // 읽으면 시간대 변환 없이 그 날짜 자체의 요일을 얻는다.
  const 요일이름 = 요일[weekdayIndexOf(오늘)]

  return (
    <section className="page-enter space-y-12 lg:space-y-16">
      <header className="relative overflow-hidden rounded-[28px] border border-hairline bg-[linear-gradient(120deg,#f7fbf8_0%,#edf7f1_100%)] px-6 py-7 sm:px-9 sm:py-9 lg:min-h-[330px] lg:px-12 lg:py-11">
        <div className="absolute -left-20 -top-24 size-56 rounded-full border border-leaf/20" />
        <div className="absolute -left-8 -top-12 size-36 rounded-full border border-leaf/25" />
        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-study px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Today&apos;s grove</span>
              <span className="font-mono text-xs text-ink/45">{오늘} · {요일이름}요일</span>
            </div>
            <GrassGraph activity={잔디데이터} className="mt-1 max-w-[260px] sm:max-w-[300px]" />
            <p className="mt-5 max-w-xl text-sm leading-7 text-ink/58 sm:text-base">
              각자의 기록을 남기고, 서로의 학습 흐름이 연결되는 순간을 확인하세요.
            </p>
            <Link href="/notes/new" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-xl bg-study px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(47,125,90,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink hover:shadow-[0_16px_34px_rgba(25,53,42,0.22)]">
              오늘 내 스터디 기록하기 <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <StorysetTeam priority className="hidden lg:flex" />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <section>
          <div className="mb-5 flex items-end justify-between border-b border-hairline pb-4">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-study">Team pulse</p>
              <h2 className="font-display mt-1 text-2xl font-bold text-ink">오늘 참여한 팀원</h2>
            </div>
            <span className="font-mono text-xs text-ink/40">{올린사람.size} of {profiles.length}</span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((profile, index) => {
              const 올림 = 올린사람.has(profile.id)
              return (
                <li key={profile.id} className="stagger-item" style={{ '--item-index': index } as CSSProperties}>
                  <Link href={`/members/${profile.slug}`} className={`surface-lift group flex min-h-[76px] items-center gap-4 rounded-2xl border px-4 ${올림 ? 'border-leaf/45 bg-white' : 'border-hairline bg-paper text-ink/55'}`}>
                    <span className={`relative grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${올림 ? 'bg-study text-white' : 'bg-mist text-ink/45'}`}>
                      {profile.display_name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink">{profile.display_name}</p>
                      <p className="mt-1 text-[11px] text-ink/42">{올림 ? '오늘의 기록이 자라는 중' : '새 기록을 기다리는 중'}</p>
                    </div>
                    <span className={`ml-auto size-2.5 rounded-full ${올림 ? 'bg-study shadow-[0_0_0_5px_rgba(116,184,146,0.16)]' : 'border border-ink/20'}`} aria-label={올림 ? '기록 완료' : '기록 전'} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="surface-lift relative overflow-hidden rounded-[24px] border border-hairline bg-ink p-6 text-white sm:p-8">
          <div className="absolute -right-16 -top-16 size-48 rounded-full border border-white/10" />
          <div className="absolute right-7 top-7 size-3 rounded-full bg-leaf" />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-leaf">Daily digest</p>
          <h2 className="font-display mt-3 max-w-sm text-2xl font-bold leading-snug">팀의 하루를 한 편의 기록으로 읽어보세요.</h2>
          {최근정리본 ? (
            <>
              <p className="mt-10 font-mono text-xs text-white/48">{최근정리본.digest_date}</p>
              <Link href={`/digests/${최근정리본.digest_date}`} className="group mt-3 inline-flex items-center gap-3 text-sm font-bold text-white">
                최근 정리본 읽기 <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
              </Link>
            </>
          ) : (
            <p className="mt-10 max-w-sm text-sm leading-6 text-white/58">첫 정리본은 오늘 23:50에 자동으로 생성됩니다.</p>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between border-b border-hairline pb-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-study">Today&apos;s notes</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-ink">오늘 올라온 기록</h2>
          </div>
          <span className="font-mono text-xs text-ink/40">{(오늘노트 ?? []).length} notes</span>
        </div>
        {(오늘노트 ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-white px-6 py-12 text-center">
            <p className="text-sm font-bold text-ink/70">아직 올라온 기록이 없습니다.</p>
            <p className="mt-2 text-xs text-ink/42">첫 번째 기록으로 오늘의 흐름을 시작하세요.</p>
          </div>
        ) : (
          <ul>
            {오늘노트!.map((note, index) => {
              const author = 작성자맵.get(note.author_id)
              return (
                <li key={note.id} className="stagger-item border-b border-hairline" style={{ '--item-index': index } as CSSProperties}>
                  <Link href={`/notes/${note.id}`} className="group flex items-center gap-4 rounded-xl px-3 py-5 transition-all duration-200 hover:bg-mist/70 sm:px-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-xs font-bold text-study transition-transform group-hover:scale-105">{author?.display_name.slice(0, 1) ?? '?'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-ink transition-colors group-hover:text-study">{note.title}</p>
                      <p className="mt-1 text-xs text-ink/42">{author?.display_name ?? '팀원'}</p>
                    </div>
                    <span className="ml-auto text-ink/25 transition-all group-hover:translate-x-1 group-hover:text-study" aria-hidden="true">→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
