# 팀 스터디 허브 — 3단계 구현 계획 (AI 정리본)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그날 올라온 노트를 Gemini가 읽어 하나의 정리본으로 만들고, 웹에서 보고 `.md`로 내려받을 수 있게 한다. 수동 생성 API를 먼저 만들고 크론은 마지막에 등록한다 — 크론은 배포 후에만 검증할 수 있기 때문이다(설계 §13).

**Architecture:** AI 호출은 `lib/ai/gemini.ts` 한 곳에만 존재한다(설계 §5). 스키마 검증·연결 유효성 판정·마크다운 조립은 부수효과 없는 순수 함수로 분리해 AI를 실제로 부르지 않고도 단위 테스트로 고정한다(설계 §11 — "실제 AI를 호출하는 테스트는 작성하지 않는다"). 오케스트레이션 함수는 AI 호출부를 인자로 주입받아 목(mock)을 넣을 수 있게 한다. DB 접근이 필요한 파이프라인(노트 조회 → generating 기록 → AI 호출 → 결과 저장)은 이 순수 함수들을 감싸는 얇은 서버 전용 모듈 하나에만 둔다. 정리본 생성은 **service role 키**로 실행되며 RLS를 완전히 우회하므로, 두 API 라우트(`/api/cron/digest`, `/api/digests/[date]/generate`)는 각자 자체 인증을 반드시 수행한다(설계 §8.1.1).

**Tech Stack:** Next.js 15 (App Router, TypeScript), `@google/genai` (Gemini), `@supabase/supabase-js` (service role 클라이언트), Vitest, Vercel Cron

**설계 문서:** `docs/2026-08-05-team-study-hub-design.md` — §7.2(AI 응답 스키마), §8(정리본 파이프라인), §8.4(억지 연결 방지), §9.4(비밀 관리), §11(테스트)
**1·2단계 계획:** `docs/2026-08-05-study-hub-phase1-plan.md`, `docs/2026-08-05-study-hub-phase2-plan.md`

## Global Constraints

- Node.js 20 이상. Next.js 15 App Router + TypeScript, `src/` 디렉터리, import alias `@/*`
- 모든 날짜 계산은 `Asia/Seoul` 기준. 크론은 UTC로 실행되므로 대상 날짜는 반드시 `todayInSeoul()`로 구한다
- **`GEMINI_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다.** 클라이언트 컴포넌트가 import하는 모듈에 들어가면 안 된다
- **억지 연결을 절대 만들지 않는다** — 프롬프트 지시에만 의존하지 않고 코드로 재검증한다(설계 §8.4, 필수 요구사항)
- **실제 Gemini를 호출하는 테스트는 작성하지 않는다.** 무료 한도를 소모하고 응답이 비결정적이다(설계 §11)
- 무료 티어만 사용한다. Vercel Hobby 크론은 1일 1회만 가능하다
- 커밋 메시지는 한국어로 작성한다

---

## 시작 전 준비물

1. **Google AI Studio에서 Gemini API 키 발급** (aistudio.google.com, 무료, 결제 수단 불필요) — Task 3 시작 전에 필요
2. **`CRON_SECRET`** — 무작위 문자열이면 된다. 사람이 따로 발급받을 필요 없이 이 계획 실행 중에 생성한다
3. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`가 이미 설정돼 있어야 한다 (2단계에서 완료됨)

## 1·2단계에서 이어받는 것

```ts
// src/lib/auth.ts
type Profile = { id: string; display_name: string; slug: string; avatar_url: string | null }
async function getCurrentProfile(): Promise<Profile | null>   // 미등록·비로그인이면 null
async function getAllProfiles(): Promise<Profile[]>

// src/lib/supabase/server.ts
async function createSupabaseServerClient()   // 쿠키 기반, anon 키, RLS 적용됨

// src/lib/env.ts
function getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string }
function getServiceRoleKey(): string          // 브라우저에서 호출하면 throw

// src/lib/date.ts
function todayInSeoul(now?: Date): string     // 'YYYY-MM-DD' (KST 기준)

// src/components/Markdown.tsx
function Markdown({ children }: { children: string }): JSX.Element   // rehype-raw 없음, 원시 HTML 미실행
```

**이미 존재하는 DB 구조** (1단계 `0001_init.sql`에서 생성됨, 3단계에서 새 마이그레이션 불필요):

```sql
digests
  digest_date     date primary key
  body_md         text
  has_connections boolean not null default false
  status          text not null check (status in ('generating', 'done', 'failed'))
  model           text
  started_at      timestamptz
  generated_at    timestamptz
  error_message   text
```

`digests`는 읽기 정책만 있고(`digests_select`, 등록된 4명), 쓰기 정책은 없다 — service role만 쓸 수 있다. **이 마이그레이션을 다시 만들지 않는다.**

Nav(`src/components/Nav.tsx`)에는 이미 `/digests` 링크가 있다 — 지금은 라우트가 없어 404가 난다. 이 계획이 끝나면 정상 동작한다.

현재 테스트: 단위 30개 (`npm test`로 확인됨).

---

## File Structure

