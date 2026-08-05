# 팀 스터디 허브 — 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀원 4명이 로그인해 각자 노트를 올리고, 서로의 노트를 읽고, 팀원별 저장소에서 자기 기록을 훑어볼 수 있는 배포된 웹을 만든다.

**Architecture:** Next.js App Router 서버 컴포넌트가 Supabase에서 직접 데이터를 읽고, 쓰기는 서버 액션으로 처리한다. 권한은 화면이 아니라 Postgres RLS가 강제하며, 정책의 기준은 "로그인 여부"가 아니라 "`profiles` 테이블 등록 여부"다. 첨부파일과 AI 정리본은 2·3단계 계획서에서 다룬다.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + Auth), Tailwind CSS, Vitest, Vercel

**설계 문서:** `docs/2026-08-05-team-study-hub-design.md` — 이 계획의 모든 결정은 그 문서에 근거한다. 절 번호(§)는 그 문서를 가리킨다.

## Global Constraints

- Node.js 20 이상 (개발 환경 확인됨: v24.18.0, npm 11.16.0)
- Next.js 15 App Router + TypeScript. `src/` 디렉터리 사용, import alias는 `@/*`
- **모든 날짜 계산은 `Asia/Seoul` 기준.** 서버 기본 시간대(UTC)를 그대로 쓰지 않는다 (§8.1)
- **RLS 정책의 기준은 `profiles` 등록 여부다.** `auth.uid() is not null` 로 끝내지 않는다 (§9.2)
- **`profiles` 테이블의 SELECT 정책만 예외로 `using (true)`.** 정책이 자기 테이블을 조회하면 무한 재귀 오류가 난다 (§9.2, §15)
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRON_SECRET` 은 서버 전용. 클라이언트 컴포넌트에서 import되는 모듈에 들어가면 안 된다 (§9.4)
- 무료 티어만 사용한다. 결제 수단 등록이 필요한 서비스를 도입하지 않는다 (§5)
- 첨부파일 내용을 파싱하지 않는다 (§4 비목표)
- 업로드 폼에 태그·카테고리 입력칸을 만들지 않는다 (§6)
- 커밋 메시지는 한국어로 작성한다

---

## File Structure

1단계가 끝났을 때의 디렉터리 구조다.

```
study_system/
├── docs/                                기획서, 계획서
├── supabase/
│   └── migrations/
│       └── 0001_init.sql                테이블 4개 + RLS 정책 전부
├── src/
│   ├── middleware.ts                    세션 갱신, 비로그인 → /login
│   ├── lib/
│   │   ├── env.ts                       환경변수 읽기·검증
│   │   ├── date.ts                      KST 날짜 계산
│   │   ├── validation.ts                노트 입력 검증
│   │   ├── auth.ts                      현재 사용자의 profile 조회, 접근 게이트
│   │   └── supabase/
│   │       ├── client.ts                브라우저용 클라이언트
│   │       └── server.ts                서버 컴포넌트·서버 액션용 클라이언트
│   ├── components/
│   │   ├── Nav.tsx                      상단 내비게이션
│   │   └── NoteForm.tsx                 노트 작성·수정 공용 폼
│   └── app/
│       ├── layout.tsx                   루트 레이아웃
│       ├── globals.css
│       ├── login/
│       │   ├── page.tsx                 로그인 화면
│       │   └── actions.ts               로그인·로그아웃 서버 액션
│       ├── no-access/page.tsx           미등록 계정 안내
│       └── (app)/                       로그인 + profiles 등록이 필요한 영역
│           ├── layout.tsx               requireProfile 게이트 + Nav
│           ├── page.tsx                 홈 (오늘 현황)
│           ├── members/[slug]/page.tsx  팀원 저장소
│           └── notes/
│               ├── actions.ts           노트 생성·수정·삭제 서버 액션
│               ├── new/page.tsx         노트 작성
│               └── [id]/
│                   ├── page.tsx         노트 보기
│                   └── edit/page.tsx    노트 수정
├── tests/
│   ├── unit/
│   │   ├── date.test.ts
│   │   ├── env.test.ts
│   │   └── validation.test.ts
│   └── rls/
│       └── notes.test.ts                실제 Supabase 대상 권한 테스트
├── vitest.config.ts
├── .env.local                           (git에 올리지 않음)
├── .env.local.example
└── .env.test.local                      (git에 올리지 않음) 권한 테스트용 계정
```

**분리 기준:** `lib/` 안의 모듈은 각각 하나의 책임만 진다. `date.ts`와 `validation.ts`는 외부 의존이 없어 순수 단위 테스트가 가능하고, 여기에 이 프로젝트에서 가장 틀리기 쉬운 로직(시간대, 입력 검증)을 몰아넣는다. Supabase 접근은 `lib/supabase/` 안에만 존재하며, 페이지는 클라이언트를 직접 만들지 않는다.

---

## 사전 준비 (Task 2 시작 전까지 사람이 직접 해야 함)

코드로 자동화할 수 없다. Task 2에서 필요하다.

1. https://supabase.com 에서 프로젝트 생성 (무료 플랜, 리전은 Northeast Asia (Seoul) 권장)
2. Project Settings → API 에서 다음 세 값을 복사해 둔다
   - `Project URL`
   - `anon public` 키
   - `service_role` 키
3. Authentication → Sign In / Providers → **"Allow new users to sign up" 을 끈다** (§9.2 1겹)
4. Authentication → Users → Add user 로 팀원 4명 계정 생성. 이메일과 초기 비밀번호를 정해 기록해 둔다. **생성된 각 사용자의 `User UID`(uuid)를 복사해 둔다** — Task 2에서 `profiles.id` 에 그대로 넣어야 한다 (§14)

---

## Task 1: 프로젝트 뼈대와 핵심 유틸

Next.js 프로젝트를 세우고, 이 프로젝트에서 가장 틀리기 쉬운 두 가지 — 시간대 계산과 환경변수 취급 — 를 테스트로 고정한다.

**Files:**
- Create: 프로젝트 전체 뼈대 (`create-next-app` 생성물)
- Create: `src/lib/date.ts`
- Create: `src/lib/env.ts`
- Create: `vitest.config.ts`
- Create: `.env.local.example`
- Test: `tests/unit/date.test.ts`, `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `formatDateInSeoul(d: Date): string` — `'YYYY-MM-DD'`
  - `todayInSeoul(now?: Date): string` — `'YYYY-MM-DD'`
  - `getPublicEnv(): { supabaseUrl: string; supabaseAnonKey: string }`
  - `getServiceRoleKey(): string`

- [ ] **Step 1: Next.js 프로젝트 생성**

프로젝트 루트(`study_system`)에서 실행한다. `docs` 폴더와 `.git` 은 create-next-app이 허용하는 예외라 그대로 둔 채 설치된다.

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

대화형 질문이 나오면 전부 기본값을 택한다.

만약 "directory is not empty" 오류가 나면, `docs` 를 잠시 상위로 옮기고 설치한 뒤 되돌린다.

```bash
mv docs ../docs-tmp && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack && mv ../docs-tmp docs
```

