-- Adds an explicit force option to claim_knowledge_generation so a member can
-- re-run classification on unchanged notes (AI temperature > 0 means results
-- can drift between runs even on identical input).

drop function if exists public.claim_knowledge_generation(date, text);

create or replace function public.claim_knowledge_generation(
  p_generation_date date,
  p_input_hash text,
  p_force boolean default false
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

  if not p_force
     and current_run.status = 'done'
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

revoke all on function public.claim_knowledge_generation(date, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_knowledge_generation(date, text, boolean) to service_role;