```
src/
├── lib/
│   ├── digest.ts                     순수: AI 응답 검증, 연결 유효성 판정, 마크다운 조립, 파일명
│   ├── digest-generation.ts          순수(AI 호출은 주입): buildDigest 오케스트레이션
│   ├── digest-pipeline.ts            서버 전용: DB 조회·기록을 곁들인 실제 파이프라인
│   ├── ai/
│   │   └── gemini.ts                 Gemini 호출부. AI 관련 코드는 여기 하나뿐
│   ├── env.ts                        (수정) getGeminiApiKey, getCronSecret 추가
│   └── supabase/
│       └── service.ts                service role 클라이언트 (서버 전용)
├── components/
│   └── RegenerateDigestButton.tsx    "다시 생성" 버튼 (클라이언트)
└── app/
    ├── api/
    │   ├── cron/digest/route.ts               POST, CRON_SECRET 인증
    │   └── digests/[date]/
    │       ├── generate/route.ts              POST, 세션 인증
    │       └── download/route.ts              GET, .md 다운로드
    └── (app)/
        ├── page.tsx                            (수정) 최근 정리본 링크 추가
        └── digests/
            ├── page.tsx                         목록
            └── [date]/page.tsx                  상세

tests/unit/
├── digest.test.ts
├── digest-generation.test.ts
└── cron-digest-route.test.ts

vercel.json                            크론 등록
```

**세 파일로 나누는 이유:**
- `digest.ts` — 부수효과 없음. 문자열·배열만 다룬다.
- `digest-generation.ts` — Gemini를 실제로 부르지 않고도 재시도·필터링 로직을 테스트하려면 AI 호출을 함수 인자로 받아야 한다. 여기서는 여전히 DB를 만지지 않는다.
- `digest-pipeline.ts` — 실제 Supabase 호출(조회·upsert)이 있는 유일한 곳. 단위 테스트 대상이 아니며, 두 API 라우트가 이 함수 하나를 공유해 로직이 갈라지지 않게 한다.

이 분리 덕분에 설계 §11.2의 네 가지 케이스(노트 0개 / 1개 / 빈 connections / 유효한 connections)를 실제 네트워크·DB 없이 전부 고정할 수 있다.

---

## Task 1: 스키마 검증·연결 유효성·마크다운 조립

