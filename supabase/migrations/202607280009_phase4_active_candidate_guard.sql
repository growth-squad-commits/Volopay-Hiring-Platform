-- Phase 4 follow-up: the production candidate trigger calls
-- private.guard_candidate_self_update(). Permit only validated Phase 4
-- transactions to perform protected attempt state transitions.
create or replace function private.guard_candidate_self_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.assessments;
  calculated_expiry timestamptz;
begin
  if current_setting('app.phase4_internal', true) = 'on' then
    new.updated_at := coalesce(new.updated_at, now());
    return new;
  end if;

  if (select private.is_admin()) then
    return new;
  end if;

  if not (select private.candidate_email_matches(old.email)) then
    raise exception 'Candidate record does not belong to this user';
  end if;

  if new.assessment_id is distinct from old.assessment_id
    or new.full_name is distinct from old.full_name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.score is distinct from old.score
    or new.decision is distinct from old.decision
    or new.source is distinct from old.source
    or new.submitted_at is distinct from old.submitted_at
    or new.started_at is distinct from old.started_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'Protected candidate fields cannot be changed';
  end if;

  select * into a from public.assessments where id = old.assessment_id;

  if old.status = 'not_started' and new.status = 'in_progress' then
    if a.status <> 'published' or now() < a.available_from or now() > a.available_until then
      raise exception 'Assessment is not currently available';
    end if;
    calculated_expiry := least(a.available_until, now() + make_interval(mins => a.duration_minutes));
    new.auth_user_id := (select auth.uid());
    new.started_at := now();
    new.expires_at := calculated_expiry;
    new.last_saved_at := now();
  elsif old.status = 'in_progress' and new.status = 'submitted' then
    if now() > old.expires_at then
      raise exception 'Assessment time has expired';
    end if;
    new.auth_user_id := (select auth.uid());
    new.submitted_at := now();
    new.last_saved_at := now();
  elsif new.status is distinct from old.status then
    raise exception 'Invalid candidate status transition';
  else
    new.auth_user_id := coalesce(old.auth_user_id, (select auth.uid()));
    new.last_saved_at := now();
  end if;

  return new;
end;
$$;
