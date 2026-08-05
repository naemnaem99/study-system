export type MemberSummary = { profile_slug: string; summary: string }
export type Connection = { title: string; detail: string; member_slugs: string[] }
export type AiDigestResponse = {
  one_liner: string
  members: MemberSummary[]
  connections: Connection[]
}

export type ParseResult = { ok: true; value: AiDigestResponse } | { ok: false; message: string }

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

/** Gemini 응답(JSON)이 §7.2 스키마를 만족하는지 확인한다. 프롬프트 지시만 믿지 않는다. */
export function parseAiResponse(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'AI 응답이 객체가 아닙니다' }
  }
  const r = raw as Record<string, unknown>

  if (!isString(r.one_liner) || r.one_liner.trim().length === 0) {
    return { ok: false, message: 'one_liner가 없습니다' }
  }

  if (!Array.isArray(r.members)) {
    return { ok: false, message: 'members가 배열이 아닙니다' }
  }
  const members: MemberSummary[] = []
  for (const m of r.members) {
    if (typeof m !== 'object' || m === null) {
      return { ok: false, message: 'members 항목이 잘못됐습니다' }
    }
    const mm = m as Record<string, unknown>
    if (!isString(mm.profile_slug) || !isString(mm.summary)) {
      return { ok: false, message: 'members 항목에 profile_slug 또는 summary가 없습니다' }
    }
    members.push({ profile_slug: mm.profile_slug, summary: mm.summary })
  }
  if (members.length === 0) {
    return { ok: false, message: 'members가 비어 있습니다' }
  }

  if (!Array.isArray(r.connections)) {
    return { ok: false, message: 'connections가 배열이 아닙니다' }
  }
  const connections: Connection[] = []
  for (const c of r.connections) {
    if (typeof c !== 'object' || c === null) {
      return { ok: false, message: 'connections 항목이 잘못됐습니다' }
    }
    const cc = c as Record<string, unknown>
    if (!isString(cc.title) || !isString(cc.detail) || !Array.isArray(cc.member_slugs)) {
      return { ok: false, message: 'connections 항목의 형태가 잘못됐습니다' }
    }
    if (!cc.member_slugs.every(isString)) {
      return { ok: false, message: 'member_slugs에 문자열이 아닌 값이 있습니다' }
    }
    connections.push({ title: cc.title, detail: cc.detail, member_slugs: cc.member_slugs as string[] })
  }

  return { ok: true, value: { one_liner: r.one_liner, members, connections } }
}

/**
 * §8.4 억지 연결 방지의 코드 쪽 절반. 프롬프트만 믿지 않고 여기서 다시 검증한다.
 * member_slugs가 2명 이상이고, 전원이 그날 실제로 노트를 올린 사람일 때만 남긴다.
 */
export function filterValidConnections(
  connections: Connection[],
  오늘올린slug: Set<string>,
): Connection[] {
  return connections.filter(
    (c) => c.member_slugs.length >= 2 && c.member_slugs.every((slug) => 오늘올린slug.has(slug)),
  )
}

export type DigestMember = { slug: string; displayName: string; summary: string }
export type DigestConnection = { title: string; detail: string; memberNames: string[] }

/** §8.3 형식대로 정리본 마크다운을 조립한다. connections가 비어 있으면 그 섹션 자체를 만들지 않는다. */
export function assembleDigestMarkdown(input: {
  date: string
  oneLiner: string
  members: DigestMember[]
  connections: DigestConnection[]
}): string {
  const lines: string[] = []
  lines.push(`# ${input.date} 스터디 정리`, '')
  lines.push('## 오늘의 한 줄', input.oneLiner, '')
  lines.push('## 팀원별 요약')
  for (const m of input.members) {
    lines.push(`- **[${m.displayName}](/members/${m.slug})** — ${m.summary}`)
  }

  if (input.connections.length > 0) {
    lines.push('', '## 겹치는 지점')
    for (const c of input.connections) {
      lines.push(`### ${c.title}`, `${c.detail}  (${c.memberNames.join(', ')})`, '')
    }
  }

  return lines.join('\n').trim() + '\n'
}

/** '2026-08-05' → '2026-08-05-스터디정리.md' */
export function digestFileName(date: string): string {
  return `${date}-스터디정리.md`
}