**Files:**
- Create: `src/lib/digest.ts`
- Test: `tests/unit/digest.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type MemberSummary = { profile_slug: string; summary: string }`
  - `type Connection = { title: string; detail: string; member_slugs: string[] }`
  - `type AiDigestResponse = { one_liner: string; members: MemberSummary[]; connections: Connection[] }`
  - `type ParseResult = { ok: true; value: AiDigestResponse } | { ok: false; message: string }`
  - `function parseAiResponse(raw: unknown): ParseResult`
  - `function filterValidConnections(connections: Connection[], 오늘올린slug: Set<string>): Connection[]`
  - `type DigestMember = { slug: string; displayName: string; summary: string }`
  - `type DigestConnection = { title: string; detail: string; memberNames: string[] }`
  - `function assembleDigestMarkdown(input: { date: string; oneLiner: string; members: DigestMember[]; connections: DigestConnection[] }): string`
  - `function digestFileName(date: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/digest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseAiResponse,
  filterValidConnections,
  assembleDigestMarkdown,
  digestFileName,
} from '@/lib/digest'

describe('parseAiResponse', () => {
  const 정상 = {
    one_liner: '오늘은 다들 알고리즘을 공부했다',
    members: [{ profile_slug: 'jiho', summary: '이분 탐색 정리' }],
    connections: [],
  }

  it('정상 응답을 통과시킨다', () => {
    expect(parseAiResponse(정상).ok).toBe(true)
  })

  it('객체가 아니면 거부한다', () => {
    expect(parseAiResponse('문자열').ok).toBe(false)
    expect(parseAiResponse(null).ok).toBe(false)
  })

  it('one_liner가 없으면 거부한다', () => {
    const r = parseAiResponse({ ...정상, one_liner: undefined })
    expect(r.ok).toBe(false)
  })

  it('one_liner가 빈 문자열이면 거부한다', () => {
    expect(parseAiResponse({ ...정상, one_liner: '   ' }).ok).toBe(false)
  })

  it('members가 배열이 아니면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: 'x' }).ok).toBe(false)
  })

  it('members가 비어 있으면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: [] }).ok).toBe(false)
  })

  it('members 항목에 summary가 없으면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: [{ profile_slug: 'jiho' }] }).ok).toBe(false)
  })

  it('connections가 배열이 아니면 거부한다', () => {
    expect(parseAiResponse({ ...정상, connections: 'x' }).ok).toBe(false)
  })

  it('connections의 member_slugs에 문자열이 아닌 값이 있으면 거부한다', () => {
    const r = parseAiResponse({
      ...정상,
      connections: [{ title: 't', detail: 'd', member_slugs: [1, 2] }],
    })
    expect(r.ok).toBe(false)
  })
})

describe('filterValidConnections', () => {
  const 오늘 = new Set(['jiho', 'minsu'])

  it('2명 이상이고 전원이 그날 올린 사람이면 통과시킨다', () => {
    const r = filterValidConnections(
      [{ title: 't', detail: 'd', member_slugs: ['jiho', 'minsu'] }],
      오늘,
    )
    expect(r).toHaveLength(1)
  })

  it('1명뿐이면 거부한다', () => {
    const r = filterValidConnections([{ title: 't', detail: 'd', member_slugs: ['jiho'] }], 오늘)
    expect(r).toHaveLength(0)
  })

  it('그날 올리지 않은 사람이 섞여 있으면 거부한다', () => {
    const r = filterValidConnections(
      [{ title: 't', detail: 'd', member_slugs: ['jiho', 'seoyeon'] }],
      오늘,
    )
    expect(r).toHaveLength(0)
  })

  it('여러 항목 중 유효한 것만 남긴다', () => {
    const r = filterValidConnections(
      [
        { title: '유효', detail: 'd', member_slugs: ['jiho', 'minsu'] },
        { title: '무효', detail: 'd', member_slugs: ['jiho'] },
      ],
      오늘,
    )
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('유효')
  })
})

describe('assembleDigestMarkdown', () => {
  const 기본 = {
    date: '2026-08-05',
    oneLiner: '한 줄 요약',
    members: [{ slug: 'jiho', displayName: '지호', summary: '요약' }],
    connections: [],
  }

  it('제목에 날짜가 들어간다', () => {
    expect(assembleDigestMarkdown(기본)).toContain('# 2026-08-05 스터디 정리')
  })

  it('팀원 이름이 저장소 링크로 들어간다', () => {
    expect(assembleDigestMarkdown(기본)).toContain('[지호](/members/jiho)')
  })

  it('연결이 없으면 겹치는 지점 섹션이 나타나지 않는다', () => {
    expect(assembleDigestMarkdown(기본)).not.toContain('겹치는 지점')
  })

  it('연결이 있으면 겹치는 지점 섹션이 나타난다', () => {
    const md = assembleDigestMarkdown({
      ...기본,
      connections: [{ title: '공통 주제', detail: '둘 다 트리를 다뤘다', memberNames: ['지호', '민수'] }],
    })
    expect(md).toContain('## 겹치는 지점')
    expect(md).toContain('### 공통 주제')
    expect(md).toContain('(지호, 민수)')
  })
})

describe('digestFileName', () => {
  it('날짜 뒤에 -스터디정리.md를 붙인다', () => {
    expect(digestFileName('2026-08-05')).toBe('2026-08-05-스터디정리.md')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `@/lib/digest` 를 찾을 수 없음

- [ ] **Step 3: `src/lib/digest.ts` 구현**

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 48개 (기존 30개 + 이번 18개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/digest.ts tests/unit/digest.test.ts
git commit -m "정리본 스키마 검증·연결 필터·마크다운 조립 추가

AI 응답 검증은 프롬프트 지시만 믿지 않고 코드로 다시 확인한다.
연결 유효성 판정도 마찬가지다 — member_slugs가 2명 이상이고 전원이
그날 실제로 노트를 올린 사람일 때만 남긴다(설계 §8.4, 억지 연결 방지).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: 생성 오케스트레이션 (AI 호출 주입)

**Files:**
- Create: `src/lib/digest-generation.ts`
- Test: `tests/unit/digest-generation.test.ts`

**Interfaces:**
- Consumes: `parseAiResponse`, `filterValidConnections`, `assembleDigestMarkdown` (Task 1)
- Produces:
  - `type NoteForDigest = { authorSlug: string; authorName: string; title: string; bodyMd: string }`
  - `type BuildDigestResult = { status: 'skipped' } | { status: 'done'; bodyMd: string; hasConnections: boolean } | { status: 'failed'; errorMessage: string }`
  - `function buildDigest(date: string, notes: NoteForDigest[], callAi: (notes: NoteForDigest[]) => Promise<unknown>): Promise<BuildDigestResult>`

이 함수는 DB에도 네트워크에도 접근하지 않는다. `callAi`를 호출자가 주입하므로, 테스트는 실제 Gemini 없이 설계 §11.2의 네 가지 케이스를 전부 검증할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/digest-generation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildDigest, type NoteForDigest } from '@/lib/digest-generation'

const 노트1개: NoteForDigest[] = [
  { authorSlug: 'jiho', authorName: '지호', title: '이분 탐색', bodyMd: '내용' },
]
const 노트2개: NoteForDigest[] = [
  { authorSlug: 'jiho', authorName: '지호', title: '이분 탐색', bodyMd: '내용' },
  { authorSlug: 'minsu', authorName: '민수', title: '그래프', bodyMd: '내용' },
]

function 정상응답(overrides: { members?: unknown; connections?: unknown } = {}) {
  return {
    one_liner: '오늘 배운 것',
    members: overrides.members ?? [{ profile_slug: 'jiho', summary: '요약' }],
    connections: overrides.connections ?? [],
  }
}

describe('buildDigest', () => {
  it('노트가 0개면 생성하지 않는다', async () => {
    const callAi = vi.fn()
    const r = await buildDigest('2026-08-05', [], callAi)
    expect(r.status).toBe('skipped')
    expect(callAi).not.toHaveBeenCalled()
  })

  it('노트가 1개면 요약만 있고 겹치는 지점이 없다', async () => {
    const callAi = vi.fn().mockResolvedValue(정상응답())
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') {
      expect(r.hasConnections).toBe(false)
      expect(r.bodyMd).not.toContain('겹치는 지점')
    }
  })

  it('connections가 빈 배열이면 겹치는 지점 섹션이 마크다운에 없다', async () => {
    const callAi = vi.fn().mockResolvedValue(정상응답({ connections: [] }))
    const r = await buildDigest('2026-08-05', 노트2개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') expect(r.bodyMd).not.toContain('겹치는 지점')
  })

  it('유효한 연결이 있으면 겹치는 지점 섹션이 출력된다', async () => {
    const callAi = vi.fn().mockResolvedValue(
      정상응답({
        members: [
          { profile_slug: 'jiho', summary: '요약1' },
          { profile_slug: 'minsu', summary: '요약2' },
        ],
        connections: [{ title: '공통 주제', detail: '둘 다 탐색을 다뤘다', member_slugs: ['jiho', 'minsu'] }],
      }),
    )
    const r = await buildDigest('2026-08-05', 노트2개, callAi)
    expect(r.status).toBe('done')
    if (r.status === 'done') {
      expect(r.hasConnections).toBe(true)
      expect(r.bodyMd).toContain('겹치는 지점')
    }
  })

  it('스키마가 깨지면 1회 재시도하고, 재시도가 성공하면 정상 처리한다', async () => {
    const callAi = vi
      .fn()
      .mockResolvedValueOnce({ 이상한: '응답' })
      .mockResolvedValueOnce(정상응답())
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(r.status).toBe('done')
  })

  it('재시도까지 스키마가 깨지면 failed로 끝난다', async () => {
    const callAi = vi.fn().mockResolvedValue({ 이상한: '응답' })
    const r = await buildDigest('2026-08-05', 노트1개, callAi)
    expect(callAi).toHaveBeenCalledTimes(2)
    expect(r.status).toBe('failed')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `@/lib/digest-generation` 를 찾을 수 없음

- [ ] **Step 3: `src/lib/digest-generation.ts` 구현**

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 55개 (기존 48개 + 이번 7개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/digest-generation.ts tests/unit/digest-generation.test.ts
git commit -m "정리본 생성 오케스트레이션 추가 (AI 호출 주입)

buildDigest는 callAi를 인자로 받아 DB·네트워크 없이 테스트한다.
노트 0개/1개, 빈 connections, 유효한 connections, 스키마 재시도까지
설계 §11.2의 네 가지 케이스와 재시도 로직을 실제 Gemini 없이 고정했다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Gemini 모듈 + service role 클라이언트

**Files:**
- Modify: `src/lib/env.ts`
- Create: `src/lib/supabase/service.ts`
- Create: `src/lib/ai/gemini.ts`

**Interfaces:**
- Consumes: `NoteForDigest` (Task 2)
- Produces:
  - `function getGeminiApiKey(): string`
  - `function getCronSecret(): string`
  - `function createSupabaseServiceClient()`
  - `async function callGemini(notes: NoteForDigest[]): Promise<unknown>`

이 태스크는 실제 네트워크 호출을 담은 코드라 단위 테스트를 만들지 않는다(설계 §11 — "실제 AI를 호출하는 테스트는 작성하지 않는다"). 타입·린트 확인과, 마지막에 진짜 키로 한 번 호출해보는 수동 확인으로 대신한다.

- [ ] **Step 1: `.env.local`에 두 값 추가 (사람이 직접)**

```
GEMINI_API_KEY=<Google AI Studio에서 발급받은 키>
CRON_SECRET=<무작위 문자열 — openssl rand -hex 32 등으로 생성>
```

- [ ] **Step 2: `src/lib/env.ts`에 추가**

`필수()` 함수 아래, 기존 `getServiceRoleKey()` 다음에 추가한다:

```ts
/** Gemini API 키. 브라우저로 새어나가면 제3자가 무료 한도를 소진시킬 수 있다. */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Gemini API 키는 브라우저에서 접근할 수 없습니다')
  }
  return 필수('GEMINI_API_KEY')
}

