'use client'

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { Markdown } from '@/components/Markdown'

export type MindmapProfile = {
  id: string
  displayName: string
  slug: string
  avatarUrl: string | null
}

export type MindmapNote = {
  id: string
  title: string
  bodyMd: string
  studiedOn: string
  updatedAt: string
  author: MindmapProfile
}

export type MindmapTopic = {
  id: string
  name: string
  slug: string
  parentId: string | null
  summaryMd: string
  status: 'active' | 'suggested' | 'unclassified' | 'archived'
  updatedAt: string
}

export type MindmapMapping = {
  noteId: string
  topicId: string
  confidence: number
  reason: string
  source: 'ai' | 'manual' | 'fallback'
  reviewStatus: 'pending' | 'approved' | 'rejected'
}

export type MindmapRelation = {
  sourceTopicId: string
  targetTopicId: string
  relationType: 'related' | 'prerequisite' | 'applies' | 'contrasts'
  confidence: number
  evidenceCount: number
  lastSeenOn: string
}

export type MindmapGeneration = {
  generationDate: string
  status: 'generating' | 'done' | 'failed'
  completedAt: string | null
}

type ViewMode = 'graph' | 'list' | 'recent'
type Selection = { kind: 'topic' | 'note'; id: string }

type Point = { x: number; y: number }
type GraphNode =
  | { kind: 'topic'; id: string; point: Point; count: number }
  | { kind: 'note'; id: string; topicId: string; point: Point }

const 기간옵션 = [
  { value: 'all', label: '전체 기간' },
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
  { value: '90', label: '최근 90일' },
]

const 관계이름: Record<MindmapRelation['relationType'], string> = {
  related: '관련',
  prerequisite: '선행 지식',
  applies: '응용',
  contrasts: '대조',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function cutoffDate(days: number): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (days - 1))
  return date.toISOString().slice(0, 10)
}

function graphLayout(
  topics: MindmapTopic[],
  notes: MindmapNote[],
  mappings: MindmapMapping[],
): GraphNode[] {
  const topicNodes: GraphNode[] = topics.slice(0, 18).map((topic, index, all) => {
    const angle = -Math.PI / 2 + (index / Math.max(all.length, 1)) * Math.PI * 2
    const isChild = Boolean(topic.parentId)
    const radiusX = isChild ? 390 : 300
    const radiusY = isChild ? 245 : 195
    return {
      kind: 'topic',
      id: topic.id,
      point: { x: 500 + Math.cos(angle) * radiusX, y: 310 + Math.sin(angle) * radiusY },
      count: new Set(mappings.filter((mapping) => mapping.topicId === topic.id).map((mapping) => mapping.noteId)).size,
    }
  })

  const topicPoints = new Map(
    topicNodes.filter((node): node is Extract<GraphNode, { kind: 'topic' }> => node.kind === 'topic')
      .map((node) => [node.id, node.point]),
  )
  const noteIndexByTopic = new Map<string, number>()
  const noteNodes: GraphNode[] = []

  for (const note of notes.slice(0, 24)) {
    const topicId = mappings.find((mapping) => mapping.noteId === note.id && topicPoints.has(mapping.topicId))?.topicId
    if (!topicId) continue
    const anchor = topicPoints.get(topicId)!
    const index = noteIndexByTopic.get(topicId) ?? 0
    noteIndexByTopic.set(topicId, index + 1)
    const angle = index * 1.72 + (anchor.x > 500 ? 0 : Math.PI)
    const distance = 55 + (index % 2) * 22
    noteNodes.push({
      kind: 'note',
      id: note.id,
      topicId,
      point: {
        x: clamp(anchor.x + Math.cos(angle) * distance, 30, 970),
        y: clamp(anchor.y + Math.sin(angle) * distance, 28, 592),
      },
    })
  }

  return [...topicNodes, ...noteNodes]
}

function statusCopy(status: MindmapTopic['status']) {
  if (status === 'unclassified') return '분류 대기'
  if (status === 'suggested') return 'AI 제안'
  return '팀 주제'
}

