export type NoteInput = {
  title: string
  bodyMd: string
  studiedOn: string
}

export type ParseResult =
  | { ok: true; value: NoteInput }
  | { ok: false; message: string }

/**
 * 노트 폼의 액션 상태. 서버 액션과 클라이언트 폼이 함께 쓰므로
 * 어느 한쪽에 두지 않고 여기에 둔다. 두 곳에 같은 타입을 적어두면
 * 한쪽만 바뀌었을 때 조용히 어긋난다.
 */
export type NoteFormState = { error: string | null }

const 제목최대 = 200
const 본문최대 = 50_000
const 날짜형식 = /^\d{4}-\d{2}-\d{2}$/

function 실제로존재하는날짜인가(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  // '2026-02-31' 같은 값은 Date가 3월로 굴려버리므로 되돌려 비교한다.
  return d.toISOString().slice(0, 10) === s
}

export function parseNoteInput(raw: {
  title: unknown
  bodyMd: unknown
  studiedOn: unknown
}): ParseResult {
  if (typeof raw.title !== 'string' || typeof raw.bodyMd !== 'string' || typeof raw.studiedOn !== 'string') {
    return { ok: false, message: '입력값이 올바르지 않습니다' }
  }

  const title = raw.title.trim()
  const bodyMd = raw.bodyMd.trim()
  const studiedOn = raw.studiedOn.trim()

  if (title.length === 0) return { ok: false, message: '제목을 입력하세요' }
  if (title.length > 제목최대) return { ok: false, message: `제목은 ${제목최대}자까지 입력할 수 있습니다` }
  if (bodyMd.length === 0) return { ok: false, message: '내용을 입력하세요' }
  if (bodyMd.length > 본문최대) return { ok: false, message: `내용은 ${본문최대}자까지 입력할 수 있습니다` }
  if (!날짜형식.test(studiedOn) || !실제로존재하는날짜인가(studiedOn)) {
    return { ok: false, message: '날짜 형식이 올바르지 않습니다' }
  }

  return { ok: true, value: { title, bodyMd, studiedOn } }
}
