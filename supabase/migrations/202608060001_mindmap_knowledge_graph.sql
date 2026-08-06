-- Study Grove knowledge graph
-- Keeps AI writes behind service-role-only RPCs and exposes read-only graph data
-- to registered study members.

create table public.topics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  parent_id     uuid references public.topics(id) on delete set null,
  summary_md    text not null default '',
  status        text not null default 'suggested'
                check (status in ('active', 'suggested', 'unclassified', 'archived')),
  created_by_ai boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index topics_parent_idx on public.topics (parent_id);
create index topics_updated_idx on public.topics (updated_at desc);

create table public.note_topics (
  note_id       uuid not null references public.notes(id) on delete cascade,
  topic_id      uuid not null references public.topics(id) on delete cascade,
  confidence    numeric(4, 3) not null default 0
                check (confidence >= 0 and confidence <= 1),
  reason        text not null default '',
  source        text not null default 'ai' check (source in ('ai', 'manual', 'fallback')),
  review_status text not null default 'pending'
                check (review_status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (note_id, topic_id)
);

create index note_topics_topic_idx on public.note_topics (topic_id, note_id);

create table public.topic_relations (
  source_topic_id uuid not null references public.topics(id) on delete cascade,
  target_topic_id uuid not null references public.topics(id) on delete cascade,
  relation_type   text not null default 'related'
                  check (relation_type in ('related', 'prerequisite', 'applies', 'contrasts')),
  confidence      numeric(4, 3) not null default 0
                  check (confidence >= 0 and confidence <= 1),
  evidence_count  integer not null default 1 check (evidence_count >= 1),
  first_seen_on   date not null,
  last_seen_on    date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (source_topic_id, target_topic_id, relation_type),
  check (source_topic_id <> target_topic_id)
);

create index topic_relations_target_idx on public.topic_relations (target_topic_id);
create index topic_relations_recent_idx on public.topic_relations (last_seen_on desc);

create table public.knowledge_generations (
  generation_date  date primary key,
  input_hash       text not null,
  last_success_hash text,
  status           text not null check (status in ('generating', 'done', 'failed')),
  attempt_count    integer not null default 1,
  model            text,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  error_message    text
);

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

create trigger note_topics_set_updated_at
  before update on public.note_topics
  for each row execute function public.set_updated_at();

create trigger topic_relations_set_updated_at
  before update on public.topic_relations
  for each row execute function public.set_updated_at();

insert into public.topics (
  id, name, slug, summary_md, status, created_by_ai
) values (
  '00000000-0000-4000-8000-000000000001',
  '미분류',
  'unclassified',
  'AI 분류를 기다리는 스터디 기록입니다.',
  'unclassified',
  false
) on conflict (id) do nothing;

alter table public.topics enable row level security;
alter table public.note_topics enable row level security;
alter table public.topic_relations enable row level security;
alter table public.knowledge_generations enable row level security;

create policy "topics_select" on public.topics
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "note_topics_select" on public.note_topics
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "topic_relations_select" on public.topic_relations
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "knowledge_generations_select" on public.knowledge_generations
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

-- Atomically claims one AI generation slot for a date and input hash.
-- A recent in-flight request wins; stale jobs can be reclaimed after 20 minutes.
create or replace function public.claim_knowledge_generation(
  p_generation_date date,
  p_input_hash text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_run public.knowledge_generations%rowtype;
begin
  insert into public.knowledge_generations (
    generation_date, input_hash, status, started_at
  ) values (
    p_generation_date, p_input_hash, 'generating', now()
  )
  on conflict (generation_date) do nothing;

  if found then
    return 'claimed';
  end if;

  select * into current_run
  from public.knowledge_generations
  where generation_date = p_generation_date
  for update;

  if current_run.status = 'done'
     and current_run.last_success_hash = p_input_hash then
    return 'unchanged';
  end if;

  if current_run.status = 'generating'
     and current_run.started_at > now() - interval '20 minutes' then
    return 'in_progress';
  end if;

  update public.knowledge_generations
  set input_hash = p_input_hash,
      status = 'generating',
      started_at = now(),
      completed_at = null,
      error_message = null,
      attempt_count = attempt_count + 1
  where generation_date = p_generation_date;

  return 'claimed';
end;
$$;

-- Applies a fully resolved topic payload in one database transaction. Topic IDs
-- are resolved by the server before this RPC so note/topic links never point to
-- model-generated identifiers.
create or replace function public.apply_knowledge_classification(
  p_generation_date date,
  p_input_hash text,
  p_model text,
  p_topics jsonb,
  p_note_topics jsonb,
  p_relations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  relation_source uuid;
  relation_target uuid;
begin
  if not exists (
    select 1 from public.knowledge_generations
    where generation_date = p_generation_date
      and input_hash = p_input_hash
      and status = 'generating'
  ) then
    raise exception 'knowledge generation was not claimed';
  end if;

  -- First pass creates every topic without parent links so child ordering does
  -- not matter. Existing member-approved names/statuses are preserved.
  for item in select value from jsonb_array_elements(p_topics)
  loop
    insert into public.topics (
      id, name, slug, parent_id, summary_md, status, created_by_ai
    ) values (
      (item->>'id')::uuid,
      item->>'name',
      item->>'slug',
      null,
      coalesce(item->>'summary_md', ''),
      coalesce(item->>'status', 'suggested'),
      coalesce((item->>'created_by_ai')::boolean, true)
    )
    on conflict (id) do update
    set summary_md = case
          when excluded.summary_md = '' then public.topics.summary_md
          else excluded.summary_md
        end,
        updated_at = now();
  end loop;

  -- Second pass attaches parent links after all referenced topics exist.
  for item in select value from jsonb_array_elements(p_topics)
  loop
    update public.topics
    set parent_id = nullif(item->>'parent_id', '')::uuid
    where id = (item->>'id')::uuid
      and coalesce(item->>'parent_id', '') <> '';
  end loop;

  delete from public.note_topics
  where note_id in (
    select distinct (value->>'note_id')::uuid
    from jsonb_array_elements(p_note_topics)
  );

  for item in select value from jsonb_array_elements(p_note_topics)
  loop
    insert into public.note_topics (
      note_id, topic_id, confidence, reason, source, review_status
    ) values (
      (item->>'note_id')::uuid,
      (item->>'topic_id')::uuid,
      least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
      coalesce(item->>'reason', ''),
      'ai',
      'pending'
    )
    on conflict (note_id, topic_id) do update
    set confidence = excluded.confidence,
        reason = excluded.reason,
        source = 'ai',
        updated_at = now();
  end loop;

  for item in select value from jsonb_array_elements(p_relations)
  loop
    relation_source := (item->>'source_topic_id')::uuid;
    relation_target := (item->>'target_topic_id')::uuid;

    if relation_source <> relation_target then
      insert into public.topic_relations (
        source_topic_id, target_topic_id, relation_type, confidence,
        evidence_count, first_seen_on, last_seen_on
      ) values (
        relation_source,
        relation_target,
        coalesce(item->>'relation_type', 'related'),
        least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
        1,
        p_generation_date,
        p_generation_date
      )
      on conflict (source_topic_id, target_topic_id, relation_type) do update
      set confidence = excluded.confidence,
          evidence_count = case
            when public.topic_relations.last_seen_on = p_generation_date
              then public.topic_relations.evidence_count
            else public.topic_relations.evidence_count + 1
          end,
          last_seen_on = p_generation_date,
          updated_at = now();
    end if;
  end loop;

  update public.knowledge_generations
  set status = 'done',
      last_success_hash = p_input_hash,
      model = p_model,
      completed_at = now(),
      error_message = null
  where generation_date = p_generation_date
    and input_hash = p_input_hash;
end;
$$;

-- On quota/network/schema failure, only notes without any topic are placed in
-- the fallback bucket. Previously successful classifications remain untouched.
create or replace function public.fail_knowledge_generation(
  p_generation_date date,
  p_input_hash text,
  p_note_ids jsonb,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  fallback_topic constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  for item in select value from jsonb_array_elements(p_note_ids)
  loop
    insert into public.note_topics (
      note_id, topic_id, confidence, reason, source, review_status
    )
    select
      (item#>>'{}')::uuid,
      fallback_topic,
      0,
      'AI 분류 실패로 다음 자동 생성에서 다시 시도합니다.',
      'fallback',
      'pending'
    where not exists (
      select 1 from public.note_topics nt
      where nt.note_id = (item#>>'{}')::uuid
    )
    on conflict (note_id, topic_id) do nothing;
  end loop;

  update public.knowledge_generations
  set status = 'failed',
      completed_at = now(),
      error_message = left(p_error_message, 500)
  where generation_date = p_generation_date
    and input_hash = p_input_hash;
end;
$$;

revoke all on function public.claim_knowledge_generation(date, text) from public, anon, authenticated;
revoke all on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_knowledge_generation(date, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.claim_knowledge_generation(date, text) to service_role;
grant execute on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_knowledge_generation(date, text, jsonb, text) to service_role;