/** 크론 인증용 비밀값. */
export function getCronSecret(): string {
  if (typeof window !== 'undefined') {
    throw new Error('CRON_SECRET은 브라우저에서 접근할 수 없습니다')
  }
  return 필수('CRON_SECRET')
}
```

- [ ] **Step 3: service role 클라이언트 작성**

`src/lib/supabase/service.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { getPublicEnv, getServiceRoleKey } from '@/lib/env'

/**
 * service role 키로 만든 클라이언트. RLS를 통째로 우회하므로 크론·정리본
 * 생성 API처럼 서버에서만, 그것도 자체 인증을 마친 뒤에만 써야 한다.
 * 쿠키·세션을 다루지 않는 단순 클라이언트다 — createSupabaseServerClient와 다르다.
 */
export function createSupabaseServiceClient() {
  const { supabaseUrl } = getPublicEnv()
  return createClient(supabaseUrl, getServiceRoleKey())
}
```

- [ ] **Step 4: 의존성 설치 및 Gemini 모듈 작성**

```bash
npm install @google/genai
```

`src/lib/ai/gemini.ts`:

```ts
import { GoogleGenAI, Type } from '@google/genai'
import { getGeminiApiKey } from '@/lib/env'
import type { NoteForDigest } from '@/lib/digest-generation'