export function MindmapExplorer({
  configured,
  profiles,
  topics,
  notes,
  mappings,
  relations,
  latestGeneration,
}: {
  configured: boolean
  profiles: MindmapProfile[]
  topics: MindmapTopic[]
  notes: MindmapNote[]
  mappings: MindmapMapping[]
  relations: MindmapRelation[]
  latestGeneration: MindmapGeneration | null
}) {
  const [view, setView] = useState<ViewMode>('graph')
  const [member, setMember] = useState('all')
  const [period, setPeriod] = useState('all')
  const [topicFilter, setTopicFilter] = useState('all')
  const [selection, setSelection] = useState<Selection | null>(
    topics[0] ? { kind: 'topic', id: topics[0].id } : null,
  )
  const [mobileDetail, setMobileDetail] = useState(false)

  const filtered = useMemo(() => {
    const periodStart = period === 'all' ? null : cutoffDate(Number(period))
    let filteredNotes = notes.filter((note) => {
      if (member !== 'all' && note.author.slug !== member) return false
      if (periodStart && note.studiedOn < periodStart) return false
      return true
    })

    if (topicFilter !== 'all') {
      const noteIds = new Set(mappings.filter((mapping) => mapping.topicId === topicFilter).map((mapping) => mapping.noteId))
      filteredNotes = filteredNotes.filter((note) => noteIds.has(note.id))
    }

    const noteIds = new Set(filteredNotes.map((note) => note.id))
    const filteredMappings = mappings.filter((mapping) => noteIds.has(mapping.noteId))
    const topicIds = new Set(filteredMappings.map((mapping) => mapping.topicId))
    const filteredTopics = topics.filter((topic) => topicIds.has(topic.id))
    const filteredRelations = relations.filter(
      (relation) => topicIds.has(relation.sourceTopicId) && topicIds.has(relation.targetTopicId),
    )

    return { notes: filteredNotes, mappings: filteredMappings, topics: filteredTopics, relations: filteredRelations }
  }, [member, period, topicFilter, mappings, notes, relations, topics])

  const graphNodes = useMemo(
    () => graphLayout(filtered.topics, filtered.notes, filtered.mappings),
    [filtered],
  )
  const graphNodeMap = new Map(graphNodes.map((node) => [`${node.kind}:${node.id}`, node]))
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]))
  const noteMap = new Map(notes.map((note) => [note.id, note]))
  const noteTopics = (noteId: string) => mappings
    .filter((mapping) => mapping.noteId === noteId)
    .map((mapping) => topicMap.get(mapping.topicId))
    .filter((topic): topic is MindmapTopic => Boolean(topic))

  function selectNode(next: Selection) {
    setSelection(next)
    setMobileDetail(true)
  }

  const selectedTopic = selection?.kind === 'topic' ? topicMap.get(selection.id) : null
  const selectedNote = selection?.kind === 'note' ? noteMap.get(selection.id) : null
  const selectedTopicNotes = selectedTopic
    ? filtered.notes.filter((note) => filtered.mappings.some(
        (mapping) => mapping.noteId === note.id && mapping.topicId === selectedTopic.id,
      ))
    : []
  const selectedRelations = selectedTopic
    ? filtered.relations
        .filter((relation) => relation.sourceTopicId === selectedTopic.id || relation.targetTopicId === selectedTopic.id)
        .map((relation) => ({
          relation,
          topic: topicMap.get(
            relation.sourceTopicId === selectedTopic.id ? relation.targetTopicId : relation.sourceTopicId,
          ),
        }))
        .filter((item): item is { relation: MindmapRelation; topic: MindmapTopic } => Boolean(item.topic))
    : []

  const detailPanel = (
    <aside className="h-full min-h-[520px] overflow-y-auto bg-white lg:border-l lg:border-hairline" aria-live="polite">
      <div className="sticky top-0 z-10 flex items-center border-b border-hairline bg-white/95 px-5 py-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setMobileDetail(false)}
          className="mr-3 rounded-lg p-2 text-ink/55 transition-colors hover:bg-mist hover:text-study lg:hidden"
          aria-label="마인드맵으로 돌아가기"
        >
          ←
        </button>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-study">
          {selectedNote ? 'Study record' : selectedTopic ? 'Topic notes' : 'Knowledge detail'}
        </p>
      </div>

      {!selection && (
        <div className="grid min-h-[440px] place-items-center px-8 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-mist text-study">↗</span>
            <p className="mt-5 text-sm font-bold text-ink/70">주제나 기록을 선택하세요.</p>
            <p className="mt-2 text-xs leading-5 text-ink/45">선택한 노드의 근거 기록이 이곳에 열립니다.</p>
          </div>
        </div>
      )}

      {selectedTopic && (
        <div className="px-6 py-7">
          <div className="flex items-start gap-4">
            <span className="growth-ring relative mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-study text-xs font-bold text-white">
              {selectedTopic.name.slice(0, 1)}
            </span>
            <div>
              <span className="rounded-full bg-mist px-2.5 py-1 font-mono text-[9px] font-semibold text-study">
                {statusCopy(selectedTopic.status)}
              </span>
              <h2 className="font-display mt-3 text-2xl font-bold leading-tight text-ink">{selectedTopic.name}</h2>
            </div>
          </div>
          <p className="mt-6 text-sm leading-7 text-ink/62">
            {selectedTopic.summaryMd || '이 주제에 연결된 기록을 바탕으로 요약이 채워집니다.'}
          </p>
          {selectedRelations.length > 0 && (
            <div className="mt-6 rounded-2xl bg-mist/65 p-4">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/38">Connected topics</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedRelations.map(({ relation, topic }) => (
                  <button
                    type="button"
                    key={`${relation.sourceTopicId}-${relation.targetTopicId}-${relation.relationType}`}
                    onClick={() => selectNode({ kind: 'topic', id: topic.id })}
                    className="rounded-full border border-hairline bg-white px-3 py-1.5 text-[10px] font-semibold text-ink/60 transition-colors hover:border-study hover:text-study"
                  >
                    {topic.name} · {관계이름[relation.relationType]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-7 flex items-center justify-between border-b border-hairline pb-3">
            <h3 className="text-xs font-bold text-ink">근거 기록</h3>
            <span className="font-mono text-[10px] text-ink/38">{selectedTopicNotes.length} notes</span>
          </div>
          {selectedTopicNotes.length === 0 ? (
            <p className="py-8 text-xs leading-5 text-ink/42">현재 필터에서 연결된 기록이 없습니다.</p>
          ) : (
            <ol>
              {selectedTopicNotes.map((note) => (
                <li key={note.id} className="border-b border-hairline">
                  <button
                    type="button"
                    onClick={() => selectNode({ kind: 'note', id: note.id })}
                    className="group w-full px-1 py-4 text-left"
                  >
                    <span className="font-mono text-[10px] text-ink/35">{note.studiedOn} · {note.author.displayName}</span>
                    <span className="mt-1.5 block text-sm font-bold text-ink transition-colors group-hover:text-study">{note.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {selectedNote && (
        <article className="px-6 py-7">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-mist text-xs font-bold text-study">
              {selectedNote.author.displayName.slice(0, 1)}
            </span>
            <div>
              <p className="text-xs font-bold text-ink">{selectedNote.author.displayName}</p>
              <p className="font-mono text-[10px] text-ink/38">{selectedNote.studiedOn}</p>
            </div>
          </div>
          <h2 className="font-display mt-6 text-2xl font-bold leading-snug text-ink">{selectedNote.title}</h2>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {noteTopics(selectedNote.id).map((topic) => (
              <button
                type="button"
                key={topic.id}
                onClick={() => selectNode({ kind: 'topic', id: topic.id })}
                className="rounded-full bg-mist px-2.5 py-1 text-[10px] font-semibold text-study transition-colors hover:bg-study hover:text-white"
              >
                {topic.name}
              </button>
            ))}
          </div>
          <div className="mt-7 border-t border-hairline pt-2 [&_.markdown]:text-sm [&_.markdown]:leading-7">
            <Markdown>{selectedNote.bodyMd}</Markdown>
          </div>
          <Link
            href={`/notes/${selectedNote.id}`}
            className="mt-7 inline-flex min-h-10 items-center rounded-xl bg-study px-4 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-ink"
          >
            전체 기록 열기&nbsp; →
          </Link>
        </article>
      )}
    </aside>
  )

  if (!configured) {
    return (
      <div className="grid min-h-[480px] place-items-center rounded-[24px] border border-dashed border-hairline bg-mist/30 px-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-xl text-study shadow-[0_10px_30px_rgba(25,53,42,0.06)]">⌁</span>
          <h2 className="font-display mt-6 text-xl font-bold text-ink">마인드맵 데이터베이스 연결이 필요합니다</h2>
          <p className="mt-3 text-sm leading-6 text-ink/52">
            마인드맵 마이그레이션을 적용하면 다음 23:50 생성부터 주제와 기록의 연결이 저장됩니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-hairline pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-1" role="tablist" aria-label="마인드맵 보기">
          {(['graph', 'list', 'recent'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => {
                setView(mode)
                setMobileDetail(false)
              }}
              className={`relative min-h-11 px-4 text-xs font-bold transition-colors ${view === mode ? 'text-study' : 'text-ink/42 hover:text-ink'}`}
            >
              {mode === 'graph' ? 'Graph' : mode === 'list' ? 'List' : 'Recent'}
              {view === mode && <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded-full bg-study" />}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="sr-only" htmlFor="map-member">참여자</label>
          <select id="map-member" value={member} onChange={(event) => setMember(event.target.value)} className="min-h-10 rounded-xl border border-hairline bg-white px-3 text-xs font-semibold text-ink/65 outline-none transition-colors focus:border-study">
            <option value="all">전체 참여자</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.slug}>{profile.displayName}</option>)}
          </select>
          <label className="sr-only" htmlFor="map-period">기간</label>
          <select id="map-period" value={period} onChange={(event) => setPeriod(event.target.value)} className="min-h-10 rounded-xl border border-hairline bg-white px-3 text-xs font-semibold text-ink/65 outline-none transition-colors focus:border-study">
            {기간옵션.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="map-topic">주제</label>
          <select id="map-topic" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="min-h-10 rounded-xl border border-hairline bg-white px-3 text-xs font-semibold text-ink/65 outline-none transition-colors focus:border-study">
            <option value="all">전체 주제</option>
            {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-hairline bg-white shadow-[0_18px_60px_rgba(25,53,42,0.06)] lg:grid lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_370px]">
        <section className={`${mobileDetail ? 'hidden lg:block' : 'block'} min-w-0`}>
          {filtered.notes.length === 0 ? (
            <div className="grid min-h-[560px] place-items-center bg-mist/25 px-6 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-study shadow-sm">○</span>
                <p className="mt-5 text-sm font-bold text-ink/70">조건에 맞는 지식 연결이 없습니다.</p>
                <p className="mt-2 text-xs text-ink/42">참여자·기간·주제 필터를 바꿔보세요.</p>
              </div>
            </div>
          ) : view === 'graph' ? (
            <div className="knowledge-canvas relative min-h-[620px] overflow-hidden bg-[radial-gradient(circle_at_center,#fbfdfb_0%,#f0f7f3_68%,#eaf3ed_100%)]">
              <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(#74b892_1px,transparent_1px)] [background-size:30px_30px]" />
              <svg className="absolute inset-0 size-full" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
                {graphNodes.filter((node) => node.kind === 'topic').map((node) => {
                  const topic = topicMap.get(node.id)!
                  const parent = topic.parentId ? graphNodeMap.get(`topic:${topic.parentId}`) : null
                  const from = parent?.point ?? { x: 500, y: 310 }
                  return <line key={`branch-${node.id}`} x1={from.x} y1={from.y} x2={node.point.x} y2={node.point.y} className="knowledge-branch" />
                })}
                {filtered.relations.map((relation) => {
                  const source = graphNodeMap.get(`topic:${relation.sourceTopicId}`)
                  const target = graphNodeMap.get(`topic:${relation.targetTopicId}`)
                  if (!source || !target) return null
                  return <line key={`${relation.sourceTopicId}-${relation.targetTopicId}-${relation.relationType}`} x1={source.point.x} y1={source.point.y} x2={target.point.x} y2={target.point.y} className="knowledge-relation" />
                })}
                {graphNodes.filter((node): node is Extract<GraphNode, { kind: 'note' }> => node.kind === 'note').map((node) => {
                  const topic = graphNodeMap.get(`topic:${node.topicId}`)
                  if (!topic) return null
                  return <line key={`note-${node.id}`} x1={topic.point.x} y1={topic.point.y} x2={node.point.x} y2={node.point.y} className="knowledge-note-line" />
                })}
              </svg>

              <button
                type="button"
                className="growth-ring absolute left-1/2 top-1/2 z-10 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-study px-3 text-center text-xs font-bold leading-4 text-white shadow-[0_18px_45px_rgba(47,125,90,0.24)]"
                onClick={() => setSelection(null)}
              >
                Study<br />Grove
              </button>

              {graphNodes.map((node) => {
                const selected = selection?.kind === node.kind && selection.id === node.id
                const style = { left: `${node.point.x / 10}%`, top: `${node.point.y / 6.2}%` } as CSSProperties
                if (node.kind === 'note') {
                  const note = noteMap.get(node.id)
                  if (!note) return null
                  return (
                    <button
                      type="button"
                      key={`note-node-${node.id}`}
                      style={style}
                      onClick={() => selectNode({ kind: 'note', id: node.id })}
                      title={`${note.author.displayName} · ${note.title}`}
                      aria-label={`기록: ${note.title}`}
                      className={`knowledge-node-note absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full ${selected ? 'is-selected' : ''}`}
                    />
                  )
                }

                const topic = topicMap.get(node.id)
                if (!topic) return null
                const size = node.count >= 4 ? 'size-[82px]' : node.count >= 2 ? 'size-[72px]' : 'size-[64px]'
                return (
                  <button
                    type="button"
                    key={`topic-node-${node.id}`}
                    style={style}
                    onClick={() => selectNode({ kind: 'topic', id: node.id })}
                    className={`knowledge-node-topic absolute z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border px-2 text-center text-[10px] font-bold leading-3.5 shadow-sm ${size} ${selected ? 'is-selected' : ''} ${topic.status === 'unclassified' ? 'is-unclassified' : ''}`}
                  >
                    <span className="line-clamp-2 break-keep">{topic.name}</span>
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-white font-mono text-[8px] text-study shadow-sm">{node.count}</span>
                  </button>
                )
              })}

              <div className="absolute bottom-4 left-4 rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-[9px] leading-4 text-ink/42 backdrop-blur">
                큰 원 주제 · 작은 점 기록 · 점선 주제 관계
              </div>
            </div>
          ) : view === 'list' ? (
            <ol className="divide-y divide-hairline">
              {filtered.topics.map((topic) => {
                const topicNotes = filtered.notes.filter((note) => filtered.mappings.some((mapping) => mapping.noteId === note.id && mapping.topicId === topic.id))
                const authors = [...new Set(topicNotes.map((note) => note.author.displayName))]
                return (
                  <li key={topic.id}>
                    <button type="button" onClick={() => selectNode({ kind: 'topic', id: topic.id })} className="group grid w-full gap-3 px-5 py-5 text-left transition-colors hover:bg-mist/55 sm:grid-cols-[52px_1fr_auto] sm:items-center">
                      <span className="grid size-11 place-items-center rounded-full bg-mist text-xs font-bold text-study transition-all group-hover:bg-study group-hover:text-white">{topic.name.slice(0, 1)}</span>
                      <span>
                        <span className="block text-sm font-bold text-ink group-hover:text-study">{topic.name}</span>
                        <span className="mt-1 block line-clamp-1 text-xs text-ink/45">{topic.summaryMd || '연결된 기록을 확인하세요.'}</span>
                      </span>
                      <span className="font-mono text-[10px] text-ink/38">{topicNotes.length} notes · {authors.join(', ')}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <ol className="divide-y divide-hairline">
              {[...filtered.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => selectNode({ kind: 'note', id: note.id })} className="group w-full px-6 py-5 text-left transition-colors hover:bg-mist/55">
                    <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-ink/38">
                      <span>{note.studiedOn}</span><span>·</span><span>{note.author.displayName}</span>
                    </span>
                    <span className="mt-2 block text-sm font-bold text-ink transition-colors group-hover:text-study">{note.title}</span>
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {noteTopics(note.id).map((topic) => <span key={topic.id} className="rounded-full bg-mist px-2 py-1 text-[9px] font-semibold text-study">{topic.name}</span>)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className={`${mobileDetail ? 'block' : 'hidden'} lg:block`}>{detailPanel}</div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 font-mono text-[10px] text-ink/38">
        <span>{filtered.topics.length} topics · {filtered.notes.length} records · {filtered.relations.length} relations</span>
        <span>
          {latestGeneration?.status === 'done'
            ? `최근 동기화 ${latestGeneration.generationDate}`
            : latestGeneration?.status === 'failed'
              ? `${latestGeneration.generationDate} 분류 재시도 대기`
              : latestGeneration?.status === 'generating'
                ? '지식 지도를 정리하는 중'
                : '첫 23:50 생성을 기다리는 중'}
        </span>
      </div>
    </div>
  )
}
