-- AI-only classification validation
-- Replaces human review semantics with deterministic server validation and
-- stores a verbatim source excerpt for every accepted note/topic mapping.

alter table public.note_topics
  rename column review_status to validation_status;

alter table public.note_topics
  drop constraint note_topics_review_status_check;

alter table public.note_topics
  add column evidence_quote text not null default '',
  add column evidence_verified boolean not null default false,
  add column classifier_version text not null default 'legacy-v1';

update public.note_topics
set validation_status = case
  when source = 'fallback' then 'unclassified'
  else 'provisional'
end;

alter table public.note_topics
  alter column validation_status set default 'unclassified';

alter table public.note_topics
  add constraint note_topics_validation_status_check
  check (validation_status in ('validated', 'provisional', 'unclassified'));

create index note_topics_validation_idx
  on public.note_topics (validation_status, topic_id);

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
  relation_evidence_count integer;
begin
  if not exists (
    select 1 from public.knowledge_generations
    where generation_date = p_generation_date
      and input_hash = p_input_hash
      and status = 'generating'
  ) then
    raise exception 'knowledge generation was not claimed';
  end if;

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
      note_id,
      topic_id,
      confidence,
      reason,
      evidence_quote,
      evidence_verified,
      source,
      validation_status,
      classifier_version
    ) values (
      (item->>'note_id')::uuid,
      (item->>'topic_id')::uuid,
      least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
      coalesce(item->>'reason', ''),
      coalesce(item->>'evidence_quote', ''),
      coalesce((item->>'evidence_verified')::boolean, false),
      coalesce(item->>'source', 'ai'),
      coalesce(item->>'validation_status', 'unclassified'),
      coalesce(item->>'classifier_version', 'ai-only-v2')
    )
    on conflict (note_id, topic_id) do update
    set confidence = excluded.confidence,
        reason = excluded.reason,
        evidence_quote = excluded.evidence_quote,
        evidence_verified = excluded.evidence_verified,
        source = excluded.source,
        validation_status = excluded.validation_status,
        classifier_version = excluded.classifier_version,
        updated_at = now();
  end loop;

  -- A new AI topic becomes active only after two independently stored notes
  -- have passed the deterministic evidence and confidence checks.
  update public.topics topic
  set status = 'active',
      updated_at = now()
  where topic.status = 'suggested'
    and (
      select count(distinct mapping.note_id)
      from public.note_topics mapping
      where mapping.topic_id = topic.id
        and mapping.validation_status = 'validated'
    ) >= 2;

  for item in select value from jsonb_array_elements(p_relations)
  loop
    relation_source := (item->>'source_topic_id')::uuid;
    relation_target := (item->>'target_topic_id')::uuid;
    relation_evidence_count := greatest(1, coalesce((item->>'evidence_count')::integer, 1));

    if relation_source <> relation_target then
      insert into public.topic_relations (
        source_topic_id, target_topic_id, relation_type, confidence,
        evidence_count, first_seen_on, last_seen_on
      ) values (
        relation_source,
        relation_target,
        coalesce(item->>'relation_type', 'related'),
        least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
        relation_evidence_count,
        p_generation_date,
        p_generation_date
      )
      on conflict (source_topic_id, target_topic_id, relation_type) do update
      set confidence = excluded.confidence,
          evidence_count = case
            when public.topic_relations.last_seen_on = p_generation_date
              then greatest(public.topic_relations.evidence_count, excluded.evidence_count)
            else public.topic_relations.evidence_count + excluded.evidence_count
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
      note_id,
      topic_id,
      confidence,
      reason,
      evidence_quote,
      evidence_verified,
      source,
      validation_status,
      classifier_version
    )
    select
      (item#>>'{}')::uuid,
      fallback_topic,
      0,
      'AI 분류 실패로 다음 자동 생성에서 다시 시도합니다.',
      '',
      false,
      'fallback',
      'unclassified',
      'ai-only-v2'
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

revoke all on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_knowledge_generation(date, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_knowledge_generation(date, text, jsonb, text) to service_role;