const 모델 = 'gemini-2.5-flash'

const 응답스키마 = {
  type: Type.OBJECT,
  properties: {
    one_liner: { type: Type.STRING },
    members: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          profile_slug: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['profile_slug', 'summary'],
      },
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          member_slugs: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'detail', 'member_slugs'],
      },
    },
  },
  required: ['one_liner', 'members', 'connections'],
}

function 프롬프트(notes: NoteForDigest[]): string {
  const 노트목록 = notes
    .map((n) => `### ${n.authorName} (${n.authorSlug}) — ${n.title}\n${n.bodyMd}`)
    .join('\n\n')

  return `당신은 스터디 그룹의 하루 학습 내용을 정리하는 도우미입니다.
아래는 오늘 팀원들이 올린 학습 노트입니다.

${노트목록}

규칙:
- one_liner: 오늘 전체를 관통하는 한 줄 요약.
- members: 노트를 올린 사람마다 하나씩, profile_slug와 그 사람 노트의 핵심 요약.
- connections: 두 명 이상이 실제로 맞닿는 주제를 다뤘을 때만 적으세요.
  **억지로 연결을 만들지 마세요.** 겹치는 지점이 없으면 반드시 빈 배열을 반환하세요.
  "본질적으로 같은 사고방식" 같은 모호한 연결은 금지합니다.`
}

/**
 * Gemini 호출. 실제 네트워크 호출이라 단위 테스트 대상이 아니다 —
 * 재시도·검증·조립 로직은 lib/digest-generation.ts에서 목으로 테스트한다.
 */
export async function callGemini(notes: NoteForDigest[]): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() })

  const response = await client.models.generateContent({
    model: 모델,
    contents: 프롬프트(notes),
    config: {
      responseMimeType: 'application/json',
      responseSchema: 응답스키마,
    },
  })

  return JSON.parse(response.text ?? '{}')
}
```

- [ ] **Step 5: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 6: 실제 Gemini 호출 확인 (사람이 직접, 선택)**

`@google/genai`는 SDK이므로 버전에 따라 메서드 이름이 바뀔 수 있다. Task 4에서 수동 생성 API를 완성한 뒤 실제로 한 번 호출해 확인한다 — 지금은 타입 확인만으로 충분하다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/env.ts src/lib/supabase/service.ts src/lib/ai/gemini.ts package.json package-lock.json
git commit -m "Gemini 모듈과 service role 클라이언트 추가

AI 호출은 lib/ai/gemini.ts 한 곳에만 둔다 — 나중에 다른 제공자로
바꿀 때 이 모듈만 교체하면 된다(설계 §5).

GEMINI_API_KEY, CRON_SECRET은 getGeminiApiKey/getCronSecret으로만
읽는다. 둘 다 브라우저에서 호출하면 throw한다 — 기존 getServiceRoleKey와
같은 방어 패턴이다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: 생성 파이프라인 + 수동 생성 API

**Files:**
- Create: `src/lib/digest-pipeline.ts`
- Create: `src/app/api/digests/[date]/generate/route.ts`

**Interfaces:**
- Consumes: `buildDigest` (Task 2), `callGemini` (Task 3), `createSupabaseServiceClient` (Task 3), `getCurrentProfile` (1단계)
- Produces:
  - `type PipelineResult = { ok: true; skipped: boolean } | { ok: false; message: string }`
  - `async function runDigestPipeline(date: string): Promise<PipelineResult>`

`runDigestPipeline`은 인증을 하지 않는다 — 호출하는 라우트가 먼저 인증을 마쳐야 한다(설계 §8.1.1). 이 함수는 Task 5의 크론 라우트와도 공유된다.

- [ ] **Step 1: 파이프라인 작성**

`src/lib/digest-pipeline.ts`:

```ts
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { buildDigest, type NoteForDigest } from '@/lib/digest-generation'
import { callGemini } from '@/lib/ai/gemini'

export type PipelineResult = { ok: true; skipped: boolean } | { ok: false; message: string }

/**
 * §8.2 처리 순서 전체를 담당한다. service role로 실행되며 RLS를 우회하므로,
 * 이 함수 자체는 인증하지 않는다 — 호출자(라우트 핸들러)가 먼저 인증을 마쳐야 한다.
 */
export async function runDigestPipeline(date: string): Promise<PipelineResult> {
  const supabase = createSupabaseServiceClient()

  const { data: notes, error: 조회오류 } = await supabase
    .from('notes')
    .select('title, body_md, profiles(slug, display_name)')
    .eq('studied_on', date)

  if (조회오류) return { ok: false, message: '노트를 조회하지 못했습니다' }
  if (!notes || notes.length === 0) return { ok: true, skipped: true }

  const notesForDigest: NoteForDigest[] = notes.map((n) => {
    const p = n.profiles as unknown as { slug: string; display_name: string }
    return { authorSlug: p.slug, authorName: p.display_name, title: n.title, bodyMd: n.body_md }
  })

  await supabase
    .from('digests')
    .upsert({ digest_date: date, status: 'generating', started_at: new Date().toISOString() })

  const result = await buildDigest(date, notesForDigest, callGemini)

  if (result.status === 'failed') {
    await supabase
      .from('digests')
      .upsert({ digest_date: date, status: 'failed', error_message: result.errorMessage })
    return { ok: false, message: result.errorMessage }
  }

  // result.status === 'done' — 'skipped'는 위에서 이미 처리했다.
  await supabase.from('digests').upsert({
    digest_date: date,
    status: 'done',
    body_md: result.bodyMd,
    has_connections: result.hasConnections,
    model: 'gemini-2.5-flash',
    generated_at: new Date().toISOString(),
    error_message: null,
  })

  return { ok: true, skipped: false }
}
```

- [ ] **Step 2: 수동 생성 API 작성**

`src/app/api/digests/[date]/generate/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { runDigestPipeline } from '@/lib/digest-pipeline'

