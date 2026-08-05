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

/**
 * §8.2 처리 순서 중 AI 호출부터 마크다운 조립까지. DB에는 접근하지 않는다 —
 * 호출자가 notes를 조회해 넘기고, 결과를 저장하는 것도 호출자의 몫이다.
 * callAi를 주입받는 이유: 실제 구현은 Gemini를 부르고, 테스트는 목을 넣는다.
 */
export async function buildDigest(
  date: string,
  notes: NoteForDigest[],
  callAi: (notes: NoteForDigest[]) => Promise<unknown>,
): Promise<BuildDigestResult> {
  if (notes.length === 0) {
    return { status: 'skipped' }
  }

  let 파싱결과 = parseAiResponse(await callAi(notes))
  if (!파싱결과.ok) {
    // §8.2 Step 5: 스키마 검증 실패 시 1회 재시도.
    파싱결과 = parseAiResponse(await callAi(notes))
  }
  if (!파싱결과.ok) {
    return { status: 'failed', errorMessage: 파싱결과.message }
  }

  const 응답: AiDigestResponse = 파싱결과.value
  const 오늘올린slug = new Set(notes.map((n) => n.authorSlug))
  const 이름맵 = new Map(notes.map((n) => [n.authorSlug, n.authorName]))

  const 유효연결 = filterValidConnections(응답.connections, 오늘올린slug)

  const bodyMd = assembleDigestMarkdown({
    date,
    oneLiner: 응답.one_liner,
    // AI가 그날 올리지 않은 slug를 지어낼 수 있으므로 한 번 더 거른다.
    members: 응답.members
      .filter((m) => 이름맵.has(m.profile_slug))
      .map((m) => ({
        slug: m.profile_slug,
        displayName: 이름맵.get(m.profile_slug)!,
        summary: m.summary,
      })),
    connections: 유효연결.map((c) => ({
      title: c.title,
      detail: c.detail,
      memberNames: c.member_slugs.map((slug) => 이름맵.get(slug) ?? slug),
    })),
  })

  return { status: 'done', bodyMd, hasConnections: 유효연결.length > 0 }
}
