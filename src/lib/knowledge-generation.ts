import { createHash, randomUUID } from 'node:crypto'
import { parseAiResponse, type AiDigestResponse } from '@/lib/digest'
import type { NoteForDigest } from '@/lib/digest-generation'

export const KNOWLEDGE_MODEL = 'gemini-3.5-flash'
export const UNCLASSIFIED_TOPIC_ID = '00000000-0000-4000-8000-000000000001'
export const CLASSIFIER_VERSION = 'ai-only-v2'
export const PROVISIONAL_CONFIDENCE = 0.6
export const EXISTING_TOPIC_CONFIDENCE = 0.8
export const NEW_TOPIC_CONFIDENCE = 0.85
export const RELATION_CONFIDENCE = 0.85

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
  topicSlug: string
  confidence: number
  reason: string
  evidenceQuote: string
  validationStatus: 'validated' | 'provisional'
}

type RelationType = 'related' | 'prerequisite' | 'applies' | 'contrasts'

type AiTopicRelation = {
  sourceSlug: string
  targetSlug: string
  relationType: RelationType
  confidence: number
  evidenceNoteIds: string[]
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
    source: 'ai' | 'fallback'
    evidence_quote: string
    evidence_verified: boolean
    validation_status: 'validated' | 'provisional' | 'unclassified'
    classifier_version: string
  }>
  relations: Array<{
    source_topic_id: string
    target_topic_id: string
    relation_type: RelationType
    confidence: number
    evidence_count: number
    evidence_note_ids: string[]
    evidence_verified: boolean
    classifier_version: string
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

function normalizeEvidence(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function evidenceExistsInNote(evidenceQuote: string, bodyMd: string): boolean {
  const evidence = normalizeEvidence(evidenceQuote)
  if (evidence.replace(/\s/g, '').length < 12) return false
  return normalizeEvidence(bodyMd).includes(evidence)
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

  return createHash('sha256')
    .update(JSON.stringify({ classifierVersion: CLASSIFIER_VERSION, notes: stable }))
    .digest('hex')
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
  const noteById = new Map(notes.map((note) => [note.id, note]))
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
    if (topics.length === 8) break
  }

  if (topics.length === 0 && notes.length > 0) {
    return { ok: false, message: '분류된 주제가 없습니다' }
  }

  const availableSlugs = new Set([...existingSlugs, ...responseSlugs, 'unclassified'])
  const noteTopics: AiNoteTopic[] = []
  const mappingKeys = new Set<string>()
  const mappingCountByNote = new Map<string, number>()

  for (const value of raw.note_topics) {
    if (
      !isRecord(value)
      || !isString(value.note_id)
      || !isString(value.topic_slug)
      || !isString(value.reason)
      || !isString(value.evidence_quote)
    ) {
      return { ok: false, message: 'note_topics 항목의 형태가 잘못됐습니다' }
    }
    if (!knownNoteIds.has(value.note_id)) continue

    const confidence = toConfidence(value.confidence)
    if (confidence === null) return { ok: false, message: 'note_topics confidence가 숫자가 아닙니다' }

    const slug = topicSlug(value.topic_slug)
    if (!availableSlugs.has(slug) || slug === 'unclassified') continue
    if ((mappingCountByNote.get(value.note_id) ?? 0) >= 3) continue

    const key = `${value.note_id}:${slug}`
    if (mappingKeys.has(key)) continue

    const note = noteById.get(value.note_id)!
    const evidenceQuote = value.evidence_quote.trim()
    if (confidence < PROVISIONAL_CONFIDENCE || !evidenceExistsInNote(evidenceQuote, note.bodyMd)) continue

    const isNewTopic = responseSlugs.has(slug) && !existingSlugs.has(slug)
    const validatedThreshold = isNewTopic ? NEW_TOPIC_CONFIDENCE : EXISTING_TOPIC_CONFIDENCE
    const validationStatus = confidence >= validatedThreshold ? 'validated' : 'provisional'

    mappingKeys.add(key)
    mappingCountByNote.set(value.note_id, (mappingCountByNote.get(value.note_id) ?? 0) + 1)
    noteTopics.push({
      noteId: value.note_id,
      topicSlug: slug,
      confidence,
      reason: value.reason.trim(),
      evidenceQuote,
      validationStatus,
    })
  }

  const relationTypes = new Set<RelationType>(['related', 'prerequisite', 'applies', 'contrasts'])
  const relations: AiTopicRelation[] = []
  const relationKeys = new Set<string>()
  const validatedTopicsByNote = new Map<string, Set<string>>()
  for (const mapping of noteTopics) {
    if (mapping.validationStatus !== 'validated') continue
    const topicSet = validatedTopicsByNote.get(mapping.noteId) ?? new Set<string>()
    topicSet.add(mapping.topicSlug)
    validatedTopicsByNote.set(mapping.noteId, topicSet)
  }

  for (const value of raw.topic_relations) {
    if (
      !isRecord(value)
      || !isString(value.source_slug)
      || !isString(value.target_slug)
      || !isString(value.relation_type)
      || !Array.isArray(value.evidence_note_ids)
    ) {
      return { ok: false, message: 'topic_relations 항목의 형태가 잘못됐습니다' }
    }

    const sourceSlug = topicSlug(value.source_slug)
    const targetSlug = topicSlug(value.target_slug)
    const confidence = toConfidence(value.confidence)
    if (confidence === null || !relationTypes.has(value.relation_type as RelationType)) {
      return { ok: false, message: 'topic_relations 값이 올바르지 않습니다' }
    }
    if (confidence < RELATION_CONFIDENCE) continue
    if (sourceSlug === targetSlug || !availableSlugs.has(sourceSlug) || !availableSlugs.has(targetSlug)) continue

    const evidenceNoteIds = [...new Set(value.evidence_note_ids.filter(isString))]
      .filter((noteId) => knownNoteIds.has(noteId))
      .slice(0, 6)
    if (evidenceNoteIds.length === 0) continue

    let sourceCovered = false
    let targetCovered = false
    let allEvidenceRelevant = true
    for (const noteId of evidenceNoteIds) {
      const linkedTopics = validatedTopicsByNote.get(noteId) ?? new Set<string>()
      const coversSource = linkedTopics.has(sourceSlug)
      const coversTarget = linkedTopics.has(targetSlug)
      sourceCovered ||= coversSource
      targetCovered ||= coversTarget
      if (!coversSource && !coversTarget) allEvidenceRelevant = false
    }
    if (!sourceCovered || !targetCovered || !allEvidenceRelevant) continue

    const relationType = value.relation_type as RelationType
    const key = `${sourceSlug}:${targetSlug}:${relationType}`
    if (relationKeys.has(key)) continue
    relationKeys.add(key)
    relations.push({ sourceSlug, targetSlug, relationType, confidence, evidenceNoteIds })
  }

  const usedTopicSlugs = new Set(noteTopics.map((mapping) => mapping.topicSlug))
  const usedTopics = topics.filter((topic) => usedTopicSlugs.has(topic.slug))

  return {
    ok: true,
    value: { digest: digestResult.value, topics: usedTopics, noteTopics, relations },
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
    const topic = aliases.get(topicSlug(mapping.topicSlug))
    if (!topic) continue
    noteMappings.push({
      note_id: mapping.noteId,
      topic_id: topic.id,
      confidence: mapping.confidence,
      reason: mapping.reason,
      source: 'ai',
      evidence_quote: mapping.evidenceQuote,
      evidence_verified: true,
      validation_status: mapping.validationStatus,
      classifier_version: CLASSIFIER_VERSION,
    })
    mappedNotes.add(mapping.noteId)
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
        source: 'fallback',
        evidence_quote: '',
        evidence_verified: false,
        validation_status: 'unclassified',
        classifier_version: CLASSIFIER_VERSION,
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
      evidence_count: relation.evidenceNoteIds.length,
      evidence_note_ids: relation.evidenceNoteIds,
      evidence_verified: true,
      classifier_version: CLASSIFIER_VERSION,
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
