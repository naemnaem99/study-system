import {
  parseAiResponse,
  filterValidConnections,
  assembleDigestMarkdown,
  type AiDigestResponse,
} from '@/lib/digest'

export type NoteForDigest = { authorSlug: string; authorName: string; title: string; bodyMd: string }

export type BuildDigestResult =
  | { status: 'skipped' }
  | { status: 'done'; bodyMd: string; hasConnections: boolean }
  | { status: 'failed'; errorMessage: string }

type 호출결과 = { ok: true; value: unknown } | { ok: false; message: string }

async function 안전호출(
  callAi: (notes: NoteForDigest[]) => Promise<unknown>,
  notes: NoteForDigest[],
): Promise<호출결과> {
  try {
    return { ok: true, value: await callAi(notes) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'AI 호출에 실패했습니다' }
  }
}

/** 이미 한 번 받은 AI 응답을 네트워크 재호출 없이 정리본으로 조립한다. */
export function buildDigestFromResponse(
  date: string,
  notes: NoteForDigest[],
  raw: unknown,
): BuildDigestResult {
  if (notes.length === 0) return { status: 'skipped' }

  const 파싱결과 = parseAiResponse(raw)
  if (!파싱결과.ok) {
    return { status: 'failed', errorMessage: 파싱결과.message }
  }

  const 응답: AiDigestResponse = 파싱결과.value
  const 오늘올린slug = new Set(notes.map((note) => note.authorSlug))
  const 이름맵 = new Map(notes.map((note) => [note.authorSlug, note.authorName]))
  const 유효연결 = filterValidConnections(응답.connections, 오늘올린slug)

  const bodyMd = assembleDigestMarkdown({
    date,
    oneLiner: 응답.one_liner,
    members: 응답.members
      .filter((member) => 이름맵.has(member.profile_slug))
      .map((member) => ({
        slug: member.profile_slug,
        displayName: 이름맵.get(member.profile_slug)!,
        summary: member.summary,
      })),
    connections: 유효연결.map((connection) => ({
      title: connection.title,
      detail: connection.detail,
      memberNames: connection.member_slugs.map((slug) => 이름맵.get(slug) ?? slug),
    })),
  })

  return { status: 'done', bodyMd, hasConnections: 유효연결.length > 0 }
}

/**
 * 기존 단위 테스트·호출자를 위한 호환 경로. 예외를 값으로 바꾸고, 무료 API
 * 할당량을 보호하기 위해 스키마 오류도 자동 재호출하지 않는다.
 */
export async function buildDigest(
  date: string,
  notes: NoteForDigest[],
  callAi: (notes: NoteForDigest[]) => Promise<unknown>,
): Promise<BuildDigestResult> {
  if (notes.length === 0) return { status: 'skipped' }

  const 호출 = await 안전호출(callAi, notes)
  if (!호출.ok) return { status: 'failed', errorMessage: 호출.message }
  return buildDigestFromResponse(date, notes, 호출.value)
}
