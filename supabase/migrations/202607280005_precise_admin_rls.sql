drop policy if exists assessments_admin_all on public.assessments;
drop policy if exists assessment_questions_admin_all on public.assessment_questions;
drop policy if exists candidates_admin_all on public.candidates;
drop policy if exists candidate_responses_admin_all on public.candidate_responses;

drop policy if exists assessments_admin_insert on public.assessments;
create policy assessments_admin_insert on public.assessments for insert to authenticated
with check ((select private.is_admin()));
drop policy if exists assessments_admin_update on public.assessments;
create policy assessments_admin_update on public.assessments for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists assessments_admin_delete on public.assessments;
create policy assessments_admin_delete on public.assessments for delete to authenticated
using ((select private.is_admin()));

drop policy if exists questions_admin_insert on public.assessment_questions;
create policy questions_admin_insert on public.assessment_questions for insert to authenticated
with check ((select private.is_admin()));
drop policy if exists questions_admin_update on public.assessment_questions;
create policy questions_admin_update on public.assessment_questions for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists questions_admin_delete on public.assessment_questions;
create policy questions_admin_delete on public.assessment_questions for delete to authenticated
using ((select private.is_admin()));

drop policy if exists candidates_admin_insert on public.candidates;
create policy candidates_admin_insert on public.candidates for insert to authenticated
with check ((select private.is_admin()));
drop policy if exists candidates_admin_delete on public.candidates;
create policy candidates_admin_delete on public.candidates for delete to authenticated
using ((select private.is_admin()));

drop policy if exists responses_admin_delete on public.candidate_responses;
create policy responses_admin_delete on public.candidate_responses for delete to authenticated
using ((select private.is_admin()));
