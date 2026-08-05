# 팀 스터디 허브 — 2단계 구현 계획 (파일 첨부)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노트에 파일을 첨부하고 팀원끼리 내려받을 수 있게 하며, 1단계에서 미뤄둔 마크다운 렌더링을 붙인다.

**Architecture:** 파일은 브라우저에서 Supabase Storage로 **직접** 올라가고, 서버 액션은 그 결과를 `attachments` 행으로 기록만 한다. 다운로드는 라우트 핸들러가 짧게 사는 서명 URL을 발급해 리다이렉트한다. 첨부는 노트를 만든 **뒤에** 상세 화면에서 붙인다 — 본문을 먼저 확정하고 첨부를 나중에 붙이는 순서를 지키기 위해서다(설계 §10).

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase Storage, Tailwind, Vitest, `react-markdown` + `remark-gfm`

**설계 문서:** `docs/2026-08-05-team-study-hub-design.md` — §는 그 문서를 가리킨다.
**1단계 계획:** `docs/2026-08-05-study-hub-phase1-plan.md`

## Global Constraints

- Node.js 20 이상. Next.js 15 App Router + TypeScript, `src/` 디렉터리, import alias `@/*`
- 모든 날짜 계산은 `Asia/Seoul` 기준
- **RLS 정책의 기준은 `profiles` 등록 여부다.** `auth.uid() is not null` 로 끝내지 않는다
- **첨부파일의 내용을 절대 파싱하지 않는다.** PDF 추출·OCR·미리보기 생성 전부 범위 밖이다 (§4)
- **파일당 10MB, 노트당 5개** 상한 (§9.3)
- 첨부는 **비공개 버킷**에 두고, 다운로드는 짧게 만료되는 서명 URL로만 (§9.3)
- 서버 전용 키는 클라이언트 컴포넌트가 import하는 모듈에 들어가면 안 된다
- 무료 티어만 사용한다. Storage 무료 한도는 1GB
- 커밋 메시지는 한국어로 작성한다

---

## 1단계에서 이어받는 것

이 계획을 실행하는 사람이 알아야 할 기존 인터페이스다.

```ts
// src/lib/auth.ts
type Profile = { id: string; display_name: string; slug: string; avatar_url: string | null }
async function requireProfile(): Promise<Profile>          // 미등록이면 /no-access 로 리다이렉트
async function getAllProfiles(): Promise<Profile[]>

// src/lib/supabase/server.ts
async function createSupabaseServerClient()                 // 쿠키 기반, anon 키, RLS 적용됨

// src/lib/supabase/client.ts
function createSupabaseBrowserClient()                      // 브라우저용, anon 키

// src/lib/validation.ts
type NoteFormState = { error: string | null }
function parseNoteInput(raw): ParseResult

// src/lib/date.ts
function todayInSeoul(now?: Date): string                   // 'YYYY-MM-DD'
function weekdayIndexOf(dateStr: string): number
```

**이미 존재하는 DB 구조** (1단계 `0001_init.sql`에서 생성됨):

```sql
attachments
  id           uuid PK
  note_id      uuid not null references notes(id) on delete cascade
  storage_path text not null
  file_name    text not null
  byte_size    integer not null
  mime_type    text
  created_at   timestamptz
```

`attachments` 테이블의 RLS 정책도 이미 있다 — 읽기는 등록된 팀원 전체, 쓰기·삭제는 **자기 노트의 첨부만**. 이 태스크들에서 다시 만들지 않는다.

**아직 없는 것:** Storage 버킷 자체와 `storage.objects` 에 대한 정책. 테이블 정책과 스토리지 정책은 별개다.

현재 테스트: 단위 20개, 권한 8개.

---

## File Structure

```
supabase/migrations/
└── 0002_attachments_storage.sql        버킷 생성 + storage.objects 정책

src/
├── lib/
│   └── attachments.ts                  상수·검증·경로 규칙 (순수 함수만)
├── components/
│   ├── AttachmentUploader.tsx          업로드 (클라이언트)
│   └── AttachmentList.tsx              목록·삭제 버튼
└── app/
    ├── api/attachments/[id]/download/
    │   └── route.ts                    서명 URL 발급 후 리다이렉트
    └── (app)/notes/
        ├── attachment-actions.ts       기록·삭제 서버 액션
        └── [id]/page.tsx               첨부 섹션 추가 + 마크다운 렌더링

tests/
├── unit/attachments.test.ts            검증·경로 규칙
└── rls/attachments.test.ts             첨부 권한
```