- [ ] **Step 2: 의존성 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest dotenv
```

- [ ] **Step 3: vitest 설정 파일 작성**

`vitest.config.ts` 를 만든다. 설정 파일이 로드될 때 `.env.local` 과 `.env.test.local` 을 읽어 `process.env` 에 채운다. 권한 테스트(Task 2)가 이 값을 쓴다.

```ts
import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env.test.local' })

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
```

- [ ] **Step 4: 테스트 스크립트 등록**

`package.json` 의 `scripts` 에 다음 두 줄을 추가한다. 단위 테스트와 권한 테스트를 나누는 이유는, 권한 테스트가 실제 Supabase에 네트워크로 접속하기 때문이다.

```json
"test": "vitest run tests/unit",
"test:rls": "vitest run tests/rls"
```

- [ ] **Step 5: 실패하는 날짜 테스트 작성**

`tests/unit/date.test.ts` 를 만든다. 세 번째 케이스가 핵심이다 — 크론이 UTC로 도는데 KST 기준 날짜를 구해야 하는 상황을 그대로 재현한다 (§8.1).

```ts
import { describe, it, expect } from 'vitest'
import { formatDateInSeoul, todayInSeoul } from '@/lib/date'

describe('formatDateInSeoul', () => {
  it('YYYY-MM-DD 형식으로 반환한다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T05:00:00Z'))).toBe('2026-08-05')
  })

  it('크론 실행 시각(14:50 UTC)은 같은 날 KST다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T14:50:00Z'))).toBe('2026-08-05')
  })

  it('15:00 UTC를 넘기면 KST로는 다음 날이다', () => {
    expect(formatDateInSeoul(new Date('2026-08-05T15:10:00Z'))).toBe('2026-08-06')
  })

  it('UTC 자정 직전도 KST로는 이미 다음 날이다', () => {
    expect(formatDateInSeoul(new Date('2026-08-04T23:00:00Z'))).toBe('2026-08-05')
  })
})

describe('todayInSeoul', () => {
  it('주어진 시각을 KST 날짜로 바꾼다', () => {
    expect(todayInSeoul(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })
})
```

- [ ] **Step 6: 실패하는 환경변수 테스트 작성**

`tests/unit/env.test.ts` 를 만든다.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPublicEnv, getServiceRoleKey } from '@/lib/env'

const 원래값 = { ...process.env }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
})

afterEach(() => {
  process.env = { ...원래값 }
  delete (globalThis as Record<string, unknown>).window
})

describe('getPublicEnv', () => {
  it('설정된 값을 읽는다', () => {
    expect(getPublicEnv()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    })
  })

  it('값이 없으면 변수 이름을 알려주며 실패한다', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})

describe('getServiceRoleKey', () => {
  it('서버에서는 값을 반환한다', () => {
    expect(getServiceRoleKey()).toBe('service-key')
  })

  it('브라우저 환경이면 값을 읽기 전에 막는다', () => {
    ;(globalThis as Record<string, unknown>).window = {}
    expect(() => getServiceRoleKey()).toThrow(/브라우저/)
  })
})
```

- [ ] **Step 7: 테스트를 돌려 실패를 확인**

Run: `npm test`
Expected: FAIL — `@/lib/date`, `@/lib/env` 를 찾을 수 없다는 오류

- [ ] **Step 8: `src/lib/date.ts` 구현**

`en-CA` 로케일이 `YYYY-MM-DD` 를 내놓는다는 점을 이용한다. 직접 문자열을 조립하지 않는 이유는, 시간대 변환을 손으로 계산하면 반드시 틀리기 때문이다.

```ts
const SEOUL = 'Asia/Seoul'

const 서울날짜포맷 = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Date를 KST 기준 'YYYY-MM-DD' 문자열로 바꾼다. */
export function formatDateInSeoul(d: Date): string {
  return 서울날짜포맷.format(d)
}

/** 지금(또는 주어진 시각)의 KST 날짜. 기본 인자는 테스트를 위해 열어둔다. */
export function todayInSeoul(now: Date = new Date()): string {
  return formatDateInSeoul(now)
}
```

- [ ] **Step 9: `src/lib/env.ts` 구현**

```ts
function 필수(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다. .env.local 을 확인하세요.`)
  }
  return value
}

