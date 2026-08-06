import { createHash, randomUUID } from 'node:crypto'
import { parseAiResponse, type AiDigestResponse } from '@/lib/digest'
import type { NoteForDigest } from '@/lib/digest-generation'

export const KNOWLEDGE_MODEL = 'gemini-3.5-flash'
export const UNCLASSIFIED_TOPIC_ID = '00000000-0000-4000-8000-000000000001'

export type NoteForKnowledge = NoteForDigest & {
  id: string
  studiedOn: string
}

export type ExistingTopic = {
  id: string
  name: string
  slug: string
  parentId: string | null
  summaryMd: string
  status: 'active' | 'suggested' | 'unclassified' | 'archived'
  createdByAi: boolean
}

type AiTopic = {
  slug: string
  name: string
  parentSlug: string | null
  summary: string
}

type AiNoteTopic = {
  noteId: string
  topicSlugs: string[]
  confidence: number
  reason: string
}

type RelationType = 'related' | 'prerequisite' | 'applies' | 'contrasts'

type AiTopicRelation = {
  sourceSlug: string
  targetSlug: string
  relationType: RelationType
  confidence: number
}

export type ParsedDailyKnowledge = {
  digest: AiDigestResponse
  topics: AiTopic[]
  noteTopics: AiNoteTopic[]
  relations: AiTopicRelation[]
}

export type KnowledgePayload = {
  topics: Array<{
    id: string
    name: string
    slug: string
    parent_id: string | null
    summary_md: string
    status: ExistingTopic['status']
    created_by_ai: boolean
  }>
  noteTopics: Array<{
    note_id: string
    topic_id: string
    confidence: number
    reason: string
  }>
  relations: Array<{
    source_topic_id: string
    target_topic_id: string
    relation_type: RelationType
    confidence: number
  }>
}

export type KnowledgeParseResult =
  | { ok: true; value: ParsedDailyKnowledge }
  | { ok: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function toConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ')
}

export function topicSlug(value: string): string {
  const ascii = value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  if (ascii) return ascii
  return `topic-${createHash('sha256').update(value).digest('hex').slice(0, 10)}`
}

