-- Verified topic relation evidence
-- Legacy relations did not retain the note IDs that justified them, so they
-- cannot satisfy the AI-only validation contract and are removed once.

alter table public.topic_relations
  add column evidence_verified boolean not null default false,
  add column classifier_version text not null default 'legacy-v1';

delete from public.topic_relations
where evidence_verified = false;

create table public.topic_relation_evidence (
  source_topic_id uuid not null,
  target_topic_id uuid not null,
  relation_type text not null,
  note_id uuid not null references public.notes(id) on delete cascade,
  generation_date date not null,
  classifier_version text not null,
  created_at timestamptz not null default now(),
  primary key (
    source_topic_id,
    target_topic_id,
    relation_type,
    note_id,
    generation_date
  ),
  foreign key (source_topic_id, target_topic_id, relation_type)
    references public.topic_relations(source_topic_id, target_topic_id, relation_type)
    on delete cascade
);

create index topic_relation_evidence_note_idx
  on public.topic_relation_evidence (note_id, generation_date desc);

alter table public.topic_relation_evidence enable row level security;

create policy "topic_relation_evidence_select" on public.topic_relation_evidence
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

-- Remove AI suggestions that became unreachable after legacy relation cleanup.
delete from public.topics topic
where topic.created_by_ai = true
  and topic.status = 'suggested'
  and not exists (
    select 1 from public.note_topics mapping where mapping.topic_id = topic.id
  )
  and not exists (
    select 1 from public.topic_relations relation
    where relation.source_topic_id = topic.id or relation.target_topic_id = topic.id
  );

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
  evidence_note_id text;
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

    if relation_source <> relation_target
       and coalesce((item->>'evidence_verified')::boolean, false) then
      insert into public.topic_relations (
        source_topic_id,
        target_topic_id,
        relation_type,
        confidence,
        evidence_count,
        first_seen_on,
        last_seen_on,
        evidence_verified,
        classifier_version
      ) values (
        relation_source,
        relation_target,
        coalesce(item->>'relation_type', 'related'),
        least(1, greatest(0, coalesce((item->>'confidence')::numeric, 0))),
        relation_evidence_count,
        p_generation_date,
        p_generation_date,
        true,
        coalesce(item->>'classifier_version', 'ai-only-v2')
      )
      on conflict (source_topic_id, target_topic_id, relation_type) do update
      set confidence = excluded.confidence,
          evidence_count = case
            when public.topic_relations.last_seen_on = p_generation_date
              then greatest(public.topic_relations.evidence_count, excluded.evidence_count)
            else public.topic_relations.evidence_count + excluded.evidence_count
          end,
          last_seen_on = p_generation_date,
          evidence_verified = true,
          classifier_version = excluded.classifier_version,
          updated_at = now();

      for evidence_note_id in
        select value from jsonb_array_elements_text(
          coalesce(item->'evidence_note_ids', '[]'::jsonb)
        )
      loop
        insert into public.topic_relation_evidence (
          source_topic_id,
          target_topic_id,
          relation_type,
          note_id,
          generation_date,
          classifier_version
        ) values (
          relation_source,
          relation_target,
          coalesce(item->>'relation_type', 'related'),
          evidence_note_id::uuid,
          p_generation_date,
          coalesce(item->>'classifier_version', 'ai-only-v2')
        )
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  delete from public.topics topic
  where topic.created_by_ai = true
    and topic.status = 'suggested'
    and not exists (
      select 1 from public.note_topics mapping where mapping.topic_id = topic.id
    )
    and not exists (
      select 1 from public.topic_relations relation
      where relation.source_topic_id = topic.id or relation.target_topic_id = topic.id
    );

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

revoke all on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_knowledge_classification(date, text, text, jsonb, jsonb, jsonb) to service_role;