export function getPublicEnv() {
  return {
    supabaseUrl: 필수('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: 필수('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

/**
 * service role 키는 RLS를 통째로 우회한다. 브라우저로 새어나가면 안 되므로
 * 값을 읽기 전에 실행 환경부터 확인한다.
 */
export function getServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('service role 키는 브라우저에서 접근할 수 없습니다')
  }
  return 필수('SUPABASE_SERVICE_ROLE_KEY')
}
```

- [ ] **Step 10: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 9개 테스트 전부 통과

- [ ] **Step 11: 환경변수 예시 파일 작성**

`.env.local.example` 을 만든다. 실제 값이 들어가는 `.env.local` 은 `create-next-app` 이 만든 `.gitignore` 에 이미 포함돼 있다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 12: `.gitignore` 에 테스트 계정 파일 추가**

`.gitignore` 끝에 다음 줄을 추가한다. 이 파일에는 실제 팀원 계정의 비밀번호가 들어간다.

```
.env.test.local
```

- [ ] **Step 13: 개발 서버가 뜨는지 확인**

Run: `npm run dev`
Expected: `http://localhost:3000` 에서 Next.js 기본 페이지가 보인다. 확인 후 종료한다.

- [ ] **Step 14: 커밋**

```bash
git add -A
git commit -m "프로젝트 뼈대 생성 및 KST 날짜·환경변수 유틸 추가

날짜 계산은 전부 Asia/Seoul 기준으로 고정한다. 크론이 UTC로 돌기 때문에
서버 기본 시간대를 쓰면 15:00 UTC 이후 전날 날짜를 잡게 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 데이터베이스 스키마와 권한 정책

테이블 4개와 RLS 정책을 만들고, **권한이 실제로 막히는지를 실제 Supabase에 붙여 검증한다.** 이 태스크의 테스트가 이 프로젝트에서 가장 중요하다 (§11.1). 권한 결함은 에러를 내지 않고 조용히 존재하기 때문이다.

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `.env.test.local`
- Test: `tests/rls/notes.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 테이블 `profiles`, `notes`, `attachments`, `digests` 와 그 위의 RLS 정책. 이후 모든 태스크가 이 스키마 위에서 동작한다.
  - `profiles(id uuid, display_name text, slug text, avatar_url text, created_at timestamptz)`
  - `notes(id uuid, author_id uuid, title text, body_md text, studied_on date, created_at timestamptz, updated_at timestamptz)`

- [ ] **Step 1: 사전 준비가 끝났는지 확인**

이 문서 위쪽의 "사전 준비" 4개 항목이 모두 완료돼 있어야 한다. 특히 팀원 4명의 `User UID` 가 필요하다.

- [ ] **Step 2: `.env.local` 채우기**

`.env.local.example` 을 복사해 `.env.local` 을 만들고, 사전 준비 2단계에서 복사한 세 값을 넣는다.

```bash
cp .env.local.example .env.local
```

- [ ] **Step 3: 마이그레이션 SQL 작성**

`supabase/migrations/0001_init.sql` 을 만든다.

```sql
-- ============================================================
-- 팀 스터디 허브 초기 스키마
-- 설계 문서 §7(데이터 모델), §9.2(권한) 참조
-- ============================================================

-- ---------- 테이블 ----------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  slug         text not null unique,
  avatar_url   text,
  -- 내비게이션에 표시할 순서. 이름순 정렬은 승인된 화면(지호 민수 서연 태현)과
  -- 어긋나므로 순서를 직접 지정한다.
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body_md    text not null,
  -- 업로드 시각이 아니라 '공부한 날짜'. 어젯밤 공부하고 오늘 올리는 경우 때문에 분리한다.
  studied_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_author_studied_idx on public.notes (author_id, studied_on desc);
create index notes_studied_idx        on public.notes (studied_on desc);

-- 2단계에서 사용. 지금 함께 만들어 마이그레이션을 한 번으로 끝낸다.
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  byte_size    integer not null,
  mime_type    text,
  created_at   timestamptz not null default now()
);

create index attachments_note_idx on public.attachments (note_id);

-- 3단계에서 사용.
create table public.digests (
  digest_date     date primary key,
  body_md         text,
  has_connections boolean not null default false,
  status          text not null check (status in ('generating', 'done', 'failed')),
  model           text,
  started_at      timestamptz,
  generated_at    timestamptz,
  error_message   text
);

-- ---------- updated_at 자동 갱신 ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------- RLS 활성화 ----------

alter table public.profiles    enable row level security;
alter table public.notes       enable row level security;
alter table public.attachments enable row level security;
alter table public.digests     enable row level security;

-- ---------- profiles ----------
-- 주의: 여기에 'auth.uid() in (select id from profiles)' 를 쓰면 정책이 자기
-- 테이블을 조회하게 되어 무한 재귀 오류가 난다. profiles만 예외로 둔다.
-- 등록되지 않은 계정에게 노출되는 것은 팀원 4명의 이름과 slug뿐이다.

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

-- INSERT/UPDATE/DELETE 정책을 만들지 않는다. profiles는 대시보드에서만 관리한다.

-- ---------- notes ----------

create policy "notes_select" on public.notes
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "notes_insert" on public.notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

create policy "notes_update" on public.notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (author_id = auth.uid());

-- ---------- attachments ----------
-- 첨부는 노트를 따라간다. 노트가 보이면 첨부도 보이고, 내 노트의 첨부만 건드릴 수 있다.

create policy "attachments_select" on public.attachments
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "attachments_insert" on public.attachments
  for insert to authenticated
  with check (
    exists (select 1 from public.notes n where n.id = note_id and n.author_id = auth.uid())
  );

create policy "attachments_delete" on public.attachments
  for delete to authenticated
  using (
    exists (select 1 from public.notes n where n.id = note_id and n.author_id = auth.uid())
  );

-- ---------- digests ----------
-- 읽기만 허용한다. 쓰기 정책을 만들지 않으므로 일반 사용자는 쓸 수 없고,
-- 서버의 service role 키가 RLS를 우회해 기록한다.

create policy "digests_select" on public.digests
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
```

- [ ] **Step 4: Supabase에 마이그레이션 적용**

Supabase 대시보드 → SQL Editor → New query 에 `0001_init.sql` 내용을 전부 붙여넣고 Run 한다.
Expected: "Success. No rows returned"

- [ ] **Step 5: `profiles` 행 4개 입력**

SQL Editor에서 실행한다. **`id` 는 사전 준비 4단계에서 복사한 실제 `User UID` 로 바꿔야 한다.** 이름과 slug도 실제 팀원에 맞게 바꾼다. slug는 URL에 들어가므로 영문 소문자로 쓴다.

```sql
insert into public.profiles (id, display_name, slug, sort_order) values
  ('여기에-A의-uuid', '지호', 'jiho',    1),
  ('여기에-B의-uuid', '민수', 'minsu',   2),
  ('여기에-C의-uuid', '서연', 'seoyeon', 3),
  ('여기에-D의-uuid', '태현', 'taehyun', 4);
```

**uuid를 제대로 넣었는지 반드시 확인한다.** 이 검증을 건너뛰면 나중에 "로그인은 되는데 모든 페이지가 `/no-access` 로 간다"는 증상을 만나게 되고, 화면상 "등록되지 않은 계정"과 구분되지 않아 원인을 찾기 어렵다.

```sql
select p.slug, p.display_name, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.sort_order;
```

Expected: **4행**, 각 slug 옆에 그 팀원의 실제 이메일이 붙어 있다.
4행보다 적게 나오면 uuid를 잘못 넣은 것이다. 빠진 사람의 `User UID` 를 다시 복사해 수정한다.

- [ ] **Step 6: 테스트 계정 파일 작성**

`.env.test.local` 을 만든다. 팀원 4명 중 **두 명의 실제 계정**을 쓴다. 권한 테스트는 A가 만든 노트를 B가 건드릴 수 있는지 확인해야 하므로 서로 다른 두 계정이 필요하다.

```
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

이 파일은 Step 12(Task 1)에서 `.gitignore` 에 넣어뒀다. 커밋되지 않는지 `git status` 로 확인한다.

- [ ] **Step 7: 실패하는 권한 테스트 작성**

`tests/rls/notes.test.ts` 를 만든다.

**여기서 반드시 알아야 할 것:** RLS가 UPDATE·DELETE를 막을 때 Supabase는 **에러를 던지지 않는다.** 정책의 `using` 절이 대상 행을 애초에 보이지 않게 만들기 때문에, "0행이 수정됨"이라는 성공 응답이 돌아온다. 그래서 `error` 가 아니라 **반환된 행 수**로 검증한다.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function 로그인(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`로그인 실패 (${email}): ${error.message}`)
  return client
}

let A: SupabaseClient
let B: SupabaseClient
let 비로그인: SupabaseClient
let A의프로필ID: string
let 만든노트ID: string | undefined

beforeAll(async () => {
  A = await 로그인(process.env.TEST_USER_A_EMAIL!, process.env.TEST_USER_A_PASSWORD!)
  B = await 로그인(process.env.TEST_USER_B_EMAIL!, process.env.TEST_USER_B_PASSWORD!)
  비로그인 = createClient(url, anonKey)

  const { data } = await A.auth.getUser()
  A의프로필ID = data.user!.id
})

afterAll(async () => {
  // 테스트가 실제 DB에 쓰므로 반드시 치운다.
  if (만든노트ID) await A.from('notes').delete().eq('id', 만든노트ID)

  // 사칭 테스트가 실패하면(= 정책이 잘못돼 INSERT가 통과하면) 추적되지 않은
  // 행이 남아 팀 홈 화면에 '[테스트] 사칭 시도'가 뜬다. 제목으로 한 번 더 쓸어낸다.
  await A.from('notes').delete().like('title', '[테스트]%')
  await B.from('notes').delete().like('title', '[테스트]%')
})

describe('notes 권한', () => {
  it('A는 자기 노트를 만들 수 있다', async () => {
    const { data, error } = await A
      .from('notes')
      .insert({
        author_id: A의프로필ID,
        title: '[테스트] 권한 확인용 노트',
        body_md: '지워도 되는 노트입니다.',
        studied_on: '2026-08-05',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    만든노트ID = data!.id
  })

  it('B는 A의 노트를 읽을 수 있다', async () => {
    const { data, error } = await B.from('notes').select('id, title').eq('id', 만든노트ID!)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('B는 A의 노트를 수정할 수 없다', async () => {
    const { data } = await B
      .from('notes')
      .update({ title: '가로챈 제목' })
      .eq('id', 만든노트ID!)
      .select()

    // 에러가 아니라 '수정된 행 0개'로 막힌다.
    expect(data).toHaveLength(0)

    const { data: 확인 } = await A.from('notes').select('title').eq('id', 만든노트ID!).single()
    expect(확인!.title).toBe('[테스트] 권한 확인용 노트')
  })

  it('B는 A의 노트를 삭제할 수 없다', async () => {
    const { data } = await B.from('notes').delete().eq('id', 만든노트ID!).select()
    expect(data).toHaveLength(0)

    const { data: 확인 } = await A.from('notes').select('id').eq('id', 만든노트ID!)
    expect(확인).toHaveLength(1)
  })

  it('B는 A의 이름으로 노트를 만들 수 없다', async () => {
    const { error } = await B.from('notes').insert({
      author_id: A의프로필ID,
      title: '[테스트] 사칭 시도',
      body_md: '이건 저장되면 안 됩니다.',
      studied_on: '2026-08-05',
    })

    // INSERT는 with check 위반이므로 에러가 난다.
    expect(error).not.toBeNull()
  })

  it('비로그인 상태에서는 노트를 하나도 읽을 수 없다', async () => {
    const { data } = await 비로그인.from('notes').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('profiles 권한', () => {
  it('로그인한 사용자는 팀원 목록을 읽을 수 있다 (재귀 오류가 나지 않아야 한다)', async () => {
    const { data, error } = await A.from('profiles').select('id, display_name, slug')
    expect(error).toBeNull()
    expect(data!.length).toBe(4)
  })

  it('비로그인 상태에서는 팀원 목록도 읽을 수 없다', async () => {
    const { data } = await 비로그인.from('profiles').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 8: 권한 테스트 실행**

Run: `npm run test:rls`
Expected: PASS — 8개 전부 통과

한 개라도 실패하면 정책이 잘못된 것이다. 특히 `profiles` 테스트에서 `infinite recursion detected in policy` 오류가 나면, `profiles_select` 정책이 `using (true)` 가 아닌 다른 조건으로 들어간 것이다.

- [ ] **Step 9: 커밋**

```bash
git add supabase/ tests/rls/ .env.local.example
git commit -m "DB 스키마와 RLS 정책 추가

권한 기준은 '로그인 여부'가 아니라 'profiles 등록 여부'다.
profiles 테이블의 SELECT 정책만 무한 재귀를 피하려 using(true)로 둔다.

RLS의 UPDATE/DELETE 차단은 에러가 아니라 '영향받은 행 0개'로 나타나므로
테스트도 반환 행 수로 검증한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Supabase 클라이언트와 로그인

로그인 화면을 만들고 세션을 유지한다.

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`

**Interfaces:**
- Consumes: `getPublicEnv()` (Task 1)
- Produces:
  - `createSupabaseBrowserClient(): SupabaseClient`
  - `createSupabaseServerClient(): Promise<SupabaseClient>`
  - 서버 액션 `login(prevState, formData): Promise<{ error: string | null }>`
  - 서버 액션 `logout(): Promise<void>`

- [ ] **Step 1: 브라우저 클라이언트 작성**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
```

- [ ] **Step 2: 서버 클라이언트 작성**

`src/lib/supabase/server.ts`. Next.js 15에서 `cookies()` 는 비동기다.

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicEnv } from '@/lib/env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 미들웨어가 담당하므로 무시한다.
        }
      },
    },
  })
}
```

- [ ] **Step 3: 미들웨어 작성**

`src/middleware.ts`. 세션 쿠키를 갱신하고, 로그인하지 않은 접근을 `/login` 으로 보낸다.

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const 공개경로 = ['/login', '/no-access']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser()를 호출해야 만료된 세션이 갱신된다.
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  if (!user && !공개경로.includes(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: 로그인 서버 액션 작성**

`src/app/login/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type LoginState = { error: string | null }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 모두 입력하세요' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // 어느 쪽이 틀렸는지 알려주지 않는다.
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다' }
  }

  redirect('/')
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 5: 로그인 화면 작성**

