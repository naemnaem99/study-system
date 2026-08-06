import { getAllProfiles } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  MindmapExplorer,
  type MindmapGeneration,
  type MindmapMapping,
  type MindmapNote,
  type MindmapProfile,
  type MindmapRelation,
  type MindmapTopic,
} from '@/components/MindmapExplorer'

type NestedNote = {
  id: string
  title: string
  body_md: string
  studied_on: string
  updated_at: string
  profiles: {
    id: string
    display_name: string
    slug: string
    avatar_url: string | null
  }
}

export default async function MindmapPage() {
  const supabase = await createSupabaseServerClient()
  const [profiles, topicsResult, mappingsResult, relationsResult, generationResult] = await Promise.all([
    getAllProfiles(),
    supabase
      .from('topics')
      .select('id, name, slug, parent_id, summary_md, status, updated_at')
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),
    supabase
      .from('note_topics')
      .select('note_id, topic_id, confidence, reason, evidence_quote, evidence_verified, validation_status, source, notes(id, title, body_md, studied_on, updated_at, profiles(id, display_name, slug, avatar_url))'),
    supabase
      .from('topic_relations')
      .select('source_topic_id, target_topic_id, relation_type, confidence, evidence_count, last_seen_on')
      .eq('evidence_verified', true)
      .order('last_seen_on', { ascending: false }),
    supabase
      .from('knowledge_generations')
      .select('generation_date, status, completed_at')
      .order('generation_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const configured = !topicsResult.error && !mappingsResult.error && !relationsResult.error && !generationResult.error

  const mapProfiles: MindmapProfile[] = profiles.map((profile) => ({
    id: profile.id,
    displayName: profile.display_name,
    slug: profile.slug,
    avatarUrl: profile.avatar_url,
  }))

  const topics: MindmapTopic[] = (topicsResult.data ?? []).map((topic) => ({
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    parentId: topic.parent_id,
    summaryMd: topic.summary_md,
    status: topic.status as MindmapTopic['status'],
    updatedAt: topic.updated_at,
  }))

  const notesById = new Map<string, MindmapNote>()
  const mappings: MindmapMapping[] = []
  for (const row of mappingsResult.data ?? []) {
    const note = row.notes as unknown as NestedNote | null
    if (!note?.profiles) continue

    if (!notesById.has(note.id)) {
      notesById.set(note.id, {
        id: note.id,
        title: note.title,
        bodyMd: note.body_md,
        studiedOn: note.studied_on,
        updatedAt: note.updated_at,
        author: {
          id: note.profiles.id,
          displayName: note.profiles.display_name,
          slug: note.profiles.slug,
          avatarUrl: note.profiles.avatar_url,
        },
      })
    }

    mappings.push({
      noteId: row.note_id,
      topicId: row.topic_id,
      confidence: Number(row.confidence),
      reason: row.reason,
      evidenceQuote: row.evidence_quote,
      evidenceVerified: row.evidence_verified,
      source: row.source as MindmapMapping['source'],
      validationStatus: row.validation_status as MindmapMapping['validationStatus'],
    })
  }

  const relations: MindmapRelation[] = (relationsResult.data ?? []).map((relation) => ({
    sourceTopicId: relation.source_topic_id,
    targetTopicId: relation.target_topic_id,
    relationType: relation.relation_type as MindmapRelation['relationType'],
    confidence: Number(relation.confidence),
    evidenceCount: relation.evidence_count,
    lastSeenOn: relation.last_seen_on,
  }))

  const latestGeneration: MindmapGeneration | null = generationResult.data
    ? {
        generationDate: generationResult.data.generation_date,
        status: generationResult.data.status as MindmapGeneration['status'],
        completedAt: generationResult.data.completed_at,
      }
    : null

  return (
    <section className="page-enter">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-7">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Knowledge map</p>
          <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">스터디 마인드맵</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
            팀원의 기록을 주제별로 연결해, 배움이 어디에서 만나고 이어지는지 살펴봅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {configured && (
            <span className="rounded-full border border-hairline bg-white px-3 py-1.5 font-mono text-[10px] font-semibold text-ink/42">
              {topics.length} TOPICS
            </span>
          )}
        </div>
      </header>

      <MindmapExplorer
        configured={configured}
        profiles={mapProfiles}
        topics={topics}
        notes={[...notesById.values()]}
        mappings={mappings}
        relations={relations}
        latestGeneration={latestGeneration}
      />
    </section>
  )
}