**`attachment-actions.ts` 를 `actions.ts` 와 분리하는 이유:** 노트 CRUD와 첨부는 수명주기가 다르고, 한 파일에 몰면 서버 액션 파일이 커진다. 파일이 커질수록 편집이 불안정해진다.

**`lib/attachments.ts` 에는 순수 함수만 둔다.** Supabase 호출이나 `crypto.randomUUID()` 같은 부수효과를 넣지 않아야 단위 테스트로 고정할 수 있다.

---

## 왜 브라우저에서 직접 올리는가

파일을 서버 액션으로 보내지 않는다. 이유는 하나다.

**Vercel의 서버리스 함수는 요청 본문 크기에 상한이 있다.** Next.js 서버 액션의 기본 상한은 1MB이고, 올려도 Vercel 쪽 한도(약 4.5MB)에 걸린다. **10MB 파일은 서버 액션을 통과할 수 없다.** 로컬에서는 되는데 배포하면 실패하는 전형적인 함정이다.

그래서 이렇게 나눈다.

```
브라우저 ──파일──> Supabase Storage      (Storage 정책이 검사)
브라우저 ──경로만──> 서버 액션 ──> attachments 행 기록  (RLS가 검사)
```

파일 자체는 우리 서버를 거치지 않는다. 서버는 "이 경로에 이런 파일이 있다"는 기록만 남긴다.

**두 곳 모두 독립적으로 검사한다.** 브라우저의 검사는 사용자 편의일 뿐 신뢰하지 않는다.

---

## Task 1: 첨부 규칙과 스토리지 정책

상수·검증·경로 규칙을 순수 함수로 고정하고, Storage 버킷과 정책을 만든다.

**Files:**
- Create: `src/lib/attachments.ts`
- Create: `supabase/migrations/0002_attachments_storage.sql`
- Test: `tests/unit/attachments.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `const 첨부버킷 = 'attachments'`
  - `const 첨부최대바이트 = 10485760`
  - `const 노트당첨부최대 = 5`
  - `function extensionOf(fileName: string): string` — `'.pdf'` 또는 `''`
  - `function storagePath(userId: string, noteId: string, uuid: string, fileName: string): string`
  - `type AttachmentCheck = { ok: true } | { ok: false; message: string }`
  - `function checkAttachment(file: { name: string; size: number }, 현재개수: number): AttachmentCheck`
  - `function formatBytes(n: number): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/unit/attachments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  extensionOf,
  storagePath,
  checkAttachment,
  formatBytes,
  첨부최대바이트,
  노트당첨부최대,
} from '@/lib/attachments'

describe('extensionOf', () => {
  it('확장자를 소문자로 뽑는다', () => {
    expect(extensionOf('보고서.PDF')).toBe('.pdf')
  })

  it('점이 여러 개면 마지막 것만 쓴다', () => {
    expect(extensionOf('archive.tar.gz')).toBe('.gz')
  })

  it('확장자가 없으면 빈 문자열', () => {
    expect(extensionOf('README')).toBe('')
  })

  it('숨김 파일의 앞 점은 확장자가 아니다', () => {
    expect(extensionOf('.gitignore')).toBe('')
  })
})

describe('storagePath', () => {
  it('사용자/노트/uuid 구조로 만든다', () => {
    expect(storagePath('user-1', 'note-2', 'abc', '자료.pdf')).toBe('user-1/note-2/abc.pdf')
  })

  it('원본 파일명을 경로에 넣지 않는다', () => {
    // 한글·공백·특수문자가 든 이름을 경로에 쓰면 인코딩 문제가 생긴다.
    // 원본 이름은 DB의 file_name 에만 보관한다.
    const p = storagePath('user-1', 'note-2', 'abc', '내 자료 (최종).pdf')
    expect(p).toBe('user-1/note-2/abc.pdf')
    expect(p).not.toContain('내 자료')
  })

  it('확장자가 없어도 동작한다', () => {
    expect(storagePath('u', 'n', 'abc', 'README')).toBe('u/n/abc')
  })
})