`src/app/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const 초기상태: LoginState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, 초기상태)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-8 text-2xl font-bold">팀 스터디</h1>

      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="이메일"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          className="rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? '로그인 중…' : '로그인'}
        </button>
      </form>

      {state.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}
    </main>
  )
}
```

- [ ] **Step 6: 수동 확인**

Run: `npm run dev`

1. `http://localhost:3000/` 접속 → `/login` 으로 튕겨야 한다
2. 틀린 비밀번호 입력 → "이메일 또는 비밀번호가 올바르지 않습니다"
3. 올바른 계정 입력 → `/` 로 이동 (아직 Next.js 기본 페이지)
4. 브라우저를 껐다 켜도 `/login` 으로 튕기지 않아야 한다 (세션 유지 확인)

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "이메일·비밀번호 로그인과 세션 유지 구현

가입 페이지는 만들지 않는다. 계정은 Supabase 대시보드에서만 생성한다.
로그인 실패 시 이메일과 비밀번호 중 무엇이 틀렸는지 구분해 알려주지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 접근 게이트와 내비게이션

로그인은 했지만 `profiles` 에 없는 계정을 걸러내고, 팀원 4명 이름이 고정된 상단 내비게이션을 만든다 (§6, §9.2 2겹).

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/no-access/page.tsx`
- Create: `src/components/Nav.tsx`
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (Task 3), `logout()` (Task 3)
- Produces:
  - `type Profile = { id: string; display_name: string; slug: string; avatar_url: string | null }`
  - `getCurrentProfile(): Promise<Profile | null>`
  - `requireProfile(): Promise<Profile>` — 미등록이면 `/no-access` 로 리다이렉트
  - `getAllProfiles(): Promise<Profile[]>` — `sort_order` 오름차순

- [ ] **Step 1: 인증 헬퍼 작성**

`src/lib/auth.ts`:

```ts
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type Profile = {
  id: string
  display_name: string
  slug: string
  avatar_url: string | null
}

const 프로필컬럼 = 'id, display_name, slug, avatar_url'