const 날짜형식 = /^\d{4}-\d{2}-\d{2}$/

/**
 * 이 라우트는 (app) 레이아웃 밖이라 requireProfile의 리다이렉트가 걸리지
 * 않는다. getCurrentProfile로 직접 확인한다(설계 §8.1.1).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { date } = await params
  if (!날짜형식.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다' }, { status: 400 })
  }

  const result = await runDigestPipeline(date)
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, skipped: result.skipped })
}
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 4: 실제 호출 확인 (사람이 직접)**

`npm run dev` 실행 후 로그인 상태에서:

```bash
curl -X POST http://localhost:3000/api/digests/2026-08-05/generate \
  -H "Cookie: <브라우저 개발자도구에서 복사한 세션 쿠키>"
```

노트가 있는 날짜로 시도해 `{"ok":true,"skipped":false}`가 오는지, Supabase 대시보드의 `digests` 테이블에 `status='done'`이고 `body_md`가 채워졌는지 확인한다. 이 단계에서 Task 3에서 미룬 `@google/genai` 실제 호출도 함께 검증된다.

로그인하지 않은 상태(쿠키 없이)로 호출하면 403이 와야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/digest-pipeline.ts "src/app/api/digests/[date]/generate/route.ts"
git commit -m "정리본 생성 파이프라인과 수동 생성 API 추가

수동 생성 API를 크론보다 먼저 만든다 — 크론은 배포 후에만 검증할 수
있기 때문이다(설계 §13). runDigestPipeline은 인증하지 않는다;
호출하는 라우트가 먼저 세션을 확인한다(설계 §8.1.1).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: 크론 API + Vercel 크론 등록

**Files:**
- Create: `src/app/api/cron/digest/route.ts`
- Create: `vercel.json`
- Test: `tests/unit/cron-digest-route.test.ts`

**Interfaces:**
- Consumes: `runDigestPipeline` (Task 4), `getCronSecret` (Task 3), `todayInSeoul` (1단계)
- Produces: 없음 (라우트 핸들러)

- [ ] **Step 1: 실패하는 테스트 작성**

인증 실패(401) 분기는 DB·AI를 전혀 건드리지 않으므로 실제 Supabase 없이 라우트 핸들러를 직접 호출해 테스트할 수 있다. 성공 경로(실제 파이프라인 실행)는 Task 4의 수동 확인으로 이미 검증했으므로 여기서 다시 만들지 않는다.

`tests/unit/cron-digest-route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from '@/app/api/cron/digest/route'

describe('POST /api/cron/digest', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = '테스트시크릿'
  })

  it('CRON_SECRET이 일치하지 않으면 401', async () => {
    const req = new Request('http://localhost/api/cron/digest', {
      method: 'POST',
      headers: { authorization: 'Bearer 틀린값' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('Authorization 헤더가 없으면 401', async () => {
    const req = new Request('http://localhost/api/cron/digest', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `src/app/api/cron/digest/route` 를 찾을 수 없음

- [ ] **Step 3: 크론 라우트 작성**

`src/app/api/cron/digest/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCronSecret } from '@/lib/env'
import { todayInSeoul } from '@/lib/date'
import { runDigestPipeline } from '@/lib/digest-pipeline'

/**
 * Vercel Cron은 이 라우트를 'Authorization: Bearer $CRON_SECRET' 헤더로 호출한다.
 * 대상 날짜는 반드시 KST로 구한다 — 크론은 UTC로 실행되므로 서버 기본 날짜를
 * 그대로 쓰면 실행 시각이 바뀌는 순간 조용히 전날 정리본을 만들게 된다(설계 §8.1).
 */
export async function POST(req: Request) {
  const 헤더값 = req.headers.get('authorization')
  if (헤더값 !== `Bearer ${getCronSecret()}`) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  const date = todayInSeoul()
  const result = await runDigestPipeline(date)
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, skipped: result.skipped })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 57개 (기존 55개 + 이번 2개)

- [ ] **Step 5: Vercel 크론 등록**

