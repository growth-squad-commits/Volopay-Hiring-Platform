alter table public.candidates
add column if not exists is_active boolean not null default true;

create index if not exists candidates_active_email_idx
on public.candidates(lower(email), is_active);

drop policy if exists assessments_access on public.assessments;
create policy assessments_access on public.assessments for select to authenticated using (
  (select private.is_admin()) or (
    status = 'published' and exists(
      select 1 from public.candidates c
      where c.assessment_id = assessments.id
        and c.is_active = true
        and (select private.candidate_email_matches(c.email))
    )
  )
);

drop policy if exists questions_access on public.assessment_questions;
create policy questions_access on public.assessment_questions for select to authenticated using (
  (select private.is_admin()) or exists(
    select 1
    from public.candidates c
    join public.assessments a on a.id = c.assessment_id
    where c.assessment_id = assessment_questions.assessment_id
      and c.is_active = true
      and a.status = 'published'
      and (select private.candidate_email_matches(c.email))
  )
);

drop policy if exists candidates_access on public.candidates;
create policy candidates_access on public.candidates for select to authenticated using (
  (select private.is_admin()) or (
    is_active = true and (select private.candidate_email_matches(email))
  )
);

drop policy if exists candidates_update on public.candidates;
create policy candidates_update on public.candidates for update to authenticated
using (
  (select private.is_admin()) or (
    is_active = true and (select private.candidate_email_matches(email))
  )
)
with check (
  (select private.is_admin()) or (
    is_active = true and (select private.candidate_email_matches(email))
  )
);

drop policy if exists responses_access on public.candidate_responses;
create policy responses_access on public.candidate_responses for select to authenticated using (
  (select private.is_admin()) or exists(
    select 1 from public.candidates c
    where c.id = candidate_responses.candidate_id
      and c.is_active = true
      and (select private.candidate_email_matches(c.email))
  )
);

drop policy if exists responses_insert on public.candidate_responses;
create policy responses_insert on public.candidate_responses for insert to authenticated with check (
  (select private.is_admin()) or exists(
    select 1
    from public.candidates c
    join public.assessment_questions q on q.id = candidate_responses.question_id
    where c.id = candidate_responses.candidate_id
      and c.is_active = true
      and q.assessment_id = c.assessment_id
      and c.status = 'in_progress'
      and now() < c.expires_at
      and (select private.candidate_email_matches(c.email))
  )
);

drop policy if exists responses_update on public.candidate_responses;
create policy responses_update on public.candidate_responses for update to authenticated
using (
  (select private.is_admin()) or exists(
    select 1 from public.candidates c
    where c.id = candidate_responses.candidate_id
      and c.is_active = true
      and c.status = 'in_progress'
      and now() < c.expires_at
      and (select private.candidate_email_matches(c.email))
  )
)
with check (
  (select private.is_admin()) or exists(
    select 1
    from public.candidates c
    join public.assessment_questions q on q.id = candidate_responses.question_id
    where c.id = candidate_responses.candidate_id
      and c.is_active = true
      and q.assessment_id = c.assessment_id
      and c.status = 'in_progress'
      and now() < c.expires_at
      and (select private.candidate_email_matches(c.email))
  )
);

create or replace function private.guard_candidate_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare a public.assessments;
begin
  if (select private.is_admin()) then new.updated_at = now(); return new; end if;
  if old.is_active is not true then raise exception 'Candidate access is inactive'; end if;
  if not (select private.candidate_email_matches(old.email)) then raise exception 'Not authorized'; end if;
  if new.assessment_id is distinct from old.assessment_id
     or new.email is distinct from old.email
     or new.full_name is distinct from old.full_name
     or new.score is distinct from old.score
     or new.decision is distinct from old.decision
     or new.is_active is distinct from old.is_active then
    raise exception 'Protected fields cannot be changed';
  end if;
  select * into a from public.assessments where id = old.assessment_id;
  if old.status = 'not_started' and new.status = 'in_progress' then
    if a.status <> 'published' or now() < a.available_from or now() > a.available_until then
      raise exception 'Assessment unavailable';
    end if;
    new.auth_user_id = (select auth.uid());
    new.started_at = now();
    new.expires_at = least(a.available_until, now() + make_interval(mins => a.duration_minutes));
    new.last_saved_at = now();
  elsif old.status = 'in_progress' and new.status = 'submitted' then
    if now() > old.expires_at then raise exception 'Assessment time expired'; end if;
    new.submitted_at = now();
    new.last_saved_at = now();
  elsif new.status is distinct from old.status then
    raise exception 'Invalid status transition';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
