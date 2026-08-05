import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Markdown } from '@/components/Markdown'
import { RegenerateDigestButton } from '@/components/RegenerateDigestButton'

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
      <>
        <h1 className="mb-6 text-xl font-bold">{date}</h1>
        <p className="mb-6 text-sm text-gray-500">아직 생성되지 않았습니다.</p>
        <RegenerateDigestButton date={date} />
      </>
    )
  }

  if (digest.status !== 'done' || !digest.body_md) {
    return (
      <>
        <h1 className="mb-6 text-xl font-bold">{date}</h1>
        <p className="mb-6 text-sm text-gray-500">
          {digest.status === 'failed' ? '생성에 실패했습니다.' : '생성 중입니다.'}
        </p>
        <RegenerateDigestButton date={date} />
      </>
    )
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{date}</h1>
        <div className="flex gap-3 text-sm">
          <a href={`/api/digests/${date}/download`} className="rounded border px-3 py-1">
            .md 다운로드
          </a>
          <RegenerateDigestButton date={date} />
        </div>
      </div>
      <Markdown>{digest.body_md}</Markdown>
    </>
  )
}
