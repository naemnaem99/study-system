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
