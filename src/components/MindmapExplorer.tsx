'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
  evidenceQuote: string
  evidenceVerified: boolean
  source: 'ai' | 'manual' | 'fallback'
  validationStatus: 'validated' | 'provisional' | 'unclassified'
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

type ViewMode = 'graph' | 'records'
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
    const distance = 40 + (index % 2) * 14
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

function validationCopy(status: MindmapMapping['validationStatus']) {
  if (status === 'validated') return '자동 확정'
  if (status === 'provisional') return '임시 연결'
  return '미분류'
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
  const [selection, setSelection] = useState<Selection | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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
  const topicGroups = useMemo(() => filtered.topics
    .map((topic) => ({
      topic,
      notes: filtered.notes
        .filter((note) => filtered.mappings.some(
          (mapping) => mapping.noteId === note.id && mapping.topicId === topic.id,
        ))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .filter((group) => group.notes.length > 0)
    .sort((a, b) => b.notes.length - a.notes.length || a.topic.name.localeCompare(b.topic.name, 'ko')),
  [filtered])
  const graphNodeMap = new Map(graphNodes.map((node) => [`${node.kind}:${node.id}`, node]))
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]))
  const noteMap = new Map(notes.map((note) => [note.id, note]))
  const noteTopicLinks = (noteId: string) => mappings
    .filter((mapping) => mapping.noteId === noteId)
    .map((mapping) => ({ mapping, topic: topicMap.get(mapping.topicId) }))
    .filter((item): item is { mapping: MindmapMapping; topic: MindmapTopic } => Boolean(item.topic))

  function selectNode(next: Selection) {
    setSelection(next)
    setDetailOpen(true)
  }

  function closeDetail() {
    setDetailOpen(false)
    setSelection(null)
  }

  useEffect(() => {
    if (!detailOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailOpen(false)
        setSelection(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [detailOpen])

  const selectedTopic = selection?.kind === 'topic' ? topicMap.get(selection.id) : null
  const selectedNote = selection?.kind === 'note' ? noteMap.get(selection.id) : null
  const selectedNoteLinks = selectedNote ? noteTopicLinks(selectedNote.id) : []
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
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={selectedNote ? '학습 기록 상세' : selectedTopic ? '주제 상세' : '지식 상세'}
      className={`knowledge-detail-panel fixed right-0 z-[70] w-full overflow-y-auto border-l border-hairline bg-white sm:right-5 sm:w-[min(760px,calc(100vw-80px))] sm:rounded-[24px] sm:border ${selectedNote ? 'inset-y-0 sm:inset-y-5' : 'inset-y-0 sm:bottom-auto sm:top-5 sm:max-h-[calc(100vh-40px)] sm:min-h-[420px]'}`}
      aria-live="polite"
    >
      <div className="sticky top-0 z-10 flex items-center border-b border-hairline bg-white/95 px-5 py-4 backdrop-blur">
        <button
          type="button"
          onClick={closeDetail}
          className="mr-3 grid size-9 place-items-center rounded-full border border-hairline text-lg text-ink/55 transition-all hover:border-study hover:bg-mist hover:text-study"
          aria-label="상세 닫기"
        >
          ×
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
        <div className="mx-auto max-w-6xl px-6 py-8 sm:px-9 lg:px-12 lg:py-10">
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
        <article className="mx-auto max-w-6xl px-6 py-8 sm:px-9 lg:px-12 lg:py-10">
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
            {selectedNoteLinks.map(({ mapping, topic }) => (
              <button
                type="button"
                key={topic.id}
                onClick={() => selectNode({ kind: 'topic', id: topic.id })}
                title={`${validationCopy(mapping.validationStatus)} · ${Math.round(mapping.confidence * 100)}%`}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors hover:bg-study hover:text-white ${mapping.validationStatus === 'validated' ? 'bg-mist text-study' : 'border border-dashed border-study/30 bg-white text-study/70'}`}
              >
                {topic.name}
              </button>
            ))}
          </div>
          {selectedNoteLinks.length > 0 && (
            <div className="mt-7 rounded-2xl bg-mist/55 p-4 sm:p-5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/38">AI classification evidence</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {selectedNoteLinks.map(({ mapping, topic }) => (
                  <div key={`evidence-${topic.id}`} className="rounded-xl border border-white/80 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-ink">{topic.name}</span>
                      <span className="font-mono text-[9px] text-study">
                        {validationCopy(mapping.validationStatus)} · {Math.round(mapping.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-ink/55">
                      {mapping.evidenceVerified && mapping.evidenceQuote ? `“${mapping.evidenceQuote}”` : mapping.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-9 max-w-[78ch] border-t border-hairline pt-5 [&_.markdown]:text-sm [&_.markdown]:leading-8">
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

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-hairline pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-1" role="tablist" aria-label="마인드맵 보기">
          {([
            { mode: 'graph', label: '마인드맵' },
            { mode: 'records', label: '주제별 기록' },
          ] as { mode: ViewMode; label: string }[]).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={view === mode}
              onClick={() => {
                setView(mode)
                setDetailOpen(false)
                setSelection(null)
              }}
              className={`relative min-h-11 px-4 text-xs font-bold transition-colors ${view === mode ? 'text-study' : 'text-ink/42 hover:text-ink'}`}
            >
              {label}
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

      <div className="mt-5 overflow-hidden rounded-[26px] border border-hairline bg-white shadow-[0_20px_70px_rgba(25,53,42,0.07)]">
        <section className="min-w-0">
          {!configured ? (
            <div className="grid min-h-[560px] place-items-center bg-mist/25 px-6 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-white text-xl text-study shadow-[0_10px_30px_rgba(25,53,42,0.06)]">⌁</span>
                <h2 className="font-display mt-6 text-xl font-bold text-ink">마인드맵 데이터 연결을 확인해 주세요</h2>
                <p className="mt-3 text-sm leading-6 text-ink/52">
                  데이터베이스 연결이 복구되면 각 팀원이 저장한 학습 기록을 바탕으로 주제와 기록의 연결을 다시 불러옵니다.
                </p>
              </div>
            </div>
          ) : filtered.notes.length === 0 ? (
            <div className="grid min-h-[560px] place-items-center bg-mist/25 px-6 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-study shadow-sm">○</span>
                <p className="mt-5 text-sm font-bold text-ink/70">아직 연결된 지식 지도가 없습니다.</p>
                <p className="mt-2 text-xs leading-5 text-ink/42">
                  각 팀원이 저장한 학습 기록을 AI가 매일 23:50 KST에 주제별로 분류하고 연결합니다.
                </p>
              </div>
            </div>
          ) : view === 'graph' ? (
            <div className="knowledge-canvas relative min-h-[680px] overflow-hidden bg-[radial-gradient(circle_at_center,#fbfdfb_0%,#f0f7f3_68%,#eaf3ed_100%)]">
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
                className="knowledge-root-node growth-ring absolute left-1/2 top-1/2 z-10 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-study px-3 text-center text-xs font-bold leading-4 text-white"
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
                      data-tooltip={`${note.author.displayName} · ${note.title}`}
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

              <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border border-white/90 bg-white/88 px-3.5 py-2.5 font-mono text-[11px] font-medium leading-5 text-ink/58 shadow-[0_8px_24px_rgba(25,53,42,0.08)] backdrop-blur-sm">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-study/35 bg-white" />큰 원 주제</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-leaf" />작은 점 기록</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-study/45" />점선 주제 관계</span>
              </div>
            </div>
          ) : (
            <div className="bg-mist/25 px-5 py-7 sm:px-8 sm:py-9">
              <div className="flex flex-col gap-2 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-study">Topic library</p>
                  <h2 className="font-display mt-2 text-2xl font-bold text-ink">주제로 모아보는 학습 기록</h2>
                  <p className="mt-2 text-xs leading-5 text-ink/48">같은 배움에 연결된 기록을 한 묶음으로 살펴봅니다.</p>
                </div>
                <span className="font-mono text-[10px] text-ink/38">{topicGroups.length}개 주제</span>
              </div>

              <div className="mt-6 grid items-start gap-5 xl:grid-cols-2">
                {topicGroups.map(({ topic, notes: topicNotes }) => (
                  <article key={topic.id} className="overflow-hidden rounded-[22px] border border-hairline bg-white shadow-[0_12px_34px_rgba(25,53,42,0.045)]">
                    <button
                      type="button"
                      onClick={() => selectNode({ kind: 'topic', id: topic.id })}
                      className="group flex w-full items-start gap-4 border-b border-hairline px-5 py-5 text-left transition-colors hover:bg-mist/45 sm:px-6"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-study text-sm font-bold text-white shadow-[0_8px_22px_rgba(47,125,90,0.2)]">
                        {topic.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-lg font-bold text-ink transition-colors group-hover:text-study">{topic.name}</span>
                          <span className="rounded-full bg-mist px-2 py-1 font-mono text-[8px] font-semibold text-study">{statusCopy(topic.status)}</span>
                        </span>
                        <span className="mt-2 block line-clamp-2 text-xs leading-5 text-ink/48">{topic.summaryMd || '이 주제에 연결된 기록입니다.'}</span>
                      </span>
                      <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[9px] text-ink/45">{topicNotes.length}</span>
                    </button>

                    <ol className="divide-y divide-hairline">
                      {topicNotes.map((note) => (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => selectNode({ kind: 'note', id: note.id })}
                            className="group w-full px-5 py-4 text-left transition-colors hover:bg-mist/45 sm:px-6"
                          >
                            <span className="block text-sm font-bold leading-6 text-ink transition-colors group-hover:text-study">{note.title}</span>
                            <span className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] text-ink/35">
                              <span>{note.author.displayName}</span>
                              <span aria-hidden="true">·</span>
                              <span>{note.studiedOn}</span>
                              <span className="ml-auto text-study/70">기록 열기 →</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {detailOpen && (
        <>
          <button
            type="button"
            aria-label="상세 닫기"
            onClick={closeDetail}
            className="knowledge-detail-backdrop fixed inset-0 z-[60] cursor-default"
          />
          {detailPanel}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 font-mono text-[10px] text-ink/38">
        <span>{filtered.topics.length} topics · {filtered.notes.length} records · {filtered.relations.length} relations</span>
        <span>
          {latestGeneration?.status === 'done'
            ? `최근 동기화 ${latestGeneration.generationDate}`
            : latestGeneration?.status === 'failed'
              ? `${latestGeneration.generationDate} 분류 재시도 대기`
              : latestGeneration?.status === 'generating'
                ? '지식 지도를 정리하는 중'
                : '저장된 학습 기록의 첫 23:50 분류를 기다리는 중'}
        </span>
      </div>
    </div>
  )
}