/** 로그인 상태이고 profiles에 등록돼 있으면 프로필을, 아니면 null을 반환한다. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select(프로필컬럼)
    .eq('id', user.id)
    .maybeSingle()

  return (data as Profile | null) ?? null
}

/**
 * 등록된 팀원만 통과시킨다.
 * 비로그인은 미들웨어가 이미 /login 으로 보내므로, 여기 걸리는 것은
 * '로그인은 됐지만 profiles에 없는 계정'이다.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/no-access')
  return profile
}

export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('profiles')
    .select(프로필컬럼)
    .order('sort_order', { ascending: true })

  return (data as Profile[] | null) ?? []
}
```

- [ ] **Step 2: 미등록 안내 화면 작성**

`src/app/no-access/page.tsx`. 빈 화면을 보여주면 고장으로 오해한다 (§10).

```tsx
import { logout } from '@/app/login/actions'

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-3 text-xl font-bold">접근 권한이 없습니다</h1>
      <p className="mb-6 text-sm text-gray-600">
        로그인은 되었지만 이 스터디의 팀원으로 등록되어 있지 않습니다.
        관리자에게 문의하세요.
      </p>
      <form action={logout}>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: 내비게이션 컴포넌트 작성**

`src/components/Nav.tsx`. 팀원 4명 이름을 상단에 고정 노출한다 (§6).

```tsx
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import type { Profile } from '@/lib/auth'

export function Nav({ profiles, current }: { profiles: Profile[]; current: Profile }) {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/" className="font-bold">홈</Link>

        <span className="text-gray-300">|</span>

        {profiles.map((p) => (
          <Link
            key={p.id}
            href={`/members/${p.slug}`}
            className={p.id === current.id ? 'font-semibold underline' : ''}
          >
            {p.display_name}
          </Link>
        ))}

        <span className="text-gray-300">|</span>

        <Link href="/digests">정리본</Link>

        <form action={logout} className="ml-auto">
          <button type="submit" className="text-gray-500 hover:text-black">
            로그아웃
          </button>
        </form>
      </nav>
    </header>
  )
}
```

`/digests` 는 3단계에서 만든다. 지금 누르면 404가 나며, 이는 의도된 상태다.

- [ ] **Step 4: 보호 영역 레이아웃 작성**

`src/app/(app)/layout.tsx`. `(app)` 은 URL에 나타나지 않는 라우트 그룹이다. 이 아래 모든 페이지가 자동으로 게이트를 통과한다.

```tsx
import { requireProfile, getAllProfiles } from '@/lib/auth'
import { Nav } from '@/components/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const profiles = await getAllProfiles()

  return (
    <>
      <Nav profiles={profiles} current={profile} />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </>
  )
}
```

- [ ] **Step 5: 기존 홈 페이지를 보호 영역으로 이동**

```bash
mkdir -p "src/app/(app)"
mv src/app/page.tsx "src/app/(app)/page.tsx"
```

- [ ] **Step 6: 수동 확인**

Run: `npm run dev`

1. 등록된 계정으로 로그인 → 상단에 `홈 | 지호 민수 서연 태현 | 정리본` 이 보인다
2. 로그아웃 버튼 → `/login` 으로 이동
3. 미등록 계정 확인: Supabase 대시보드에서 임시 계정을 하나 더 만들고(`profiles` 에는 넣지 않는다) 그 계정으로 로그인 → `/no-access` 로 이동해야 한다. **확인 후 임시 계정을 삭제한다.**

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "접근 게이트와 팀원 내비게이션 추가

로그인만으로는 통과시키지 않는다. profiles에 등록된 계정만 (app) 영역에
들어갈 수 있고, 미등록 계정은 빈 화면 대신 안내 페이지로 보낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 노트 작성

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/components/NoteForm.tsx`
- Create: `src/app/(app)/notes/actions.ts`
- Create: `src/app/(app)/notes/new/page.tsx`
- Test: `tests/unit/validation.test.ts`

**Interfaces:**
- Consumes: `requireProfile()` (Task 4), `todayInSeoul()` (Task 1), `createSupabaseServerClient()` (Task 3)
- Produces:
  - `type NoteInput = { title: string; bodyMd: string; studiedOn: string }`
  - `type ParseResult = { ok: true; value: NoteInput } | { ok: false; message: string }`
  - `parseNoteInput(raw: { title: unknown; bodyMd: unknown; studiedOn: unknown }): ParseResult`
  - 서버 액션 `createNote(prevState, formData): Promise<{ error: string | null }>`
  - `NoteForm` 컴포넌트 — props: `{ action, initial?, submitLabel }`

- [ ] **Step 1: 실패하는 검증 테스트 작성**

`tests/unit/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNoteInput } from '@/lib/validation'

const 정상 = { title: '토큰 최적화 정리', bodyMd: '오늘 배운 것', studiedOn: '2026-08-05' }

describe('parseNoteInput', () => {
  it('정상 입력을 통과시키고 공백을 정리한다', () => {
    const r = parseNoteInput({ ...정상, title: '  토큰 최적화 정리  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.title).toBe('토큰 최적화 정리')
  })

  it('제목이 비면 거부한다', () => {
    const r = parseNoteInput({ ...정상, title: '   ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/제목/)
  })

  it('제목이 200자를 넘으면 거부한다', () => {
    const r = parseNoteInput({ ...정상, title: 'ㄱ'.repeat(201) })
    expect(r.ok).toBe(false)
  })

  it('본문이 비면 거부한다', () => {
    const r = parseNoteInput({ ...정상, bodyMd: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/내용/)
  })

  it('날짜 형식이 다르면 거부한다', () => {
    const r = parseNoteInput({ ...정상, studiedOn: '2026/08/05' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/날짜/)
  })

  it('달력에 없는 날짜를 거부한다', () => {
    const r = parseNoteInput({ ...정상, studiedOn: '2026-02-31' })
    expect(r.ok).toBe(false)
  })

  it('문자열이 아닌 값을 거부한다', () => {
    const r = parseNoteInput({ title: 123, bodyMd: null, studiedOn: undefined })
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `@/lib/validation` 없음

- [ ] **Step 3: 검증 모듈 구현**

`src/lib/validation.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 16개 전부 통과 (Task 1의 9개 + 이번 7개)

- [ ] **Step 5: 노트 작성 서버 액션 작성**

`src/app/(app)/notes/actions.ts`. 파일 첨부는 2단계에서 이 액션에 붙인다.

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseNoteInput, type NoteFormState } from '@/lib/validation'

export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const profile = await requireProfile()

  const parsed = parseNoteInput({
    title: formData.get('title'),
    bodyMd: formData.get('bodyMd'),
    studiedOn: formData.get('studiedOn'),
  })
  if (!parsed.ok) return { error: parsed.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({
      author_id: profile.id,
      title: parsed.value.title,
      body_md: parsed.value.bodyMd,
      studied_on: parsed.value.studiedOn,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: '저장하지 못했습니다. 잠시 후 다시 시도하세요.' }
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  redirect(`/notes/${data.id}`)
}
```

- [ ] **Step 6: 노트 폼 컴포넌트 작성**

`src/components/NoteForm.tsx`. 작성과 수정이 함께 쓴다. **태그·카테고리 입력칸을 만들지 않는다** (§6).

`NoteFormState` 는 `lib/validation.ts` 에서 가져온다. 서버 액션 파일에서 가져오면 `@/app/(app)/notes/actions` 처럼 괄호가 든 경로를 import하게 되는데, 라우트 그룹 경로는 도구에 따라 해석이 갈릴 수 있어 피한다.

```tsx
'use client'

import { useActionState } from 'react'
import type { NoteFormState } from '@/lib/validation'

type Props = {
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>
  initial?: { title: string; bodyMd: string; studiedOn: string }
  submitLabel: string
  defaultStudiedOn: string
}

const 초기상태: NoteFormState = { error: null }

export function NoteForm({ action, initial, submitLabel, defaultStudiedOn }: Props) {
  const [state, formAction, pending] = useActionState(action, 초기상태)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm text-gray-600">제목</label>
        <input
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

- [ ] **Step 7: 작성 페이지 작성**

`src/app/(app)/notes/new/page.tsx`. 날짜 기본값은 **KST 오늘**이다 (§8.1).

```tsx
import { NoteForm } from '@/components/NoteForm'
import { createNote } from '../actions'
import { todayInSeoul } from '@/lib/date'

export default function NewNotePage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-bold">스터디 올리기</h1>
      <NoteForm action={createNote} submitLabel="올리기" defaultStudiedOn={todayInSeoul()} />
    </>
  )
}
```

- [ ] **Step 8: 수동 확인**

Run: `npm run dev`

1. `/notes/new` 접속 → 날짜 칸에 오늘 날짜(KST)가 들어있다
2. 제목을 비우고 제출 → 브라우저 기본 검증에 걸린다
3. 정상 입력 후 제출 → `/notes/[id]` 로 이동 (아직 404. 다음 태스크에서 만든다)
4. Supabase 대시보드 Table Editor에서 `notes` 에 행이 생겼는지 확인

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "노트 작성 기능 추가

입력 검증을 순수 함수로 분리해 단위 테스트로 고정했다.
'2026-02-31' 처럼 Date가 조용히 굴려버리는 날짜도 거부한다.
공부한 날짜의 기본값은 KST 오늘이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 노트 보기와 수정·삭제

**Files:**
- Create: `src/app/(app)/notes/[id]/page.tsx`
- Create: `src/app/(app)/notes/[id]/edit/page.tsx`
- Modify: `src/app/(app)/notes/actions.ts` (updateNote, deleteNote 추가)

**Interfaces:**
- Consumes: `NoteForm` (Task 5), `parseNoteInput` (Task 5), `requireProfile()` (Task 4)
- Produces:
  - 서버 액션 `updateNote(prevState, formData): Promise<{ error: string | null }>` — `formData` 에 `id` 필드가 포함돼야 한다
  - 서버 액션 `deleteNote(formData): Promise<void>` — `formData` 에 `id` 필드가 포함돼야 한다

- [ ] **Step 1: 수정·삭제 액션 추가**

`src/app/(app)/notes/actions.ts` 끝에 추가한다.

```ts
export async function updateNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const profile = await requireProfile()
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: '잘못된 요청입니다' }

  const parsed = parseNoteInput({
    title: formData.get('title'),
    bodyMd: formData.get('bodyMd'),
    studiedOn: formData.get('studiedOn'),
  })
  if (!parsed.ok) return { error: parsed.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('notes')
    .update({
      title: parsed.value.title,
      body_md: parsed.value.bodyMd,
      studied_on: parsed.value.studiedOn,
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: '저장하지 못했습니다. 잠시 후 다시 시도하세요.' }

  // RLS가 막으면 에러가 아니라 '수정된 행 0개'로 돌아온다. 여기서 잡아야 한다.
  if (!data || data.length === 0) {
    return { error: '이 노트를 수정할 권한이 없습니다' }
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  revalidatePath(`/notes/${id}`)
  redirect(`/notes/${id}`)
}

export async function deleteNote(formData: FormData): Promise<void> {
  const profile = await requireProfile()
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/')

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('notes').delete().eq('id', id).select('id')

  // 수정과 마찬가지로, RLS는 에러 대신 '삭제된 행 0개'로 막는다.
  // 결과를 버리고 리다이렉트하면 실패를 성공처럼 보여주게 된다.
  if (!data || data.length === 0) {
    redirect(`/notes/${id}`)
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  redirect(`/members/${profile.slug}`)
}
```

- [ ] **Step 2: 삭제 버튼 컴포넌트 작성**

`src/components/DeleteNoteButton.tsx`. 삭제는 되돌릴 수 없으므로 한 번 묻는다. 노트 보기 페이지는 서버 컴포넌트라 확인 창을 띄우려면 작은 클라이언트 컴포넌트가 필요하다.

```tsx
'use client'

import { deleteNote } from '@/app/(app)/notes/actions'

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  return (
    <form
      action={deleteNote}
      onSubmit={(e) => {
        if (!confirm('이 노트를 삭제할까요? 되돌릴 수 없습니다.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={noteId} />
      <button type="submit" className="rounded border px-3 py-1 text-red-600">
        삭제
      </button>
    </form>
  )
}
```

- [ ] **Step 3: 노트 보기 페이지 작성**

`src/app/(app)/notes/[id]/page.tsx`. 마크다운 렌더러는 아직 붙이지 않는다 — 라이브러리를 하나 더 들이기 전에 본문이 저장·조회되는지부터 확실히 한다. 지금은 줄바꿈을 보존해 그대로 보여준다.

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DeleteNoteButton } from '@/components/DeleteNoteButton'

type Props = { params: Promise<{ id: string }> }

export default async function NotePage({ params }: Props) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createSupabaseServerClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, title, body_md, studied_on, author_id, profiles(display_name, slug)')
    .eq('id', id)
    .maybeSingle()

  if (!note) notFound()

  const author = note.profiles as unknown as { display_name: string; slug: string }
  const 내노트 = note.author_id === profile.id

  return (
    <article>
      <div className="mb-2 text-sm text-gray-500">
        <Link href={`/members/${author.slug}`} className="hover:underline">
          {author.display_name}
        </Link>
        {' · '}
        {note.studied_on}
      </div>

      <h1 className="mb-6 text-2xl font-bold">{note.title}</h1>

      <div className="whitespace-pre-wrap leading-relaxed">{note.body_md}</div>

      {내노트 && (
        <div className="mt-10 flex gap-3 border-t pt-4 text-sm">
          <Link href={`/notes/${note.id}/edit`} className="rounded border px-3 py-1">
            수정
          </Link>
          <DeleteNoteButton noteId={note.id} />
        </div>
      )}
    </article>
  )
}
```

- [ ] **Step 4: `NoteForm` 에 hiddenFields 지원 추가**

수정 액션은 어느 노트인지 알아야 하므로 폼이 `id` 를 함께 보내야 한다. `src/components/NoteForm.tsx` 를 세 군데 고친다.

(1) Props 타입에 한 줄 추가:

```ts
  hiddenFields?: Record<string, string>
```

(2) 구조 분해에 추가:

```tsx
export function NoteForm({ action, initial, submitLabel, defaultStudiedOn, hiddenFields }: Props) {
```

(3) `<form action={formAction} ...>` 여는 태그 바로 다음에 추가:

```tsx
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
```

- [ ] **Step 5: 노트 수정 페이지 작성**

`src/app/(app)/notes/[id]/edit/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NoteForm } from '@/components/NoteForm'
import { updateNote } from '../../actions'
import { todayInSeoul } from '@/lib/date'

type Props = { params: Promise<{ id: string }> }

export default async function EditNotePage({ params }: Props) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createSupabaseServerClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, title, body_md, studied_on, author_id')
    .eq('id', id)
    .maybeSingle()

  if (!note) notFound()
  // RLS가 남의 노트 수정을 이미 막지만, 화면에서도 미리 돌려보낸다.
  if (note.author_id !== profile.id) redirect(`/notes/${id}`)

  return (
    <>
      <h1 className="mb-6 text-xl font-bold">노트 수정</h1>
      <NoteForm
        action={updateNote}
        initial={{ title: note.title, bodyMd: note.body_md, studiedOn: note.studied_on }}
        submitLabel="저장"
        defaultStudiedOn={todayInSeoul()}
        hiddenFields={{ id: note.id }}
      />
    </>
  )
}
```

- [ ] **Step 6: 수동 확인**

Run: `npm run dev`

1. Task 5에서 만든 노트를 열어 제목·본문·날짜가 보이는지 확인
2. 수정 → 내용 바꾸고 저장 → 반영 확인
3. 다른 팀원 계정으로 로그인해 같은 노트를 연다 → **수정·삭제 버튼이 보이지 않아야 한다**
4. 그 상태에서 주소창에 `/notes/[id]/edit` 직접 입력 → 노트 보기로 되돌려져야 한다
5. 자기 계정으로 삭제 → 확인 창이 뜨고, 취소하면 삭제되지 않는다
6. 확인을 누르면 자기 저장소로 이동 (아직 404. 다음 태스크에서 만든다)

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "노트 보기·수정·삭제 추가

수정 액션에서 '영향받은 행 0개'를 권한 거부로 해석해 사용자에게 알린다.
RLS는 에러 대신 빈 결과로 막기 때문에 이 처리가 없으면 조용히 실패한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 팀원 스터디 저장소

**Files:**
- Create: `src/app/(app)/members/[slug]/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` (Task 3)
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 저장소 페이지 작성**

`src/app/(app)/members/[slug]/page.tsx`. 제목 검색과 월별 필터를 URL 쿼리로 받는다. 서버 컴포넌트에서 직접 처리하므로 클라이언트 상태 관리가 필요 없다.

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; month?: string }>
}

const 월형식 = /^\d{4}-\d{2}$/

export default async function MemberPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { q, month } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (!profile) notFound()

  let query = supabase
    .from('notes')
    .select('id, title, studied_on', { count: 'exact' })
    .eq('author_id', profile.id)
    .order('studied_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (q && q.trim()) {
    query = query.ilike('title', `%${q.trim()}%`)
  }

  if (month && 월형식.test(month)) {
    // 해당 월의 1일 이상, 다음 달 1일 미만
    const [y, m] = month.split('-').map(Number)
    const 시작 = `${month}-01`
    const 다음달 = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    query = query.gte('studied_on', 시작).lt('studied_on', 다음달)
  }

  const { data: notes, count } = await query

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{profile.display_name}의 스터디 저장소</h1>
        <span className="text-sm text-gray-500">총 {count ?? 0}개</span>
      </div>

      <form className="mb-6 flex gap-2 text-sm">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="제목 검색"
          className="rounded border px-3 py-1.5"
        />
        <input
          name="month"
          type="month"
          defaultValue={month ?? ''}
          className="rounded border px-3 py-1.5"
        />
        <button type="submit" className="rounded border px-3 py-1.5">찾기</button>
        {(q || month) && (
          <Link href={`/members/${slug}`} className="px-3 py-1.5 text-gray-500">
            초기화
          </Link>
        )}
      </form>

      {(notes ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">아직 올린 노트가 없습니다.</p>
      ) : (
        <ul className="divide-y">
          {notes!.map((n) => (
            <li key={n.id} className="py-3">
              <Link href={`/notes/${n.id}`} className="flex gap-4 hover:underline">
                <span className="w-24 shrink-0 text-sm text-gray-500">{n.studied_on}</span>
                <span>{n.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

- [ ] **Step 2: 수동 확인**

Run: `npm run dev`

1. 상단 내비게이션에서 자기 이름 클릭 → 자기 노트 목록이 보인다
2. 다른 팀원 이름 클릭 → 그 사람 노트가 보인다 (없으면 빈 안내 문구)
3. 제목 일부로 검색 → 걸러진다
4. 월 필터 선택 → 그 달 노트만 남는다
5. 없는 slug 로 접속 (`/members/없는사람`) → 404

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "팀원별 스터디 저장소 페이지 추가

검색과 월 필터를 URL 쿼리로 처리해 클라이언트 상태 없이 서버에서 끝낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 홈 화면

오늘 누가 올렸고 누가 안 올렸는지를 보여준다. 기능이 아니라 **업로드를 유지시키는 장치**다 (§6).

**Files:**
- Modify: `src/app/(app)/page.tsx` (create-next-app 기본 내용을 전부 대체)

**Interfaces:**
- Consumes: `getAllProfiles()` (Task 4), `todayInSeoul()` (Task 1)
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 홈 페이지 작성**

`src/app/(app)/page.tsx` 의 내용을 전부 지우고 아래로 바꾼다.

```tsx
import Link from 'next/link'
import { getAllProfiles } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { todayInSeoul, weekdayIndexOf } from '@/lib/date'

const 요일 = ['일', '월', '화', '수', '목', '금', '토']

export default async function HomePage() {
  const 오늘 = todayInSeoul()
  const profiles = await getAllProfiles()
  const supabase = await createSupabaseServerClient()

  const { data: 오늘노트 } = await supabase
    .from('notes')
    .select('id, title, author_id')
    .eq('studied_on', 오늘)

  const 올린사람 = new Set((오늘노트 ?? []).map((n) => n.author_id))
  // 오늘은 이미 KST 기준 달력 날짜 문자열이므로, UTC 자정으로 파싱해 getUTCDay()로
  // 읽으면 시간대 변환 없이 그 날짜 자체의 요일을 얻는다.
  const 요일이름 = 요일[weekdayIndexOf(오늘)]

  return (
    <>
      <h1 className="mb-6 text-xl font-bold">
        {오늘} ({요일이름})
      </h1>

      <ul className="mb-8 flex gap-6">
        {profiles.map((p) => {
          const 올림 = 올린사람.has(p.id)
          return (
            <li key={p.id} className="flex items-center gap-1.5">
              <Link href={`/members/${p.slug}`} className="hover:underline">
                {p.display_name}
              </Link>
              <span className={올림 ? 'text-green-600' : 'text-gray-300'}>
                {올림 ? '✓' : '—'}
              </span>
            </li>
          )
        })}
      </ul>

      <Link
        href="/notes/new"
        className="mb-10 inline-block rounded bg-black px-4 py-2 text-sm text-white"
      >
        오늘 내 스터디 올리기
      </Link>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">오늘 올라온 노트</h2>
        {(오늘노트 ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">아직 아무도 올리지 않았습니다.</p>
        ) : (
          <ul className="divide-y">
            {오늘노트!.map((n) => (
              <li key={n.id} className="py-2">
                <Link href={`/notes/${n.id}`} className="hover:underline">
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
```

`오늘`은 `todayInSeoul()`이 이미 KST 기준으로 계산한 'YYYY-MM-DD' 달력 날짜 문자열이다. 여기에 `+09:00` 오프셋을 붙이면 그 문자열이 다시 KST 자정으로 해석되어, UTC로 변환되는 과정에서 하루가 밀리고 `getUTCDay()`는 전날의 요일을 반환한다(예: `2026-08-05T00:00:00+09:00`은 `2026-08-04T15:00:00Z`이므로 8월 4일의 요일이 나온다). 대신 `T00:00:00Z`로 파싱해야 한다 — `오늘` 문자열이 가리키는 달력 날짜를 시간대 변환 없이 그대로 UTC 자정으로 취급하고, `getUTCDay()`로 그 날짜 자체의 요일을 읽는 것이다. `weekdayIndexOf()`(`src/lib/date.ts`)가 이 계산을 담당한다.

- [ ] **Step 2: 전체 테스트 실행**

Run: `npm test`
Expected: PASS — 20개 (Task 1의 9개 + Task 5의 7개 + 요일 4개)

Run: `npm run test:rls`
Expected: PASS — 8개

- [ ] **Step 3: 수동 확인**

Run: `npm run dev`

1. 홈에서 오늘 날짜와 요일이 맞는지 확인
2. 오늘 날짜로 노트를 올린 사람에게 `✓`, 나머지에게 `—` 가 붙는지 확인
3. 노트를 하나 더 올려보고 홈으로 돌아와 `✓` 가 바뀌는지 확인
4. 어제 날짜로 노트를 올려보고 **홈에는 나타나지 않는지** 확인 (`studied_on` 기준 동작 확인)

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "홈 화면 추가

오늘 누가 올렸는지를 4명 전원에게 보여준다. 스터디가 죽는 원인은
기능 부족이 아니라 업로드 중단이므로, 이 표시가 홈의 핵심이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 배포

팀원 3명이 실제로 접속할 수 있게 만든다. 여기까지 끝나야 1단계가 완료된다.

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 접속 가능한 배포 URL

- [ ] **Step 1: 로컬 프로덕션 빌드 확인**

배포 전에 빌드가 통과하는지 확인한다. 개발 서버에서는 넘어가던 타입 오류가 여기서 잡힌다.

Run: `npm run build`
Expected: 오류 없이 완료

실패하면 오류를 고치고 다시 빌드한다.

- [ ] **Step 2: GitHub 저장소에 올리기**

**반드시 비공개(private) 저장소로 만든다.**

```bash
gh repo create study-system --private --source=. --remote=origin --push
```

`gh` 가 없으면 GitHub 웹에서 비공개 저장소를 만들고 아래를 실행한다.

```bash
git remote add origin https://github.com/<사용자명>/study-system.git
git push -u origin master
```

- [ ] **Step 3: `.env.local` 이 올라가지 않았는지 확인**

```bash
git ls-files | grep -E "\.env" || echo "환경변수 파일 없음 - 정상"
```
Expected: `.env.local.example` 만 나오거나 "환경변수 파일 없음 - 정상"

`.env.local` 이나 `.env.test.local` 이 목록에 있으면 **즉시 중단하고** 해당 파일을 저장소에서 제거한 뒤 Supabase 키를 재발급한다.

- [ ] **Step 4: Vercel 프로젝트 생성**

1. https://vercel.com 에서 GitHub 계정으로 로그인
2. Add New → Project → 방금 만든 저장소 선택
3. Framework Preset이 Next.js로 자동 인식되는지 확인
4. Environment Variables에 세 개를 입력한다 (Production, Preview, Development 전부 체크)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

5. Deploy

- [ ] **Step 5: Supabase에 배포 주소 등록**

Supabase 대시보드 → Authentication → URL Configuration

- `Site URL` 에 Vercel이 준 주소를 넣는다 (예: `https://study-system.vercel.app`)
- `Redirect URLs` 에 `https://study-system.vercel.app/**` 를 추가한다

- [ ] **Step 6: 배포본 확인**

배포 주소로 접속해 확인한다.

1. `/login` 으로 튕긴다
2. 로그인된다
3. 홈에 팀원 4명이 보인다
4. 노트를 올리고 읽을 수 있다
5. 다른 기기(휴대폰)에서 접속해도 동작한다

- [ ] **Step 7: README 작성**

`README.md` 를 만든다. 나중에 자신이 읽을 문서다.

```markdown
# 팀 스터디 허브

4인 스터디 팀의 비공개 학습 기록 공간.

- 설계: `docs/2026-08-05-team-study-hub-design.md`
- 1단계 계획: `docs/2026-08-05-study-hub-phase1-plan.md`

## 개발

```bash
npm install
cp .env.local.example .env.local   # 값을 채운다
npm run dev
```

## 테스트

```bash
npm test        # 단위 테스트
npm run test:rls  # 권한 테스트 (실제 Supabase에 접속한다)
```

권한 테스트에는 `.env.test.local` 이 필요하다.

```
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

## 팀원 추가

1. Supabase → Authentication → Users → Add user
2. 생성된 User UID를 복사
3. SQL Editor에서 `profiles` 에 행 추가 (id는 복사한 UID, slug는 영문 소문자, sort_order는 내비게이션 표시 순서)

가입 페이지는 없다. 계정은 대시보드에서만 만든다.

## 다음 단계

- 2단계: 파일 첨부
- 3단계: 날짜별 AI 정리본
```

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "README 추가 및 배포 완료

1단계 완료: 로그인, 노트 작성·읽기·수정·삭제, 팀원별 저장소, 홈 현황.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 9: 팀원에게 전달**

각 팀원에게 배포 주소, 이메일, 초기 비밀번호를 전달한다. 비밀번호는 대시보드에서 언제든 바꿔줄 수 있다고 함께 알린다.

---

## 1단계 완료 기준

전부 만족해야 2단계로 넘어간다.

- [ ] `npm test` 통과 (20개)
- [ ] `npm run test:rls` 통과 (8개)
- [ ] `npm run build` 오류 없음
- [ ] 배포 주소에서 4명 모두 로그인 가능
- [ ] 남의 노트를 수정·삭제할 수 없음 (주소창 직접 입력으로도)
- [ ] 미등록 계정은 `/no-access` 로 감
- [ ] 홈의 `✓ / —` 표시가 `studied_on` 기준으로 정확함
- [ ] `git ls-files` 에 `.env.local`, `.env.test.local` 이 없음

---

## 이 계획에서 다루지 않는 것

기획서에는 있으나 2·3단계 계획서로 미룬 항목이다.

| 항목 | 근거 | 단계 |
|---|---|---|
| 파일 첨부 업로드·다운로드, Storage 버킷, 용량 상한 | §9.3 | 2단계 |
| `attachments` 테이블 RLS 테스트 | §11.1 | 2단계 |
| 마크다운 렌더링 | 본문 저장·조회를 먼저 확정 | 2단계 |
| AI 정리본 생성, 응답 검증, 연결 유효성 판정 | §8 | 3단계 |
| `/digests` 아카이브, `.md` 다운로드 | §8.3 | 3단계 |
| Vercel 크론, `CRON_SECRET`, 생성 API 인증 | §8.1, §8.1.1 | 3단계 |
| `generating` 멈춤 감지 | §10 | 3단계 |

`attachments` 와 `digests` 테이블 및 그 RLS 정책은 Task 2에서 미리 만들어 뒀다. 마이그레이션을 두 번 나누지 않기 위해서다.
