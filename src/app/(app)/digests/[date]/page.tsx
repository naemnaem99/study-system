import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Markdown } from '@/components/Markdown'
import { GenerateDigestButton } from '@/components/GenerateDigestButton'
import { hasDigestContent } from '@/lib/digest'

type Props = { params: Promise<{ date: string }> }

export default async function DigestDetailPage({ params }: Props) {
  const { date } = await params
  const supabase = await createSupabaseServerClient()

  const { data: digest } = await supabase
    .from('digests')
    .select('digest_date, body_md, status')
    .eq('digest_date', date)
    .maybeSingle()

  // 설계 §10: 크론 미실행 시 "아직 생성되지 않음 — 지금 생성" 버튼을 보인다.
  if (!digest) {
    return (
      <DigestStatus
        date={date}
        title="아직 정리본이 없습니다"
        description="이 날짜의 기록이 있다면 지금 정리본을 생성할 수 있습니다."
        actionLabel="지금 생성"
        confirmMessage="이 날짜의 기록을 정리본과 마인드맵에 반영할까요?"
      />
    )
  }

  if (!hasDigestContent(digest)) {
    return (
      <DigestStatus
        date={date}
        title={digest.status === 'failed' ? '정리본 생성에 실패했습니다' : '정리본을 생성하고 있습니다'}
        description={digest.status === 'failed' ? '기록은 안전하게 보존되어 있습니다. 잠시 후 다시 시도해 주세요.' : '완료되면 이 화면에 자동으로 표시됩니다.'}
      />
    )
  }

  return (
    <article className="page-enter">
      <nav aria-label="정리본 위치" className="mb-8 text-xs text-ink/40">
        <Link href="/digests" className="font-semibold transition-colors hover:text-study">팀 정리본</Link>
        <span className="mx-2">/</span>
        <span>{date}</span>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-8">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Generated study digest</p>
          <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">{date} 정리본</h1>
          <p className="mt-3 text-sm text-ink/45">이날의 기록을 AI가 한 편의 문서로 정리했습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={`/api/digests/${date}/download`} className="inline-flex min-h-10 items-center rounded-xl border border-hairline bg-white px-4 text-xs font-bold text-ink transition-all hover:-translate-y-0.5 hover:border-study/35 hover:text-study hover:shadow-[0_10px_24px_rgba(25,53,42,0.08)]">
            .md 내려받기
          </a>
          <GenerateDigestButton date={date} />
        </div>
      </header>
      {digest.status === 'failed' && (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          가장 최근 재생성 시도가 실패했습니다. 아래는 마지막으로 성공한 정리본입니다.
        </p>
      )}
      <div className="grid gap-8 pt-8 lg:grid-cols-[130px_minmax(0,780px)] lg:gap-10">
        <aside className="hidden lg:block">
          <span className="grid size-10 place-items-center rounded-full bg-mist text-study">✦</span>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/35">TOKENAIRES</p>
        </aside>
        <Markdown>{digest.body_md}</Markdown>
      </div>
    </article>
  )
}

function DigestStatus({
  date,
  title,
  description,
  actionLabel,
  confirmMessage,
}: {
  date: string
  title: string
  description: string
  actionLabel?: string
  confirmMessage?: string
}) {
  return (
    <section className="page-enter">
      <Link href="/digests" className="text-xs font-semibold text-ink/42 transition-colors hover:text-study">← 정리본 목록</Link>
      <div className="mt-8 grid min-h-[360px] place-items-center rounded-[26px] border border-hairline bg-mist/45 px-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-xl text-study shadow-[0_10px_30px_rgba(25,53,42,0.07)]">✦</span>
          <p className="mt-6 font-mono text-[10px] text-study">{date}</p>
          <h1 className="font-display mt-2 text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-ink/50">{description}</p>
          <div className="mt-7 flex justify-center">
            <GenerateDigestButton date={date} label={actionLabel} confirmMessage={confirmMessage} />
          </div>
        </div>
      </div>
    </section>
  )
}
