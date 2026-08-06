import { describe, expect, it } from 'vitest'
import {
  hashKnowledgeInput,
  parseDailyKnowledgeResponse,
  resolveKnowledgePayload,
  topicSlug,
  UNCLASSIFIED_TOPIC_ID,
  type ExistingTopic,
  type NoteForKnowledge,
} from '@/lib/knowledge-generation'

const notes: NoteForKnowledge[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    authorSlug: 'hy',
    authorName: '하영',
    title: 'React 상태 관리',
    bodyMd: 'useState와 reducer를 비교했다.',
    studiedOn: '2026-08-06',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    authorSlug: 'sj',
    authorName: '소정',
    title: '상태 머신',
    bodyMd: '상태 전이를 명시적으로 모델링했다.',
    studiedOn: '2026-08-06',
  },
]

const existingTopics: ExistingTopic[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'React',
    slug: 'react',
    parentId: null,
    summaryMd: 'React 학습 기록',
    status: 'active',
    createdByAi: false,
  },
]

function response() {
  return {
    one_liner: '상태를 예측 가능하게 관리했다.',
    members: [
      { profile_slug: 'hy', summary: 'React 상태를 정리했다.' },
      { profile_slug: 'sj', summary: '상태 머신을 정리했다.' },
    ],
    connections: [
      { title: '상태 모델링', detail: '두 기록 모두 상태 전이를 다룬다.', member_slugs: ['hy', 'sj'] },
    ],
    topics: [
      { slug: 'react', name: 'React', parent_slug: '', summary: '컴포넌트 상태 관리' },
      { slug: 'state-machine', name: '상태 머신', parent_slug: '', summary: '명시적인 상태 전이' },
    ],
    note_topics: [
      {
        note_id: notes[0].id,
        topic_slug: 'react',
        confidence: 0.94,
        reason: 'useState를 다룸',
        evidence_quote: 'useState와 reducer를 비교했다.',
      },
      {
        note_id: notes[1].id,
        topic_slug: 'state-machine',
        confidence: 0.91,
        reason: '상태 전이를 다룸',
        evidence_quote: '상태 전이를 명시적으로 모델링했다.',
      },
    ],
    topic_relations: [
      {
        source_slug: 'react',
        target_slug: 'state-machine',
        relation_type: 'related',
        confidence: 0.9,
        evidence_note_ids: [notes[0].id, notes[1].id],
      },
    ],
  }
}

describe('knowledge generation', () => {
  it('노트 순서가 달라도 입력 해시가 같다', () => {
    expect(hashKnowledgeInput(notes)).toBe(hashKnowledgeInput([...notes].reverse()))
  })

  it('노트 본문이 바뀌면 입력 해시가 달라진다', () => {
    const changed = [{ ...notes[0], bodyMd: '변경된 본문' }, notes[1]]
    expect(hashKnowledgeInput(notes)).not.toBe(hashKnowledgeInput(changed))
  })

  it('기존 주제 slug를 기존 UUID로 연결한다', () => {
    const parsed = parseDailyKnowledgeResponse(response(), notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const payload = resolveKnowledgePayload(parsed.value, notes, existingTopics)
    expect(payload.noteTopics).toContainEqual(expect.objectContaining({
      note_id: notes[0].id,
      topic_id: existingTopics[0].id,
    }))
    expect(payload.relations).toHaveLength(1)
    expect(payload.relations[0]).toEqual(expect.objectContaining({
      evidence_note_ids: [notes[0].id, notes[1].id],
      evidence_verified: true,
      classifier_version: 'ai-only-v2',
    }))
  })

  it('입력에 없는 note_id는 저장 대상에서 제외한다', () => {
    const raw = response()
    raw.note_topics.push({
      note_id: '99999999-9999-4999-8999-999999999999',
      topic_slug: 'react',
      confidence: 1,
      reason: '조작된 연결',
      evidence_quote: '입력에 존재하지 않는 조작된 근거 문장입니다.',
    })
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.noteTopics.some((item) => item.noteId.startsWith('9999'))).toBe(false)
  })

  it('AI가 빠뜨린 기록은 미분류 주제에 연결한다', () => {
    const raw = response()
    raw.note_topics = raw.note_topics.slice(0, 1)
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const payload = resolveKnowledgePayload(parsed.value, notes, existingTopics)
    expect(payload.noteTopics).toContainEqual(expect.objectContaining({
      note_id: notes[1].id,
      topic_id: UNCLASSIFIED_TOPIC_ID,
    }))
  })

  it('원문에 없는 근거를 제시한 연결은 미분류로 보관한다', () => {
    const raw = response()
    raw.note_topics[0].evidence_quote = '원문에 실제로 존재하지 않는 근거 문장입니다.'
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const payload = resolveKnowledgePayload(parsed.value, notes, existingTopics)
    expect(payload.noteTopics).toContainEqual(expect.objectContaining({
      note_id: notes[0].id,
      topic_id: UNCLASSIFIED_TOPIC_ID,
      validation_status: 'unclassified',
      evidence_verified: false,
    }))
  })

  it('기존 주제의 중간 신뢰도 연결은 provisional로 저장한다', () => {
    const raw = response()
    raw.note_topics[0].confidence = 0.72
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const payload = resolveKnowledgePayload(parsed.value, notes, existingTopics)
    expect(payload.noteTopics).toContainEqual(expect.objectContaining({
      note_id: notes[0].id,
      topic_id: existingTopics[0].id,
      validation_status: 'provisional',
      evidence_verified: true,
    }))
  })

  it('0.60 미만 연결은 저장하지 않고 미분류로 보관한다', () => {
    const raw = response()
    raw.note_topics[0].confidence = 0.59
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const payload = resolveKnowledgePayload(parsed.value, notes, existingTopics)
    expect(payload.noteTopics).toContainEqual(expect.objectContaining({
      note_id: notes[0].id,
      topic_id: UNCLASSIFIED_TOPIC_ID,
    }))
  })

  it('관계 신뢰도가 기준보다 낮으면 관계를 저장하지 않는다', () => {
    const raw = response()
    raw.topic_relations[0].confidence = 0.84
    const parsed = parseDailyKnowledgeResponse(raw, notes, existingTopics)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.relations).toHaveLength(0)
  })

  it('slug는 공백과 기호를 안정적으로 정리한다', () => {
    expect(topicSlug(' React / State ')).toBe('react-state')
  })
})
