# 팀 스터디 허브 — 2단계 구현 계획 (마크다운 파일 불러오기)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노트 작성·수정 화면에서 `.md` 파일을 선택하면 제목·본문이 자동으로 채워지게 하고, 저장된 본문을 마크다운으로 렌더링한다.

**Architecture:** 팀의 실제 사용 방식은 "웹에서 글을 쓴다"가 아니라 "클로드가 정리해준 `.md` 파일을 올린다"다. `.md`는 순수 텍스트라 파싱이 필요 없으므로, 서버에 저장했다 나중에 읽는 구조 대신 **파일 선택 즉시 브라우저가 읽어 폼의 입력칸을 채우는** 방식을 쓴다. 서버 왕복도, 스토리지도, 권한 처리도 필요 없다. 직접 타이핑도 그대로 유지하고, 불러온 뒤에도 수정할 수 있게 한다.

**Tech Stack:** Next.js 15 (App Router, TypeScript), React 19, Tailwind, Vitest, `react-markdown` + `remark-gfm`

**설계 문서:** `docs/2026-08-05-team-study-hub-design.md`
**1단계 계획:** `docs/2026-08-05-study-hub-phase1-plan.md`
**보류된 계획(PDF·이미지 첨부):** `docs/2026-08-05-study-hub-attachments-plan.md` — 일반 첨부가 필요해지면 그때 꺼내 쓴다

## Global Constraints

- Node.js 20 이상. Next.js 15 App Router + TypeScript, `src/` 디렉터리, import alias `@/*`
- 무료 티어만 사용한다
- 커밋 메시지는 한국어로 작성한다

---

## 1단계에서 이어받는 것

```ts
// src/lib/validation.ts
type NoteFormState = { error: string | null }
function parseNoteInput(raw): ParseResult   // title ≤ 200자, bodyMd ≤ 50,000자 검증은 여기서 그대로 함
```

```tsx
// src/components/NoteForm.tsx
type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>
  initial?: { title: string; bodyMd: string; studiedOn: string }
  submitLabel: string
  defaultStudiedOn: string
  hiddenFields?: Record<string, string>
}
```

`NoteForm`은 `title`·`bodyMd` input을 `defaultValue`로 그리는 **비제어(uncontrolled) 컴포넌트**다. `src/app/(app)/notes/new/page.tsx`와 `.../[id]/edit/page.tsx` 양쪽에서 그대로 재사용된다 — 이 계획은 이 파일 하나만 고치면 두 화면 모두에 적용된다.

현재 테스트: 단위 20개 (`npm test`로 확인됨).

---

## File Structure

```
src/
├── lib/
│   └── markdown-import.ts       .md 파일 내용에서 제목·본문을 뽑는 순수 함수
├── components/
│   ├── NoteForm.tsx              (수정) 파일 불러오기 input 추가
│   └── Markdown.tsx               본문 렌더러
└── app/
    ├── globals.css                (수정) 마크다운 스타일 추가
    └── (app)/notes/[id]/page.tsx  (수정) Markdown으로 본문 렌더링

tests/
└── unit/markdown-import.test.ts
```

**`lib/markdown-import.ts`에는 순수 함수만 둔다.** `FileReader`·DOM 접근 같은 부수효과가 없어야 단위 테스트로 고정할 수 있다. 실제 파일 읽기(`file.text()`)는 `NoteForm.tsx`의 이벤트 핸들러에서만 하고, 그 결과를 이 순수 함수에 넘긴다.

---

## Task 1: 마크다운 파일 파싱 유틸

**Files:**
- Create: `src/lib/markdown-import.ts`
- Test: `tests/unit/markdown-import.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type ParsedMarkdown = { title: string; bodyMd: string }`
  - `function parseMarkdownFile(fileName: string, content: string): ParsedMarkdown`

**규칙:** 맨 앞 빈 줄들을 건너뛴 첫 줄이 `# 제목` 형태(ATX H1, `#` 뒤에 공백 필수)면 그 줄을 제목으로 쓰고 본문에서 뗀다. `##` 이상이거나 `#` 뒤에 공백이 없으면 제목 줄로 보지 않는다. 이 경우 파일명(마지막 확장자 제외)을 제목으로 쓰고 본문은 원본 그대로(양끝 공백만 정리) 둔다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/markdown-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMarkdownFile } from '@/lib/markdown-import'

