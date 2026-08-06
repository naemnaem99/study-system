import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { StorysetTeam } from '@/components/StorysetTeam'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; month?: string }>
}

const 월형식 = /^\d{4}-\d{2}$/

const 저장소테마: Record<string, { accent: string; soft: string; label: string; copy: string }> = {
  hy: { accent: '#2F7D5A', soft: '#EAF5EF', label: 'Deep grove', copy: '차분하게 깊이를 쌓아가는 학습 정원' },
  hn: { accent: '#2E7C72', soft: '#E8F5F2', label: 'Question grove', copy: '새로운 질문과 발견을 연결하는 학습 정원' },
  sj: { accent: '#67875B', soft: '#F0F5EA', label: 'Archive grove', copy: '배운 것을 오래 남기고 돌보는 학습 정원' },
  yj: { accent: '#557F55', soft: '#ECF5EC', label: 'Discovery grove', copy: '작은 발견을 더 큰 지식으로 키우는 학습 정원' },
}

type MemberStyle = CSSProperties & { '--member': string; '--member-soft': string }

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
  const theme = 저장소테마[profile.slug] ?? {
    accent: '#2F7D5A',
    soft: '#EAF5EF',
    label: 'Personal grove',
    copy: '나만의 학습 기록을 차곡차곡 키우는 정원',
  }
  const themeStyle: MemberStyle = { '--member': theme.accent, '--member-soft': theme.soft }
  const 필터중 = Boolean(q || month)

  return (
    <section className="page-enter space-y-10" style={themeStyle}>
      <header className="relative overflow-hidden rounded-[28px] border border-hairline bg-[var(--member-soft)] px-6 py-7 sm:px-9 sm:py-9 lg:min-h-[300px] lg:px-11">
        <div className="absolute -left-14 -top-20 size-48 rounded-full border border-[color:var(--member)]/15" />
        <div className="absolute -left-3 -top-8 size-28 rounded-full border border-[color:var(--member)]/20" />
        <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_290px]">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--member)]">{theme.label} · {profile.slug}</p>
            <div className="mt-5 flex items-center gap-5">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-[color:var(--member)] text-lg font-bold text-white shadow-[0_12px_30px_rgba(25,53,42,0.13)]">
                {profile.display_name.slice(0, 1)}
              </span>
              <div>
                <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{profile.display_name}의 저장소</h1>
                <p className="mt-2 text-sm text-ink/55">{theme.copy}</p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-[color:var(--member)]/15 pt-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink/38">Growing notes</p>
                <p className="mt-1 text-sm font-bold text-ink">총 {count ?? 0}개의 기록</p>
              </div>
              <div className="h-8 w-px bg-[color:var(--member)]/15" />
              <p className="max-w-xs text-xs leading-5 text-ink/45">날짜와 제목으로 기록을 찾고, 배움의 흐름을 다시 읽을 수 있습니다.</p>
            </div>
          </div>
          <StorysetTeam compact priority className="hidden lg:flex" />
        </div>
      </header>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--member)]">Study archive</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-ink">학습 기록</h2>
          </div>
          <span className="font-mono text-xs text-ink/38">{(notes ?? []).length} shown</span>
        </div>

        <form className="mb-7 grid gap-3 rounded-2xl border border-hairline bg-white p-3 shadow-[0_8px_28px_rgba(25,53,42,0.04)] sm:grid-cols-[minmax(180px,1fr)_180px_auto_auto]">
          <label className="sr-only" htmlFor="member-note-search">제목 검색</label>
          <input
            id="member-note-search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="기록 제목 검색"
            className="min-h-11 rounded-xl border border-transparent bg-mist/60 px-4 text-sm text-ink outline-none transition-all placeholder:text-ink/35 focus:border-[color:var(--member)] focus:bg-white focus:ring-2 focus:ring-[color:var(--member)]/10"
          />
          <label className="sr-only" htmlFor="member-note-month">월 선택</label>
          <input
            id="member-note-month"
            name="month"
            type="month"
            defaultValue={month ?? ''}
            className="min-h-11 rounded-xl border border-transparent bg-mist/60 px-4 text-sm text-ink outline-none transition-all focus:border-[color:var(--member)] focus:bg-white focus:ring-2 focus:ring-[color:var(--member)]/10"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-[color:var(--member)] px-5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-ink">기록 찾기</button>
          {필터중 && (
            <Link href={`/members/${slug}`} className="grid min-h-11 place-items-center rounded-xl px-4 text-sm font-semibold text-ink/50 transition-colors hover:bg-mist hover:text-ink">
              초기화
            </Link>
          )}
        </form>

        {(notes ?? []).length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-hairline bg-white px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--member-soft)] text-lg text-[color:var(--member)]">✦</span>
              <p className="mt-5 text-sm font-bold text-ink/70">{필터중 ? '조건에 맞는 기록이 없습니다.' : '아직 올린 기록이 없습니다.'}</p>
              <p className="mt-2 text-xs text-ink/42">{필터중 ? '검색어나 월을 바꿔 다시 찾아보세요.' : '첫 스터디 기록이 이곳에서 자라기 시작합니다.'}</p>
            </div>
          </div>
        ) : (
          <ol className="border-t border-hairline">
            {notes!.map((note, index) => (
              <li key={note.id} className="stagger-item border-b border-hairline" style={{ '--item-index': index } as CSSProperties}>
                <Link href={`/notes/${note.id}`} className="group relative grid gap-2 overflow-hidden rounded-xl px-3 py-5 transition-all duration-200 hover:bg-[var(--member-soft)] sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-6 sm:px-5">
                  <span className="absolute inset-y-3 left-0 w-0.5 origin-center scale-y-0 rounded-full bg-[color:var(--member)] transition-transform duration-200 group-hover:scale-y-100" />
                  <span className="font-mono text-[11px] text-ink/38">{note.studied_on}</span>
                  <span className="text-[15px] font-bold text-ink transition-all group-hover:translate-x-1 group-hover:text-[color:var(--member)]">{note.title}</span>
                  <span className="hidden text-xs font-semibold text-ink/30 transition-all group-hover:translate-x-1 group-hover:text-[color:var(--member)] sm:inline">기록 열기 →</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}
