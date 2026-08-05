import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildDigest, type NoteForDigest } from '@/lib/digest-generation'
import { callGemini } from '@/lib/ai/gemini'

export type PipelineResult = { ok: true; skipped: boolean } | { ok: false; message: string }

/**
 * §8.2 처리 순서 전체를 담당한다. service role로 실행되며 RLS를 우회하므로,
 * 이 함수 자체는 인증하지 않는다 — 호출자(라우트 핸들러)가 먼저 인증을 마쳐야 한다.
 */
export async function runDigestPipeline(date: string): Promise<PipelineResult> {
  const supabase = createSupabaseServiceClient()

  const { data: notes, error: 조회오류 } = await supabase
    .from('notes')
    .select('title, body_md, profiles(slug, display_name)')
    .eq('studied_on', date)

  if (조회오류) return { ok: false, message: '노트를 조회하지 못했습니다' }
  if (!notes || notes.length === 0) return { ok: true, skipped: true }

  const notesForDigest: NoteForDigest[] = notes.map((n) => {
    const p = n.profiles as unknown as { slug: string; display_name: string }
    return { authorSlug: p.slug, authorName: p.display_name, title: n.title, bodyMd: n.body_md }
  })

  await supabase
    .from('digests')
    .upsert({ digest_date: date, status: 'generating', started_at: new Date().toISOString() })

  const result = await buildDigest(date, notesForDigest, callGemini)

  // notes가 비어 있으면 위에서 이미 반환했으므로 buildDigest가 'skipped'를
  // 돌려줄 일은 없다. 타입 체크를 위한 방어적 분기다.
  if (result.status === 'skipped') return { ok: true, skipped: true }

  if (result.status === 'failed') {
    await supabase
      .from('digests')
      .upsert({ digest_date: date, status: 'failed', error_message: result.errorMessage })
    return { ok: false, message: result.errorMessage }
  }

  await supabase.from('digests').upsert({
    digest_date: date,
    status: 'done',
    body_md: result.bodyMd,
    has_connections: result.hasConnections,
    model: 'gemini-3.5-flash',
    generated_at: new Date().toISOString(),
    error_message: null,
  })

  return { ok: true, skipped: false }
}