export function hashKnowledgeInput(notes: NoteForKnowledge[]): string {
  const stable = [...notes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((note) => ({
      id: note.id,
      authorSlug: note.authorSlug,
      title: note.title.trim(),
      bodyMd: note.bodyMd.trim(),
      studiedOn: note.studiedOn,
    }))

  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

/**
 * Structured output still needs semantic validation: the model can return a
 * valid JSON shape with unknown note IDs or topic references.
 */
export function parseDailyKnowledgeResponse(
  raw: unknown,
  notes: NoteForKnowledge[],
  existingTopics: ExistingTopic[],
): KnowledgeParseResult {
  const digestResult = parseAiResponse(raw)
  if (!digestResult.ok) return digestResult
  if (!isRecord(raw)) return { ok: false, message: 'AI 응답이 객체가 아닙니다' }

  if (!Array.isArray(raw.topics) || !Array.isArray(raw.note_topics) || !Array.isArray(raw.topic_relations)) {
    return { ok: false, message: '마인드맵 분류 항목이 없습니다' }
  }

  const knownNoteIds = new Set(notes.map((note) => note.id))
  const existingSlugs = new Set(existingTopics.map((topic) => topic.slug))
  const topics: AiTopic[] = []
  const responseSlugs = new Set<string>()

  for (const value of raw.topics) {
    if (!isRecord(value) || !isString(value.name) || !isString(value.slug) || !isString(value.summary)) {
      return { ok: false, message: 'topics 항목의 형태가 잘못됐습니다' }
    }

    const name = value.name.trim()
    const slug = topicSlug(value.slug)
    if (!name || !slug) return { ok: false, message: '주제 이름 또는 slug가 비어 있습니다' }
    if (responseSlugs.has(slug)) continue

    const parentSlug = isString(value.parent_slug) && value.parent_slug.trim()
      ? topicSlug(value.parent_slug)
      : null

    responseSlugs.add(slug)
    topics.push({ slug, name, parentSlug, summary: value.summary.trim() })
  }

  if (topics.length === 0 && notes.length > 0) {
    return { ok: false, message: '분류된 주제가 없습니다' }
  }

  const availableSlugs = new Set([...existingSlugs, ...responseSlugs, 'unclassified'])
  const noteTopics: AiNoteTopic[] = []

  for (const value of raw.note_topics) {
    if (!isRecord(value) || !isString(value.note_id) || !Array.isArray(value.topic_slugs) || !isString(value.reason)) {
      return { ok: false, message: 'note_topics 항목의 형태가 잘못됐습니다' }
    }
    if (!knownNoteIds.has(value.note_id)) continue

    const confidence = toConfidence(value.confidence)
    if (confidence === null) return { ok: false, message: 'note_topics confidence가 숫자가 아닙니다' }

    const topicSlugs = [...new Set(
      value.topic_slugs
        .filter(isString)
        .map(topicSlug)
        .filter((slug) => availableSlugs.has(slug)),
    )].slice(0, 3)

    if (topicSlugs.length === 0) continue
    noteTopics.push({ noteId: value.note_id, topicSlugs, confidence, reason: value.reason.trim() })
  }

  const relationTypes = new Set<RelationType>(['related', 'prerequisite', 'applies', 'contrasts'])
  const relations: AiTopicRelation[] = []
  const relationKeys = new Set<string>()

  for (const value of raw.topic_relations) {
    if (!isRecord(value) || !isString(value.source_slug) || !isString(value.target_slug) || !isString(value.relation_type)) {
      return { ok: false, message: 'topic_relations 항목의 형태가 잘못됐습니다' }
    }

    const sourceSlug = topicSlug(value.source_slug)
    const targetSlug = topicSlug(value.target_slug)
    const confidence = toConfidence(value.confidence)
    if (confidence === null || !relationTypes.has(value.relation_type as RelationType)) {
      return { ok: false, message: 'topic_relations 값이 올바르지 않습니다' }
    }
    if (sourceSlug === targetSlug || !availableSlugs.has(sourceSlug) || !availableSlugs.has(targetSlug)) continue

    const relationType = value.relation_type as RelationType
    const key = `${sourceSlug}:${targetSlug}:${relationType}`
    if (relationKeys.has(key)) continue
    relationKeys.add(key)
    relations.push({ sourceSlug, targetSlug, relationType, confidence })
  }

  return {
    ok: true,
    value: { digest: digestResult.value, topics, noteTopics, relations },
  }
}

/** Converts model slugs into trusted UUIDs before calling the transactional RPC. */
export function resolveKnowledgePayload(
  parsed: ParsedDailyKnowledge,
  notes: NoteForKnowledge[],
  existingTopics: ExistingTopic[],
): KnowledgePayload {
  const bySlug = new Map(existingTopics.map((topic) => [topic.slug, topic]))
  const byName = new Map(existingTopics.map((topic) => [normalizeName(topic.name), topic]))
  const aliases = new Map<string, ExistingTopic>()
  const resolvedTopics: ExistingTopic[] = []

  for (const topic of parsed.topics) {
    const slug = topicSlug(topic.slug)
    const existing = bySlug.get(slug) ?? byName.get(normalizeName(topic.name))
    const resolved: ExistingTopic = existing ?? {
      id: randomUUID(),
      name: topic.name,
      slug,
      parentId: null,
      summaryMd: topic.summary,
      status: 'suggested',
      createdByAi: true,
    }

    if (existing && topic.summary) resolved.summaryMd = topic.summary
    aliases.set(slug, resolved)
    bySlug.set(resolved.slug, resolved)
    byName.set(normalizeName(resolved.name), resolved)
    if (!resolvedTopics.some((item) => item.id === resolved.id)) resolvedTopics.push(resolved)
  }

  for (const existing of existingTopics) {
    aliases.set(existing.slug, existing)
  }

  const aiTopicBySlug = new Map(parsed.topics.map((topic) => [topicSlug(topic.slug), topic]))
  for (const resolved of resolvedTopics) {
    const aiTopic = aiTopicBySlug.get(resolved.slug)
    if (aiTopic?.parentSlug) {
      resolved.parentId = aliases.get(topicSlug(aiTopic.parentSlug))?.id ?? resolved.parentId
    }
  }

  const noteMappings: KnowledgePayload['noteTopics'] = []
  const mappedNotes = new Set<string>()

  for (const mapping of parsed.noteTopics) {
    for (const slug of mapping.topicSlugs) {
      const topic = aliases.get(topicSlug(slug))
      if (!topic) continue
      noteMappings.push({
        note_id: mapping.noteId,
        topic_id: topic.id,
        confidence: mapping.confidence,
        reason: mapping.reason,
      })
      mappedNotes.add(mapping.noteId)
    }
  }

  const missingNotes = notes.filter((note) => !mappedNotes.has(note.id))
  if (missingNotes.length > 0) {
    const fallback = existingTopics.find((topic) => topic.id === UNCLASSIFIED_TOPIC_ID) ?? {
      id: UNCLASSIFIED_TOPIC_ID,
      name: '미분류',
      slug: 'unclassified',
      parentId: null,
      summaryMd: 'AI 분류를 기다리는 스터디 기록입니다.',
      status: 'unclassified' as const,
      createdByAi: false,
    }
    if (!resolvedTopics.some((topic) => topic.id === fallback.id)) resolvedTopics.push(fallback)
    for (const note of missingNotes) {
      noteMappings.push({
        note_id: note.id,
        topic_id: fallback.id,
        confidence: 0,
        reason: 'AI 응답에 분류가 없어 미분류로 보관했습니다.',
      })
    }
    aliases.set('unclassified', fallback)
  }

  const relations: KnowledgePayload['relations'] = []
  const relationIds = new Set<string>()
  for (const relation of parsed.relations) {
    const source = aliases.get(topicSlug(relation.sourceSlug))
    const target = aliases.get(topicSlug(relation.targetSlug))
    if (!source || !target || source.id === target.id) continue

    let sourceId = source.id
    let targetId = target.id
    if ((relation.relationType === 'related' || relation.relationType === 'contrasts') && sourceId > targetId) {
      ;[sourceId, targetId] = [targetId, sourceId]
    }
    const key = `${sourceId}:${targetId}:${relation.relationType}`
    if (relationIds.has(key)) continue
    relationIds.add(key)
    relations.push({
      source_topic_id: sourceId,
      target_topic_id: targetId,
      relation_type: relation.relationType,
      confidence: relation.confidence,
    })
  }

  return {
    topics: resolvedTopics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      parent_id: topic.parentId,
      summary_md: topic.summaryMd,
      status: topic.status,
      created_by_ai: topic.createdByAi,
    })),
    noteTopics: noteMappings,
    relations,
  }
}