describe('parseMarkdownFile', () => {
  it('첫 줄이 # 제목이면 제목으로 쓰고 본문에서 뗀다', () => {
    const r = parseMarkdownFile('아무개.md', '# 오늘 배운 것\n\n내용입니다.')
    expect(r.title).toBe('오늘 배운 것')
    expect(r.bodyMd).toBe('내용입니다.')
  })

  it('제목 줄 앞뒤 공백을 정리한다', () => {
    const r = parseMarkdownFile('a.md', '#   공백 제목   \n본문')
    expect(r.title).toBe('공백 제목')
  })

  it('제목 줄 앞의 빈 줄을 건너뛴다', () => {
    const r = parseMarkdownFile('a.md', '\n\n# 제목\n본문')
    expect(r.title).toBe('제목')
    expect(r.bodyMd).toBe('본문')
  })

  it('#이 여러 개(##)면 제목 줄로 보지 않는다', () => {
    const r = parseMarkdownFile('소제목.md', '## 소제목\n본문')
    expect(r.title).toBe('소제목')
    expect(r.bodyMd).toBe('## 소제목\n본문')
  })

  it('# 뒤에 공백이 없으면 제목 줄로 보지 않는다', () => {
    const r = parseMarkdownFile('해시태그.md', '#해시태그\n본문')
    expect(r.title).toBe('해시태그')
    expect(r.bodyMd).toBe('#해시태그\n본문')
  })

  it('첫 줄에 제목이 없으면 파일명(확장자 제외)을 제목으로 쓴다', () => {
    const r = parseMarkdownFile('2026-08-05-회고.md', '오늘은 힘들었다.')
    expect(r.title).toBe('2026-08-05-회고')
    expect(r.bodyMd).toBe('오늘은 힘들었다.')
  })

  it('파일명에 점이 여러 개면 마지막 것만 확장자로 뗀다', () => {
    const r = parseMarkdownFile('노트.초안.md', '본문')
    expect(r.title).toBe('노트.초안')
  })

  it('확장자가 없는 파일명은 그대로 제목이 된다', () => {
    const r = parseMarkdownFile('README', '본문')
    expect(r.title).toBe('README')
  })

  it('제목 줄 다음의 빈 줄들을 본문 앞에서 정리한다', () => {
    const r = parseMarkdownFile('a.md', '# 제목\n\n\n본문 시작')
    expect(r.bodyMd).toBe('본문 시작')
  })

  it('제목만 있고 본문이 없으면 빈 문자열을 돌려준다', () => {
    const r = parseMarkdownFile('a.md', '# 제목만 있음')
    expect(r.bodyMd).toBe('')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `@/lib/markdown-import` 를 찾을 수 없음

- [ ] **Step 3: `src/lib/markdown-import.ts` 구현**

```ts
export type ParsedMarkdown = { title: string; bodyMd: string }

const 제목줄패턴 = /^#[ \t]+(.+?)[ \t]*$/

/** 'note.md' → 'note'. 확장자가 없으면 그대로 돌려준다. */
function 확장자뗀이름(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  if (i <= 0) return fileName
  return fileName.slice(0, i)
}

/**
 * 마크다운 파일에서 제목과 본문을 뽑는다.
 * 맨 앞 빈 줄들을 건너뛴 첫 줄이 '# 제목' 형태(ATX H1)면 그 줄을 제목으로
 * 쓰고 본문에서 뗀다. 아니라면 파일명(확장자 제외)을 제목으로 쓰고
 * 본문은 원본 그대로(양끝 공백만 정리) 둔다.
 */
export function parseMarkdownFile(fileName: string, content: string): ParsedMarkdown {
  const 줄들 = content.split('\n')
  let i = 0
  while (i < 줄들.length && 줄들[i].trim().length === 0) i++

  const 첫줄 = 줄들[i]
  const match = 첫줄 !== undefined ? 첫줄.match(제목줄패턴) : null

  if (!match) {
    return { title: 확장자뗀이름(fileName), bodyMd: content.trim() }
  }

  const 나머지 = 줄들.slice(i + 1)
  while (나머지.length > 0 && 나머지[0].trim().length === 0) 나머지.shift()

  return { title: match[1], bodyMd: 나머지.join('\n').trim() }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 30개 (기존 20개 + 이번 10개)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/markdown-import.ts tests/unit/markdown-import.test.ts
git commit -m "마크다운 파일 파싱 유틸 추가

.md 파일의 첫 줄이 '# 제목' 형태면 제목으로 쓰고 본문에서 뗀다.
아니면 파일명(확장자 제외)을 제목으로 쓴다. 파일 읽기 같은 부수효과는
없는 순수 함수라 단위 테스트로 고정했다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: 노트 폼에 "마크다운 파일 불러오기" 추가

**Files:**
- Modify: `src/components/NoteForm.tsx`

**Interfaces:**
- Consumes: `parseMarkdownFile` (Task 1)
- Produces: 없음 (컴포넌트 외부 인터페이스는 변경 없음 — `new/page.tsx`, `edit/page.tsx` 수정 불필요)

`title`·`bodyMd` input은 지금 `defaultValue`로 그려지는 비제어 컴포넌트다. 파일을 불러왔을 때 값을 채우려면 `ref`로 DOM에 직접 값을 넣는다 — `useState`로 제어 컴포넌트로 바꾸지 않는다. 이렇게 하면 직접 타이핑 동작이 지금과 완전히 같게 유지되고, 불러온 뒤에도 그냥 typing으로 수정할 수 있다.

- [ ] **Step 1: `NoteForm.tsx`에 파일 불러오기 input 추가**

`src/components/NoteForm.tsx` 전체를 다음으로 교체한다:

```tsx
'use client'

import { useActionState, useRef, useState } from 'react'
import type { NoteFormState } from '@/lib/validation'
import { parseMarkdownFile } from '@/lib/markdown-import'

type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>
  initial?: { title: string; bodyMd: string; studiedOn: string }
  submitLabel: string
  defaultStudiedOn: string
  hiddenFields?: Record<string, string>
}

const 초기상태: NoteFormState = { error: null }

export function NoteForm({ action, initial, submitLabel, defaultStudiedOn, hiddenFields }: Props) {
  const [state, formAction, pending] = useActionState(action, 초기상태)
  const [불러오기오류, set불러오기오류] = useState<string | null>(null)
  const 제목참조 = useRef<HTMLInputElement>(null)
  const 본문참조 = useRef<HTMLTextAreaElement>(null)
  const 파일입력참조 = useRef<HTMLInputElement>(null)

  async function 파일불러오기(file: File) {
    set불러오기오류(null)

    if (!file.name.toLowerCase().endsWith('.md')) {
      set불러오기오류('마크다운(.md) 파일만 불러올 수 있습니다')
      if (파일입력참조.current) 파일입력참조.current.value = ''
      return
    }

    const content = await file.text()
    const { title, bodyMd } = parseMarkdownFile(file.name, content)

    if (제목참조.current) 제목참조.current.value = title
    if (본문참조.current) 본문참조.current.value = bodyMd
    if (파일입력참조.current) 파일입력참조.current.value = ''
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="markdownFile" className="text-sm text-gray-600">
          마크다운 파일 불러오기
        </label>
        <input
          ref={파일입력참조}
          id="markdownFile"
          type="file"
          accept=".md,text/markdown"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void 파일불러오기(f)
          }}
          className="text-sm file:mr-3 file:rounded file:border file:bg-white file:px-3 file:py-1"
        />
        {불러오기오류 && <p className="text-sm text-red-600">{불러오기오류}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm text-gray-600">제목</label>
        <input
          ref={제목참조}
          id="title"
          name="title"
          defaultValue={initial?.title}
          maxLength={200}
          required
          className="rounded border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="studiedOn" className="text-sm text-gray-600">공부한 날짜</label>
        <input
          id="studiedOn"
          name="studiedOn"
          type="date"
          defaultValue={initial?.studiedOn ?? defaultStudiedOn}
          required
          className="w-44 rounded border px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bodyMd" className="text-sm text-gray-600">내용 (마크다운)</label>
        <textarea
          ref={본문참조}
          id="bodyMd"
          name="bodyMd"
          defaultValue={initial?.bodyMd}
          rows={20}
          required
          className="rounded border px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? '저장 중…' : submitLabel}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/NoteForm.tsx
git commit -m "노트 폼에 마크다운 파일 불러오기 추가

title·bodyMd input은 그대로 비제어(uncontrolled) 컴포넌트로 두고
ref로 DOM에 값을 직접 넣는다. useState로 제어 컴포넌트화하지 않은 이유는
기존 직접 타이핑 동작을 그대로 보존하기 위해서다 — 불러온 뒤에도
그냥 typing으로 수정할 수 있다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: 본문 마크다운 렌더링

**Files:**
- Create: `src/components/Markdown.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/(app)/notes/[id]/page.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `Markdown` 컴포넌트 — props `{ children: string }`

- [ ] **Step 1: 의존성 설치**

```bash
npm install react-markdown remark-gfm
```

- [ ] **Step 2: 마크다운 컴포넌트 작성**

`src/components/Markdown.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 노트 본문 렌더러.
 *
 * rehype-raw 를 쓰지 않는다. react-markdown 은 기본적으로 원시 HTML을
 * 렌더링하지 않으므로, 팀원이 본문에 <script> 를 적어도 그냥 글자로 나온다.
 * 이 기본값을 끄지 말 것.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 3: 마크다운 스타일 추가**

`src/app/globals.css` 끝에 추가한다. Tailwind는 기본 스타일을 모두 지우기 때문에, 제목·목록·코드가 그냥 평문으로 보인다.

```css
.markdown h1 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
.markdown h2 { font-size: 1.25rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
.markdown h3 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.markdown p { margin: 0.75rem 0; }
.markdown ul { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
.markdown ol { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
.markdown li { margin: 0.25rem 0; }
.markdown a { text-decoration: underline; }
.markdown code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
  font-size: 0.9em;
}
.markdown pre {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.75rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.markdown pre code { background: none; padding: 0; }
.markdown blockquote {
  border-left: 3px solid rgba(0, 0, 0, 0.2);
  padding-left: 0.75rem;
  color: rgba(0, 0, 0, 0.6);
  margin: 0.75rem 0;
}
.markdown table { border-collapse: collapse; margin: 0.75rem 0; display: block; overflow-x: auto; }
.markdown th, .markdown td { border: 1px solid rgba(0, 0, 0, 0.15); padding: 0.4rem 0.6rem; }
.markdown hr { border-top: 1px solid rgba(0, 0, 0, 0.15); margin: 1.5rem 0; }
```

- [ ] **Step 4: 노트 페이지에 적용**

`src/app/(app)/notes/[id]/page.tsx` 에서

```tsx
      <div className="whitespace-pre-wrap leading-relaxed">{note.body_md}</div>
```

을 다음으로 바꾸고, 상단에 `import { Markdown } from '@/components/Markdown'` 을 추가한다.

```tsx
      <Markdown>{note.body_md}</Markdown>
```

- [ ] **Step 5: 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

Run: `npm run build`
Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json src/components/Markdown.tsx src/app/globals.css "src/app/(app)/notes/[id]/page.tsx"
git commit -m "본문 마크다운 렌더링 추가

rehype-raw 를 쓰지 않는다. 원시 HTML을 렌더링하지 않는 것이
react-markdown 의 기본값이고, 그 기본값이 우리에게 필요한 안전장치다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## 수동 확인 (전 태스크 완료 후)

개발 서버(`npm run dev`)를 띄우고 확인한다.

1. 새 노트 작성 화면에서 `# 제목` 으로 시작하는 `.md` 파일을 고르면 제목·본문 칸이 자동으로 채워진다
2. 채워진 뒤에도 직접 타이핑으로 고칠 수 있다
3. 첫 줄이 `# 제목` 형태가 아닌 `.md` 파일을 고르면 제목 칸에 **파일명**(확장자 제외)이 들어간다
4. `.md`가 아닌 파일을 고르면 오류 문구가 뜨고 필드는 바뀌지 않는다
5. 노트 수정 화면에서도 동일하게 동작한다
6. 저장한 뒤 노트 상세 화면에서 `# 제목`, `- 목록`, `**굵게**`, 표가 **서식이 적용돼** 보인다
7. 본문에 `<script>alert(1)</script>` 를 적으면 **글자 그대로** 보인다 (실행되지 않는다)

## 2단계 완료 기준

- [ ] `npm test` 통과 (30개)
- [ ] `npm run build` 오류 없음
- [ ] 위 수동 확인 7개 전부 통과
- [ ] 배포본에서도 파일 불러오기·렌더링이 된다

## 이 계획에서 다루지 않는 것

| 항목 | 근거 |
|---|---|
| PDF·이미지 등 일반 첨부 | `docs/2026-08-05-study-hub-attachments-plan.md`로 보류 |
| 여러 `.md` 파일 한 번에 불러오기 | 하나씩으로 충분하다 |
| 마크다운 문법 검증·미리보기 | 저장 시 렌더링(Task 3)으로 충분하다 |
| AI 정리본 | 3단계 |
