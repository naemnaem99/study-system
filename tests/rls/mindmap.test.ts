import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createTemporaryMember,
  deleteTemporaryMember,
  type TemporaryMember,
} from './test-members'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const testSlug = `rls-mindmap-${Date.now()}`
const generationDate = `2099-12-${String((Date.now() % 27) + 1).padStart(2, '0')}`

let member: SupabaseClient
let anonymous: SupabaseClient
let service: SupabaseClient
let temporaryMember: TemporaryMember | undefined
let rpcNoteId: string | undefined
const rpcTopicIds: string[] = []

beforeAll(async () => {
  service = createClient(url, serviceRoleKey)
  temporaryMember = await createTemporaryMember(service, 'mindmap')
  member = createClient(url, anonKey)
  anonymous = createClient(url, anonKey)

  const { error } = await member.auth.signInWithPassword({
    email: temporaryMember.email,
    password: temporaryMember.password,
  })
  if (error) throw new Error(`로그인 실패: ${error.message}`)
})

afterAll(async () => {
  if (service && rpcTopicIds.length > 0) await service.from('topics').delete().in('id', rpcTopicIds)
  if (service && rpcNoteId) await service.from('notes').delete().eq('id', rpcNoteId)
  if (service) await service.from('knowledge_generations').delete().eq('generation_date', generationDate)
  if (service) await service.from('topics').delete().eq('slug', testSlug)
  if (service) await deleteTemporaryMember(service, temporaryMember)
})

describe('mindmap 권한', () => {
  it('등록된 팀원은 주제와 연결을 읽을 수 있다', async () => {
    const [topics, mappings, relations, relationEvidence] = await Promise.all([
      member.from('topics').select('id').limit(1),
      member.from('note_topics').select('note_id').limit(1),
      member.from('topic_relations').select('source_topic_id').limit(1),
      member.from('topic_relation_evidence').select('note_id').limit(1),
    ])

    expect(topics.error).toBeNull()
    expect(mappings.error).toBeNull()
    expect(relations.error).toBeNull()
    expect(relationEvidence.error).toBeNull()
  })

  it('비로그인 사용자는 마인드맵 데이터를 읽을 수 없다', async () => {
    const { data, error } = await anonymous.from('topics').select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('일반 팀원은 AI 주제를 직접 쓸 수 없다', async () => {
    const { error } = await member.from('topics').insert({
      name: 'RLS 테스트 주제',
      slug: testSlug,
      summary_md: '저장되면 안 됩니다.',
    })

    expect(error).not.toBeNull()
  })

  it('service RPC는 검증된 관계와 근거 기록을 함께 저장한다', async () => {
    await service.from('knowledge_generations').delete().eq('generation_date', generationDate)
    const sourceTopicId = randomUUID()
    const targetTopicId = randomUUID()
    rpcNoteId = randomUUID()
    rpcTopicIds.push(sourceTopicId, targetTopicId)

    const { error: noteError } = await service.from('notes').insert({
      id: rpcNoteId,
      author_id: temporaryMember!.id,
      title: '[테스트] 관계 근거 저장',
      body_md: '두 주제의 관계 근거를 저장하는 테스트 기록입니다.',
      studied_on: generationDate,
    })
    expect(noteError).toBeNull()

    const inputHash = randomUUID()
    const { data: claim, error: claimError } = await service.rpc('claim_knowledge_generation', {
      p_generation_date: generationDate,
      p_input_hash: inputHash,
    })
    expect(claimError).toBeNull()
    expect(claim).toBe('claimed')

    const { error: applyError } = await service.rpc('apply_knowledge_classification', {
      p_generation_date: generationDate,
      p_input_hash: inputHash,
      p_model: 'rls-test',
      p_topics: [
        {
          id: sourceTopicId,
          name: 'RLS 근거 출발 주제',
          slug: `${testSlug}-source`,
          parent_id: null,
          summary_md: '테스트 주제',
          status: 'suggested',
          created_by_ai: true,
        },
        {
          id: targetTopicId,
          name: 'RLS 근거 도착 주제',
          slug: `${testSlug}-target`,
          parent_id: null,
          summary_md: '테스트 주제',
          status: 'suggested',
          created_by_ai: true,
        },
      ],
      p_note_topics: [sourceTopicId, targetTopicId].map((topicId) => ({
        note_id: rpcNoteId,
        topic_id: topicId,
        confidence: 0.95,
        reason: '테스트 연결',
        source: 'ai',
        evidence_quote: '두 주제의 관계 근거를 저장하는 테스트 기록입니다.',
        evidence_verified: true,
        validation_status: 'validated',
        classifier_version: 'ai-only-v2',
      })),
      p_relations: [{
        source_topic_id: sourceTopicId,
        target_topic_id: targetTopicId,
        relation_type: 'related',
        confidence: 0.92,
        evidence_count: 1,
        evidence_note_ids: [rpcNoteId],
        evidence_verified: true,
        classifier_version: 'ai-only-v2',
      }],
    })
    expect(applyError).toBeNull()

    const { data: evidence, error: evidenceError } = await member
      .from('topic_relation_evidence')
      .select('note_id, classifier_version')
      .eq('note_id', rpcNoteId)
      .single()
    expect(evidenceError).toBeNull()
    expect(evidence).toEqual({ note_id: rpcNoteId, classifier_version: 'ai-only-v2' })
  })
})