`vercel.json` (프로젝트 루트, `package.json` 옆):

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "50 14 * * *"
    }
  ]
}
```

23:50 KST = 14:50 UTC (설계 §8.1). Vercel 크론은 UTC 기준이다.

- [ ] **Step 6: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add "src/app/api/cron/digest/route.ts" tests/unit/cron-digest-route.test.ts vercel.json
git commit -m "정리본 크론 API와 Vercel 크론 등록 추가

인증 실패(401) 분기는 DB·AI를 건드리지 않아 실제 Supabase 없이
테스트했다. 성공 경로는 Task 4에서 수동 생성 API로 이미 확인한
runDigestPipeline을 그대로 재사용하므로 따로 테스트를 만들지 않는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Vercel 환경변수 등록 (사람이 직접, 배포 시)**

Vercel 프로젝트 → Settings → Environment Variables에 `GEMINI_API_KEY`, `CRON_SECRET`을 추가한다. `vercel.json`이 배포되면 크론이 자동 등록된다 — 로컬에서는 동작하지 않는다(설계 §15).

---

## Task 6: 마크다운 다운로드 라우트

**Files:**
- Create: `src/app/api/digests/[date]/download/route.ts`

**Interfaces:**
- Consumes: `digestFileName` (Task 1), `getCurrentProfile` (1단계), `createSupabaseServerClient` (1단계)
- Produces: 없음 (라우트 핸들러)

`digestFileName`은 Task 1에서 이미 단위 테스트로 고정했으므로 이 라우트 자체는 따로 테스트를 만들지 않는다 — 나머지는 얇은 배선이다.

- [ ] **Step 1: 다운로드 라우트 작성**

`src/app/api/digests/[date]/download/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { digestFileName } from '@/lib/digest'

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { date } = await params
  const supabase = await createSupabaseServerClient()
  const { data: digest } = await supabase
    .from('digests')
    .select('body_md, status')
    .eq('digest_date', date)
    .maybeSingle()

  if (!digest || digest.status !== 'done' || !digest.body_md) {
    return NextResponse.json({ error: '정리본을 찾을 수 없습니다' }, { status: 404 })
  }

  const 파일명 = digestFileName(date)
  // 파일명에 한글이 들어가므로 RFC 5987 형식을 쓴다. filename= 만 쓰면
  // 브라우저에 따라 이름이 깨진다(설계 §8.3).
  return new NextResponse(digest.body_md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(파일명)}`,
    },
  })
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add "src/app/api/digests/[date]/download/route.ts"
git commit -m "정리본 .md 다운로드 라우트 추가

파일명에 한글이 들어가므로 Content-Disposition에 RFC 5987 형식을
쓴다 — 일반 filename= 만 쓰면 브라우저에 따라 이름이 깨진다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: 정리본 화면 (목록·상세·홈 링크)

**Files:**
- Create: `src/components/RegenerateDigestButton.tsx`
- Create: `src/app/(app)/digests/page.tsx`
- Create: `src/app/(app)/digests/[date]/page.tsx`
- Modify: `src/app/(app)/page.tsx` (최근 정리본 링크 추가)

**Interfaces:**
- Consumes: `Markdown` (2단계), `createSupabaseServerClient` (1단계)
- Produces: 없음 (화면 전용, 순수 함수 없음)

- [ ] **Step 1: "다시 생성" 버튼 작성**

`src/components/RegenerateDigestButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RegenerateDigestButton({ date }: { date: string }) {
  const [생성중, set생성중] = useState(false)
  const [오류, set오류] = useState<string | null>(null)
  const router = useRouter()

  async function 생성하기() {
    set생성중(true)
    set오류(null)
    try {
      const res = await fetch(`/api/digests/${date}/generate`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        set오류(body.error ?? '생성에 실패했습니다')
        return
      }
      router.refresh()
    } finally {
      set생성중(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void 생성하기()}
        disabled={생성중}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        {생성중 ? '생성 중…' : '다시 생성'}
      </button>
      {오류 && <p className="mt-2 text-sm text-red-600">{오류}</p>}
    </div>
  )
}
```

- [ ] **Step 2: 정리본 목록 페이지 작성**

`src/app/(app)/digests/page.tsx`:

```tsx
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function DigestsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: digests } = await supabase
    .from('digests')
    .select('digest_date, status')
    .order('digest_date', { ascending: false })

  const 완료목록 = (digests ?? []).filter((d) => d.status === 'done')
  const 날짜들 = 완료목록.map((d) => d.digest_date)

  const { data: 참여노트 } =
    날짜들.length === 0
      ? { data: [] }
      : await supabase.from('notes').select('studied_on, profiles(display_name)').in('studied_on', 날짜들)

  const 날짜별참여자 = new Map<string, Set<string>>()
  for (const n of 참여노트 ?? []) {
    const 이름 = (n.profiles as unknown as { display_name: string }).display_name
    const set = 날짜별참여자.get(n.studied_on) ?? new Set<string>()
    set.add(이름)
    날짜별참여자.set(n.studied_on, set)
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-bold">정리본</h1>
      {완료목록.length === 0 ? (
        <p className="text-sm text-gray-500">아직 생성된 정리본이 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {완료목록.map((d) => (
            <li key={d.digest_date} className="py-2">
              <Link href={`/digests/${d.digest_date}`} className="hover:underline">
                {d.digest_date}
              </Link>
              <span className="ml-2 text-sm text-gray-500">
                {[...(날짜별참여자.get(d.digest_date) ?? [])].join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

- [ ] **Step 3: 정리본 상세 페이지 작성**

`src/app/(app)/digests/[date]/page.tsx`:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { Markdown } from '@/components/Markdown'
import { RegenerateDigestButton } from '@/components/RegenerateDigestButton'

type Props = { params: Promise<{ date: string }> }

export default async function DigestDetailPage({ params }: Props) {
  const { date } = await params
  const supabase = await createSupabaseServerClient()

  const { data: digest } = await supabase
    .from('digests')
    .select('digest_date, body_md, status')
    .eq('digest_date', date)
    .maybeSingle()

  // 설계 §10: 크론 미실행 시 "아직 생성되지 않음 — 지금 생성" 버튼을 보인다.
  if (!digest) {
    return (
      <>
        <h1 className="mb-6 text-xl font-bold">{date}</h1>
        <p className="mb-6 text-sm text-gray-500">아직 생성되지 않았습니다.</p>
        <RegenerateDigestButton date={date} />
      </>
    )
  }

  if (digest.status !== 'done' || !digest.body_md) {
    return (
      <>
        <h1 className="mb-6 text-xl font-bold">{date}</h1>
        <p className="mb-6 text-sm text-gray-500">
          {digest.status === 'failed' ? '생성에 실패했습니다.' : '생성 중입니다.'}
        </p>
        <RegenerateDigestButton date={date} />
      </>
    )
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{date}</h1>
        <div className="flex gap-3 text-sm">
          <a href={`/api/digests/${date}/download`} className="rounded border px-3 py-1">
            .md 다운로드
          </a>
          <RegenerateDigestButton date={date} />
        </div>
      </div>
      <Markdown>{digest.body_md}</Markdown>
    </>
  )
}
```

- [ ] **Step 4: 홈 화면에 최근 정리본 링크 추가**

`src/app/(app)/page.tsx` 상단 import에 추가:

```tsx
import { todayInSeoul, weekdayIndexOf } from '@/lib/date'
```

는 이미 있다. 그 아래 `HomePage` 함수 안, `오늘노트` 조회 다음에 추가:

```tsx
  const { data: 최근정리본 } = await supabase
    .from('digests')
    .select('digest_date')
    .eq('status', 'done')
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle()
```

`<h1>` 블록 바로 다음에 추가:

```tsx
      {최근정리본 && (
        <Link href={`/digests/${최근정리본.digest_date}`} className="mb-6 inline-block text-sm text-gray-600 hover:underline">
          최근 정리본 ({최근정리본.digest_date}) →
        </Link>
      )}
```

- [ ] **Step 5: 타입·린트·테스트·빌드 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

Run: `npm test`
Expected: PASS — 57개

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add src/components/RegenerateDigestButton.tsx "src/app/(app)/digests" "src/app/(app)/page.tsx"
git commit -m "정리본 목록·상세 화면과 홈 최근 정리본 링크 추가

Nav의 기존 /digests 링크가 이제 실제로 동작한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## 수동 확인 (전 태스크 완료 후)

개발 서버(`npm run dev`)를 띄우고 확인한다. `.env.local`에 `GEMINI_API_KEY`, `CRON_SECRET`이 설정돼 있어야 한다.

1. 노트가 있는 날짜로 `/digests/[date]`에서 "다시 생성"을 누르면 잠시 후 정리본이 보인다
2. "겹치는 지점" 섹션은 실제로 두 명 이상이 관련 있을 때만 나타난다 — 억지 연결이 없는지 눈으로 확인한다
3. `.md` 다운로드를 누르면 `2026-08-05-스터디정리.md` 형식의 파일명으로 내려받아진다
4. `/digests` 목록에 그날 참여한 팀원 이름이 표시된다
5. 홈 화면에 최근 정리본 링크가 보인다
6. **로그인하지 않은 상태로** `POST /api/digests/[date]/generate` 호출 → 403 (curl로 쿠키 없이 확인)
7. **`CRON_SECRET` 없이** `POST /api/cron/digest` 호출 → 401 (curl로 확인, 자동 테스트로도 이미 확인됨)
8. 노트가 0개인 날짜로 생성을 시도하면 정리본이 만들어지지 않는다 (`digests` 테이블에 행이 생기지 않음)

## 3단계 완료 기준

- [ ] `npm test` 통과 (57개)
- [ ] `npm run build` 오류 없음
- [ ] 위 수동 확인 8개 전부 통과
- [ ] 배포 후 Vercel 크론이 23:50 KST에 실행되는지 대시보드 Cron Jobs 탭에서 최소 한 번 확인

## 이 계획에서 다루지 않는 것

| 항목 | 근거 |
|---|---|
| 정리본 재생성 API의 세션 인증(403)에 대한 자동 테스트 | 실제 로그인 세션이 필요해 기존 테스트 인프라(순수 함수 단위 테스트, 직접 Supabase 호출 RLS 테스트)로는 커버되지 않는다. 수동 확인 6번으로 대체 |
| 정리본 아카이브의 월별 필터·검색 | 설계 §6에 명시되지 않음, 목록이 짧은 4인 규모에서는 불필요 |
| `generating` 상태가 5분 넘게 멈췄을 때의 자동 재시도(설계 §10) | 이번 범위는 "다시 생성" 버튼으로 사람이 직접 처리하는 것으로 충분. 필요해지면 별도 작업으로 `started_at` 경과 판정을 추가한다 |