describe('checkAttachment', () => {
  const 정상 = { name: '자료.pdf', size: 1024 }

  it('정상 파일을 통과시킨다', () => {
    expect(checkAttachment(정상, 0).ok).toBe(true)
  })

  it('상한과 같은 크기는 통과시킨다', () => {
    expect(checkAttachment({ name: 'a.pdf', size: 첨부최대바이트 }, 0).ok).toBe(true)
  })

  it('상한을 1바이트라도 넘으면 거부한다', () => {
    const r = checkAttachment({ name: 'a.pdf', size: 첨부최대바이트 + 1 }, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/10/)
  })

  it('빈 파일을 거부한다', () => {
    const r = checkAttachment({ name: 'a.pdf', size: 0 }, 0)
    expect(r.ok).toBe(false)
  })

  it('이름이 비면 거부한다', () => {
    expect(checkAttachment({ name: '   ', size: 100 }, 0).ok).toBe(false)
  })

  it('노트당 개수 상한에 도달하면 거부한다', () => {
    const r = checkAttachment(정상, 노트당첨부최대)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/5/)
  })

  it('상한 직전까지는 통과시킨다', () => {
    expect(checkAttachment(정상, 노트당첨부최대 - 1).ok).toBe(true)
  })
})

describe('formatBytes', () => {
  it('바이트 단위', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('KB 단위', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('MB 단위', () => {
    expect(formatBytes(10485760)).toBe('10.0 MB')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `@/lib/attachments` 를 찾을 수 없음

- [ ] **Step 3: `src/lib/attachments.ts` 구현**

```ts
export const 첨부버킷 = 'attachments'
export const 첨부최대바이트 = 10 * 1024 * 1024 // 10MB
export const 노트당첨부최대 = 5

/** 'a.PDF' → '.pdf'. 확장자가 없으면 빈 문자열. */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  // i <= 0 이면 확장자가 없거나 '.gitignore' 처럼 앞 점뿐이다.
  if (i <= 0) return ''
  return fileName.slice(i).toLowerCase()
}

/**
 * 저장 경로. 원본 파일명은 넣지 않는다 — 한글·공백·특수문자가 들어가면
 * 스토리지 키 인코딩에서 문제가 생긴다. 원본 이름은 DB의 file_name 에만 둔다.
 * 첫 칸이 사용자 id인 것은 스토리지 정책이 소유자를 판별하는 근거다.
 */
export function storagePath(userId: string, noteId: string, uuid: string, fileName: string): string {
  return `${userId}/${noteId}/${uuid}${extensionOf(fileName)}`
}

export type AttachmentCheck = { ok: true } | { ok: false; message: string }

export function checkAttachment(
  file: { name: string; size: number },
  현재개수: number,
): AttachmentCheck {
  if (현재개수 >= 노트당첨부최대) {
    return { ok: false, message: `첨부는 노트당 ${노트당첨부최대}개까지 올릴 수 있습니다` }
  }
  if (file.name.trim().length === 0) {
    return { ok: false, message: '파일 이름이 올바르지 않습니다' }
  }
  if (file.size <= 0) {
    return { ok: false, message: '빈 파일은 올릴 수 없습니다' }
  }
  if (file.size > 첨부최대바이트) {
    return { ok: false, message: '파일 하나당 10MB까지 올릴 수 있습니다' }
  }
  return { ok: true }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 37개 (기존 20개 + 이번 17개)

- [ ] **Step 5: 스토리지 마이그레이션 작성**

`supabase/migrations/0002_attachments_storage.sql`:

```sql
-- ============================================================
-- 첨부파일 스토리지
-- 설계 §9.3 참조
--
-- 주의: attachments 테이블의 RLS 정책은 0001_init.sql 에 이미 있다.
-- 여기서 만드는 것은 버킷과 storage.objects 에 대한 정책으로, 별개다.
-- 둘 다 있어야 한다 — 테이블 정책만 있으면 파일 자체는 무방비다.
-- ============================================================

-- 비공개 버킷. public = false 이므로 URL을 알아도 그냥은 못 받는다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

-- 경로 규칙: {user_id}/{note_id}/{uuid}{ext}
-- 첫 칸이 올린 사람의 id이므로, 그것으로 소유자를 판별한다.

-- 올리기: 등록된 팀원이, 자기 id 폴더 안에만
create policy "attachments_object_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- 읽기: 등록된 팀원 전체. 서로 내려받는 것이 목적이다.
-- 서명 URL 발급도 이 권한을 근거로 이뤄진다.
create policy "attachments_object_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- 지우기: 자기 폴더 안의 것만
create policy "attachments_object_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE 정책은 만들지 않는다. 첨부는 올린 뒤 바꾸지 않고, 지우고 다시 올린다.
```

- [ ] **Step 6: 마이그레이션 적용 (사람이 직접)**

Supabase 대시보드 → SQL Editor → New query → 위 파일 내용 붙여넣기 → Run
Expected: `Success. No rows returned`

확인: Storage 메뉴에 `attachments` 버킷이 생기고, 자물쇠 표시(비공개)가 붙어 있어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/attachments.ts tests/unit/attachments.test.ts supabase/migrations/0002_attachments_storage.sql
git commit -m "첨부 규칙과 스토리지 정책 추가

파일당 10MB, 노트당 5개. 저장 경로에 원본 파일명을 넣지 않는다 —
한글·공백이 든 이름이 스토리지 키 인코딩에서 문제를 일으키기 때문이다.

테이블 RLS와 별개로 storage.objects 에도 정책이 필요하다.
테이블 정책만 있으면 파일 자체는 무방비다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 업로드

**Files:**
- Create: `src/app/(app)/notes/attachment-actions.ts`
- Create: `src/components/AttachmentUploader.tsx`

**Interfaces:**
- Consumes: `checkAttachment`, `storagePath`, `첨부버킷`, `첨부최대바이트`, `노트당첨부최대` (Task 1), `requireProfile()`, `createSupabaseServerClient()`, `createSupabaseBrowserClient()`
- Produces:
  - `type AttachmentActionResult = { error: string | null }`
  - `async function recordAttachment(input: { noteId: string; storagePath: string; fileName: string; byteSize: number; mimeType: string | null }): Promise<AttachmentActionResult>`
  - `AttachmentUploader` 컴포넌트 — props `{ noteId: string; 현재개수: number }`

- [ ] **Step 1: 기록 서버 액션 작성**

`src/app/(app)/notes/attachment-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkAttachment, 첨부버킷 } from '@/lib/attachments'

export type AttachmentActionResult = { error: string | null }

/**
 * 파일 자체는 브라우저가 이미 Storage에 올렸다. 여기서는 기록만 남긴다.
 * 브라우저의 검사는 편의일 뿐이므로 상한을 여기서 다시 확인한다.
 */
export async function recordAttachment(input: {
  noteId: string
  storagePath: string
  fileName: string
  byteSize: number
  mimeType: string | null
}): Promise<AttachmentActionResult> {
  const profile = await requireProfile()
  const supabase = await createSupabaseServerClient()

  // 내 노트인지 확인한다. RLS도 막지만, 여기서 걸러야 사용자에게 이유를 말해줄 수 있다.
  const { data: note } = await supabase
    .from('notes')
    .select('id, author_id')
    .eq('id', input.noteId)
    .maybeSingle()

  if (!note) return { error: '노트를 찾을 수 없습니다' }
  if (note.author_id !== profile.id) return { error: '이 노트에 첨부할 권한이 없습니다' }

  const { count } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('note_id', input.noteId)

  const 검사 = checkAttachment({ name: input.fileName, size: input.byteSize }, count ?? 0)
  if (!검사.ok) {
    // 이미 올라간 파일을 치운다. 기록되지 않은 파일이 남으면 용량만 먹는다.
    await supabase.storage.from(첨부버킷).remove([input.storagePath])
    return { error: 검사.message }
  }

  const { error } = await supabase.from('attachments').insert({
    note_id: input.noteId,
    storage_path: input.storagePath,
    file_name: input.fileName,
    byte_size: input.byteSize,
    mime_type: input.mimeType,
  })

  if (error) {
    await supabase.storage.from(첨부버킷).remove([input.storagePath])
    return { error: '첨부를 저장하지 못했습니다' }
  }

  revalidatePath(`/notes/${input.noteId}`)
  return { error: null }
}
```

- [ ] **Step 2: 업로드 컴포넌트 작성**

`src/components/AttachmentUploader.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { recordAttachment } from '@/app/(app)/notes/attachment-actions'
import { checkAttachment, storagePath, 첨부버킷, 노트당첨부최대 } from '@/lib/attachments'

type Props = { noteId: string; 현재개수: number }

export function AttachmentUploader({ noteId, 현재개수 }: Props) {
  const [오류, set오류] = useState<string | null>(null)
  const [올리는중, set올리는중] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const 한도도달 = 현재개수 >= 노트당첨부최대

  async function 처리(file: File) {
    set오류(null)

    // 서버에서도 다시 검사한다. 이건 사용자가 곧바로 알게 하려는 것뿐이다.
    const 검사 = checkAttachment({ name: file.name, size: file.size }, 현재개수)
    if (!검사.ok) {
      set오류(검사.message)
      return
    }

    set올리는중(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set오류('로그인이 만료되었습니다. 새로고침 후 다시 시도하세요.')
        return
      }

      const path = storagePath(user.id, noteId, crypto.randomUUID(), file.name)

      const { error: 업로드오류 } = await supabase.storage
        .from(첨부버킷)
        .upload(path, file, { contentType: file.type || undefined })

      if (업로드오류) {
        set오류('파일을 올리지 못했습니다. 잠시 후 다시 시도하세요.')
        return
      }

      const { error: 기록오류 } = await recordAttachment({
        noteId,
        storagePath: path,
        fileName: file.name,
        byteSize: file.size,
        mimeType: file.type || null,
      })

      if (기록오류) {
        set오류(기록오류)
        return
      }

      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } finally {
      set올리는중(false)
    }
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        disabled={올리는중 || 한도도달}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void 처리(f)
        }}
        className="text-sm file:mr-3 file:rounded file:border file:bg-white file:px-3 file:py-1 disabled:opacity-50"
      />
      {올리는중 && <p className="mt-2 text-sm text-gray-500">올리는 중…</p>}
      {한도도달 && (
        <p className="mt-2 text-sm text-gray-500">
          첨부는 노트당 {노트당첨부최대}개까지 올릴 수 있습니다
        </p>
      )}
      {오류 && <p className="mt-2 text-sm text-red-600">{오류}</p>}
    </div>
  )
}
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/notes/attachment-actions.ts" src/components/AttachmentUploader.tsx
git commit -m "첨부 업로드 구현

파일은 브라우저에서 Storage로 직접 올린다. 서버 액션을 거치면
Vercel의 요청 본문 크기 상한에 걸려 10MB 파일이 배포 환경에서만 실패한다.

브라우저의 검사는 사용자 편의일 뿐이므로 서버에서 상한을 다시 확인하고,
검사에 걸리면 이미 올라간 파일을 지운다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 목록·다운로드·삭제

**Files:**
- Create: `src/app/api/attachments/[id]/download/route.ts`
- Create: `src/components/AttachmentList.tsx`
- Modify: `src/app/(app)/notes/attachment-actions.ts` (deleteAttachment 추가)
- Modify: `src/app/(app)/notes/[id]/page.tsx` (첨부 섹션 추가)

**Interfaces:**
- Consumes: Task 1·2의 모든 것
- Produces:
  - `async function deleteAttachment(formData: FormData): Promise<void>` — `formData` 에 `id`, `noteId` 포함
  - `AttachmentList` 컴포넌트 — props `{ attachments: AttachmentRow[]; 내노트: boolean; noteId: string }`
  - `type AttachmentRow = { id: string; file_name: string; byte_size: number }`

- [ ] **Step 1: 삭제 액션 추가**

`src/app/(app)/notes/attachment-actions.ts` 끝에 추가한다.

```ts
export async function deleteAttachment(formData: FormData): Promise<void> {
  await requireProfile()
  const id = String(formData.get('id') ?? '')
  const noteId = String(formData.get('noteId') ?? '')
  if (!id) return

  const supabase = await createSupabaseServerClient()

  const { data: row } = await supabase
    .from('attachments')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (!row) return

  // 행을 먼저 지운다. RLS가 막으면 0행이 돌아오고, 그때는 파일도 건드리지 않는다.
  const { data: 지워진 } = await supabase.from('attachments').delete().eq('id', id).select('id')
  if (!지워진 || 지워진.length === 0) return

  await supabase.storage.from(첨부버킷).remove([row.storage_path])

  revalidatePath(`/notes/${noteId}`)
}
```

- [ ] **Step 2: 다운로드 라우트 작성**

`src/app/api/attachments/[id]/download/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { 첨부버킷 } from '@/lib/attachments'

const 서명유효초 = 300 // 5분

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // 이 라우트는 (app) 레이아웃 밖이라 requireProfile 의 리다이렉트가 걸리지 않는다.
  // 직접 확인한다.
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: row } = await supabase
    .from('attachments')
    .select('storage_path, file_name')
    .eq('id', id)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: '첨부를 찾을 수 없습니다' }, { status: 404 })
  }

  const { data: signed, error } = await supabase.storage
    .from(첨부버킷)
    .createSignedUrl(row.storage_path, 서명유효초, { download: row.file_name })

  if (error || !signed) {
    return NextResponse.json({ error: '다운로드 링크를 만들지 못했습니다' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
```

`download: row.file_name` 을 넘기면 서명 URL이 원본 파일명으로 내려받게 한다. 저장 경로에는 uuid만 있으므로 이게 없으면 `abc123.pdf` 같은 이름으로 저장된다.

- [ ] **Step 3: 목록 컴포넌트 작성**

`src/components/AttachmentList.tsx`:

```tsx
'use client'

import { deleteAttachment } from '@/app/(app)/notes/attachment-actions'
import { formatBytes } from '@/lib/attachments'

export type AttachmentRow = { id: string; file_name: string; byte_size: number }

type Props = { attachments: AttachmentRow[]; 내노트: boolean; noteId: string }

export function AttachmentList({ attachments, 내노트, noteId }: Props) {
  if (attachments.length === 0) {
    return <p className="text-sm text-gray-500">첨부된 파일이 없습니다.</p>
  }

  return (
    <ul className="divide-y rounded border">
      {attachments.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <a
            href={`/api/attachments/${a.id}/download`}
            className="flex-1 truncate hover:underline"
          >
            {a.file_name}
          </a>
          <span className="shrink-0 text-gray-500">{formatBytes(a.byte_size)}</span>
          {내노트 && (
            <form
              action={deleteAttachment}
              onSubmit={(e) => {
                if (!confirm(`${a.file_name} 을(를) 삭제할까요?`)) e.preventDefault()
              }}
            >
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="noteId" value={noteId} />
              <button type="submit" className="shrink-0 text-red-600 hover:underline">
                삭제
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: 노트 상세 페이지에 첨부 섹션 추가**

`src/app/(app)/notes/[id]/page.tsx` 를 고친다.

(1) import 추가:

```tsx
import { AttachmentList, type AttachmentRow } from '@/components/AttachmentList'
import { AttachmentUploader } from '@/components/AttachmentUploader'
```

(2) `if (!note) notFound()` 다음에 첨부 조회 추가:

```tsx
  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, file_name, byte_size')
    .eq('note_id', note.id)
    .order('created_at', { ascending: true })

  const 첨부목록 = (attachments ?? []) as AttachmentRow[]
```

(3) 본문 `<div className="whitespace-pre-wrap ...">` 블록과 수정·삭제 블록 **사이에** 첨부 섹션을 넣는다:

```tsx
      <section className="mt-10 border-t pt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-600">첨부파일</h2>
        <AttachmentList attachments={첨부목록} 내노트={내노트} noteId={note.id} />
        {내노트 && <AttachmentUploader noteId={note.id} 현재개수={첨부목록.length} />}
      </section>
```

- [ ] **Step 5: 타입·린트·테스트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run lint`
Expected: 오류 없음

Run: `npm test`
Expected: PASS — 37개

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/attachments/[id]/download/route.ts" src/components/AttachmentList.tsx "src/app/(app)/notes/attachment-actions.ts" "src/app/(app)/notes/[id]/page.tsx"
git commit -m "첨부 목록·다운로드·삭제 추가

다운로드는 5분 만료 서명 URL로만 내보낸다. 라우트 핸들러는 (app) 레이아웃
밖이라 접근 게이트가 자동으로 걸리지 않으므로 직접 확인한다.

삭제는 행을 먼저 지우고 0행이면 파일을 건드리지 않는다.
RLS가 막았는데 파일만 지우면 기록과 실물이 어긋난다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 첨부 권한 테스트

1단계의 권한 테스트와 같은 이유로 이 태스크가 이 계획에서 가장 중요하다. 첨부는 **테이블과 스토리지 두 겹**이라 한쪽만 막혀 있어도 뚫린다.

**Files:**
- Test: `tests/rls/attachments.test.ts`

**Interfaces:**
- Consumes: Task 1의 `첨부버킷`
- Produces: 없음

- [ ] **Step 1: 실패하는 권한 테스트 작성**

`tests/rls/attachments.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const 버킷 = 'attachments'

async function 로그인(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`로그인 실패 (${email}): ${error.message}`)
  return client
}

let A: SupabaseClient
let B: SupabaseClient
let 비로그인: SupabaseClient
let A의ID: string
let B의ID: string
let 노트ID: string | undefined
let A의경로: string | undefined

const 내용 = new Blob(['테스트 파일입니다'], { type: 'text/plain' })

beforeAll(async () => {
  A = await 로그인(process.env.TEST_USER_A_EMAIL!, process.env.TEST_USER_A_PASSWORD!)
  B = await 로그인(process.env.TEST_USER_B_EMAIL!, process.env.TEST_USER_B_PASSWORD!)
  비로그인 = createClient(url, anonKey)

  A의ID = (await A.auth.getUser()).data.user!.id
  B의ID = (await B.auth.getUser()).data.user!.id

  const { data } = await A.from('notes')
    .insert({
      author_id: A의ID,
      title: '[테스트] 첨부 권한 확인용',
      body_md: '지워도 되는 노트입니다.',
      studied_on: '2026-08-05',
    })
    .select('id')
    .single()
  노트ID = data!.id

  A의경로 = `${A의ID}/${노트ID}/${crypto.randomUUID()}.txt`
})

afterAll(async () => {
  if (!A || !B) return
  if (A의경로) await A.storage.from(버킷).remove([A의경로])
  if (노트ID) await A.from('notes').delete().eq('id', 노트ID)
  await A.from('notes').delete().like('title', '[테스트]%')
  await B.from('notes').delete().like('title', '[테스트]%')
})

describe('스토리지 권한', () => {
  it('A는 자기 폴더에 파일을 올릴 수 있다', async () => {
    const { error } = await A.storage.from(버킷).upload(A의경로!, 내용)
    expect(error).toBeNull()
  })

  it('B는 A의 폴더에 파일을 올릴 수 없다', async () => {
    const 침입경로 = `${A의ID}/${노트ID}/${crypto.randomUUID()}.txt`
    const { error } = await B.storage.from(버킷).upload(침입경로, 내용)
    expect(error).not.toBeNull()
  })

  it('B는 A의 파일에 서명 URL을 만들 수 있다 (읽기는 팀 전체 허용)', async () => {
    const { data, error } = await B.storage.from(버킷).createSignedUrl(A의경로!, 60)
    expect(error).toBeNull()
    expect(data?.signedUrl).toBeTruthy()
  })

  it('B는 A의 파일을 지울 수 없다', async () => {
    await B.storage.from(버킷).remove([A의경로!])
    // 지워졌는지 A가 직접 확인한다. remove 는 막혀도 오류를 안 낼 수 있다.
    const { data } = await A.storage.from(버킷).createSignedUrl(A의경로!, 60)
    expect(data?.signedUrl).toBeTruthy()
  })

  it('비로그인 상태에서는 서명 URL을 만들 수 없다', async () => {
    const { error } = await 비로그인.storage.from(버킷).createSignedUrl(A의경로!, 60)
    expect(error).not.toBeNull()
  })
})

describe('attachments 테이블 권한', () => {
  let 첨부ID: string | undefined

  it('A는 자기 노트에 첨부를 기록할 수 있다', async () => {
    const { data, error } = await A.from('attachments')
      .insert({
        note_id: 노트ID,
        storage_path: A의경로,
        file_name: '테스트.txt',
        byte_size: 100,
        mime_type: 'text/plain',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    첨부ID = data!.id
  })

  it('B는 A의 첨부를 읽을 수 있다', async () => {
    const { data } = await B.from('attachments').select('id').eq('id', 첨부ID!)
    expect(data).toHaveLength(1)
  })

  it('B는 A의 노트에 첨부를 기록할 수 없다', async () => {
    const { error } = await B.from('attachments').insert({
      note_id: 노트ID,
      storage_path: `${B의ID}/${노트ID}/x.txt`,
      file_name: '침입.txt',
      byte_size: 100,
      mime_type: 'text/plain',
    })
    expect(error).not.toBeNull()
  })

  it('B는 A의 첨부 기록을 지울 수 없다', async () => {
    const { data } = await B.from('attachments').delete().eq('id', 첨부ID!).select('id')
    // RLS는 에러가 아니라 '삭제된 행 0개'로 막는다.
    expect(data).toHaveLength(0)

    const { data: 확인 } = await A.from('attachments').select('id').eq('id', 첨부ID!)
    expect(확인).toHaveLength(1)
  })

  it('비로그인 상태에서는 첨부를 하나도 읽을 수 없다', async () => {
    const { data } = await 비로그인.from('attachments').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 권한 테스트 실행**

Run: `npm run test:rls`
Expected: PASS — 19개 (1단계 8개 + 이번 11개)

실패하면 정책이 잘못된 것이다. 특히 "B는 A의 폴더에 파일을 올릴 수 없다"가 통과하지 못하면 **스토리지 정책의 `(storage.foldername(name))[1] = auth.uid()::text` 부분이 빠졌거나 틀린 것**이다.

- [ ] **Step 3: 커밋**

```bash
git add tests/rls/attachments.test.ts
git commit -m "첨부 권한 테스트 추가

첨부는 테이블과 스토리지 두 겹이라 한쪽만 막혀 있어도 뚫린다.
두 겹을 각각 확인한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 마크다운 렌더링

1단계에서 의도적으로 미뤄둔 항목이다. 본문 저장·조회가 확실해진 뒤에 붙인다.

**Files:**
- Create: `src/components/Markdown.tsx`
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

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 사람이 직접 해야 하는 것

1. **Task 1 Step 6** — Supabase SQL Editor에서 `0002_attachments_storage.sql` 실행
2. **수동 확인** (아래)
3. **배포** — GitHub에 push하면 Vercel이 자동 배포한다. 환경변수는 1단계에서 이미 넣었으므로 추가 작업이 없다

## 수동 확인 (전 태스크 완료 후)

개발 서버(`npm run dev`)를 띄우고 확인한다.

1. 내 노트를 열면 아래에 **첨부파일** 섹션이 보인다
2. 파일을 하나 올리면 목록에 이름과 크기가 나타난다
3. 파일 이름을 클릭하면 **원본 이름으로** 내려받아진다 (uuid 이름이 아니어야 한다)
4. **10MB가 넘는 파일**을 고르면 올라가지 않고 문구가 뜬다
5. 5개를 채우면 파일 선택이 비활성화된다
6. 다른 팀원 계정으로 그 노트를 열면 — **다운로드는 되고, 올리기·삭제 버튼은 안 보인다**
7. 본문에 `# 제목`, `- 목록`, `**굵게**`, 표를 써보면 **서식이 적용돼 보인다**
8. 본문에 `<script>alert(1)</script>` 를 적으면 **글자 그대로 보인다** (실행되지 않는다)

## 2단계 완료 기준

- [ ] `npm test` 통과 (37개)
- [ ] `npm run test:rls` 통과 (19개)
- [ ] `npm run build` 오류 없음
- [ ] 위 수동 확인 8개 전부 통과
- [ ] 배포본에서도 파일 업로드·다운로드가 된다

## 이 계획에서 다루지 않는 것

| 항목 | 근거 |
|---|---|
| 첨부 내용 파싱, PDF 텍스트 추출, OCR | §4 비목표 |
| 이미지 미리보기·썸네일 | 파싱과 같은 이유로 제외. 필요해지면 별도 논의 |
| 여러 파일 한 번에 올리기 | 하나씩으로 충분하다. 실패 처리가 복잡해진다 |
| 노트 작성 화면에서의 첨부 | 노트를 먼저 만든 뒤 상세 화면에서 붙인다 (§10) |
| AI 정리본 | 3단계 |
