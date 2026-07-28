alter table public.assessment_questions
  add column if not exists source_bank_item_id bigint references public.question_bank_items(id) on delete set null,
  add column if not exists source_bank_item_updated_at timestamptz,
  add column if not exists frozen_at timestamptz;

create index if not exists assessment_questions_source_bank_item_id_idx
  on public.assessment_questions(source_bank_item_id);

create or replace function private.guard_published_assessment_questions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_assessment_id bigint;
  target_status text;
begin
  target_assessment_id := case when tg_op = 'DELETE' then old.assessment_id else new.assessment_id end;
  select status into target_status
  from public.assessments
  where id = target_assessment_id;

  if target_status <> 'draft' then
    raise exception 'Published assessment questions are frozen';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_published_assessment_questions on public.assessment_questions;
create trigger guard_published_assessment_questions
before insert or update or delete on public.assessment_questions
for each row execute function private.guard_published_assessment_questions();

create or replace function private.freeze_assessment_on_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published' then
    if not exists (
      select 1 from public.assessment_questions q where q.assessment_id = new.id
    ) then
      raise exception 'An assessment needs at least one question before publishing';
    end if;

    update public.assessment_questions
    set frozen_at = coalesce(frozen_at, now())
    where assessment_id = new.id;
  end if;

  if old.status <> 'draft' and (
    new.duration_minutes is distinct from old.duration_minutes
    or new.available_from is distinct from old.available_from
    or new.available_until is distinct from old.available_until
    or new.total_points is distinct from old.total_points
  ) then
    raise exception 'Published assessment configuration is frozen';
  end if;

  return new;
end;
$$;

drop trigger if exists freeze_assessment_on_publish on public.assessments;
create trigger freeze_assessment_on_publish
before update on public.assessments
for each row execute function private.freeze_assessment_on_publish();
