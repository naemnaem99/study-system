import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildDigestFromResponse } from '@/lib/digest-generation'
import { callGemini } from '@/lib/ai/gemini'
import {
  hashKnowledgeInput,
  KNOWLEDGE_MODEL,
  parseDailyKnowledgeResponse,
  resolveKnowledgePayload,
  type ExistingTopic,
  type NoteForKnowledge,
} from '@/lib/knowledge-generation'

export type PipelineSkipReason = 'no-notes' | 'unchanged' | 'in-progress'
export type PipelineResult =
  | { ok: true; skipped: boolean; reason?: PipelineSkipReason }
  | { ok: false; message: string }

/**
 * §8.2 처리 순서 전체를 담당한다. service role로 실행되며 RLS를 우회하므로,
 * 이 함수 자체는 인증하지 않는다 — 호출자(라우트 핸들러)가 먼저 인증을 마쳐야 한다.
 */
export async function runDigestPipeline(date: string): Promise<PipelineResult> {
  const supabase = createSupabaseServiceClient()

  const { data: notes, error: 조회오류 } = await supabase
    .from('notes')
    .select('id, title, body_md, studied_on, profiles(slug, display_name)')
    .eq('studied_on', date)

  if (조회오류) return { ok: false, message: '노트를 조회하지 못했습니다' }
  if (!notes || notes.length === 0) return { ok: true, skipped: true, reason: 'no-notes' }

  const notesForKnowledge: NoteForKnowledge[] = notes.map((n) => {
    const p = n.profiles as unknown as { slug: string; display_name: string }
    return {
      id: n.id,
      authorSlug: p.slug,
      authorName: p.display_name,
      title: n.title,
      bodyMd: n.body_md,
      studiedOn: n.studied_on,
    }
  })

  const { data: topicRows, error: topicError } = await supabase
    .from('topics')
    .select('id, name, slug, parent_id, summary_md, status, created_by_ai')
    .neq('status', 'archived')

  if (topicError) {
    return { ok: false, message: '마인드맵 DB 마이그레이션을 먼저 적용해야 합니다' }
  }

  const existingTopics: ExistingTopic[] = (topicRows ?? []).map((topic) => ({
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    parentId: topic.parent_id,
    summaryMd: topic.summary_md,
    status: topic.status as ExistingTopic['status'],
    createdByAi: topic.created_by_ai,
  }))
  const inputHash = hashKnowledgeInput(notesForKnowledge)

  const { data: claim, error: claimError } = await supabase.rpc('claim_knowledge_generation', {
    p_generation_date: date,
    p_input_hash: inputHash,
  })

  if (claimError) return { ok: false, message: 'AI 생성 작업을 잠그지 못했습니다' }
  if (claim === 'unchanged') return { ok: true, skipped: true, reason: 'unchanged' }
  if (claim === 'in_progress') return { ok: true, skipped: true, reason: 'in-progress' }
  if (claim !== 'claimed') return { ok: false, message: 'AI 생성 작업 상태가 올바르지 않습니다' }

  const noteIds = notesForKnowledge.map((note) => note.id)
  const failKnowledge = async (message: string) => {
    await supabase.rpc('fail_knowledge_generation', {
      p_generation_date: date,
      p_input_hash: inputHash,
      p_note_ids: noteIds,
      p_error_message: message,
    })
  }

  await supabase
    .from('digests')
    .upsert({ digest_date: date, status: 'generating', started_at: new Date().toISOString() })

  let rawResponse: unknown
  try {
    // 정리본과 마인드맵을 이 한 번의 네트워크 호출로 함께 생성한다.
    rawResponse = await callGemini(notesForKnowledge, existingTopics)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 호출에 실패했습니다'
    await supabase.from('digests').upsert({
      digest_date: date,
      status: 'failed',
      error_message: message.slice(0, 500),
    })
    await failKnowledge(message)
    return { ok: false, message: 'AI 호출에 실패했습니다. 기록은 미분류로 보관했습니다.' }
  }

  const digestResult = buildDigestFromResponse(date, notesForKnowledge, rawResponse)
  const knowledgeResult = parseDailyKnowledgeResponse(rawResponse, notesForKnowledge, existingTopics)

  if (digestResult.status !== 'done' || !knowledgeResult.ok) {
    const message = digestResult.status === 'failed'
      ? digestResult.errorMessage
      : !knowledgeResult.ok
        ? knowledgeResult.message
        : 'AI 응답을 처리하지 못했습니다'

    await supabase.from('digests').upsert({
      digest_date: date,
      status: 'failed',
      error_message: message,
    })
    await failKnowledge(message)
    return { ok: false, message }
  }

  const { error: digestSaveError } = await supabase.from('digests').upsert({
    digest_date: date,
    status: 'done',
    body_md: digestResult.bodyMd,
    has_connections: digestResult.hasConnections,
    model: KNOWLEDGE_MODEL,
    generated_at: new Date().toISOString(),
    error_message: null,
  })

  if (digestSaveError) {
    await failKnowledge('정리본을 저장하지 못했습니다')
    return { ok: false, message: '정리본을 저장하지 못했습니다' }
  }

  const payload = resolveKnowledgePayload(knowledgeResult.value, notesForKnowledge, existingTopics)
  const { error: graphSaveError } = await supabase.rpc('apply_knowledge_classification', {
    p_generation_date: date,
    p_input_hash: inputHash,
    p_model: KNOWLEDGE_MODEL,
    p_topics: payload.topics,
    p_note_topics: payload.noteTopics,
    p_relations: payload.relations,
  })

  if (graphSaveError) {
    await failKnowledge(graphSaveError.message)
    return { ok: false, message: '마인드맵 분류 결과를 저장하지 못했습니다' }
  }

  return { ok: true, skipped: false }
}
