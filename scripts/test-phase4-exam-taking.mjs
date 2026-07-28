import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = await source("supabase/migrations/202607280008_phase4_exam_attempts.sql");
const runner = await source("src/components/assessment-runner.tsx");
const workspace = await source("src/components/candidate-workspace.tsx");
const offlineQueue = await source("src/lib/client/answer-queue.ts");
const startRoute = await source("src/app/api/candidate/attempts/start/route.ts");
const loadRoute = await source("src/app/api/candidate/attempts/[attemptId]/route.ts");
const saveRoute = await source("src/app/api/candidate/attempts/[attemptId]/answers/route.ts");
const submitRoute = await source("src/app/api/candidate/attempts/[attemptId]/submit/route.ts");

assert.match(migration, /create table if not exists public\.exam_attempts/);
assert.match(migration, /exam_attempts_assessment_student_idx/);
assert.match(migration, /exam_attempts_student_id_idx/);
assert.match(migration, /create table if not exists public\.grading_queue/);
assert.match(migration, /add column if not exists attempt_id uuid/);
assert.match(migration, /client_revision bigint not null default 0/);
assert.match(migration, /create or replace function public\.finalize_exam_attempt_internal/);
assert.match(migration, /create or replace function public\.start_exam_attempt_internal/);
assert.match(migration, /least\(\s*v_closes_at/);
assert.match(migration, /create or replace function public\.save_exam_answer_internal/);
assert.match(migration, /excluded\.client_revision >= public\.candidate_responses\.client_revision/);
assert.match(migration, /v_now >= v_attempt\.ends_at/);
assert.match(migration, /create or replace function public\.submit_exam_attempt_internal/);
assert.match(migration, /public\.finalize_exam_attempt_internal\(v_attempt\.id, v_reason\)/);
assert.match(migration, /create or replace function public\.auto_submit_expired_attempts/);
assert.match(migration, /phase4-auto-submit-expired-attempts/);
assert.match(migration, /for update skip locked/);
assert.match(migration, /'10 seconds'/);
assert.match(migration, /revoke insert, update, delete on public\.candidate_responses from authenticated/);
assert.doesNotMatch(migration, /security definer/);

assert.match(startRoute, /requireCandidate\(\)/);
assert.match(startRoute, /start_exam_attempt_internal/);
assert.match(startRoute, /candidate-attempt-start/);
assert.match(loadRoute, /\.eq\("student_id", user\.id\)/);
assert.match(saveRoute, /save_exam_answer_internal/);
assert.match(saveRoute, /candidate-answer-save/);
assert.match(submitRoute, /submit_exam_attempt_internal/);
assert.match(submitRoute, /candidate-attempt-submit/);

assert.match(offlineQueue, /indexedDB\.open/);
assert.match(offlineQueue, /queueAnswer/);
assert.match(offlineQueue, /removeQueuedAnswer/);
assert.match(runner, /serverTime/);
assert.match(runner, /serverOffset/);
assert.match(runner, /window\.addEventListener\("online"/);
assert.match(runner, /submit\(true\)/);
assert.match(runner, /\/api\/candidate\/attempts\/\$\{attemptId\}\/answers/);
assert.doesNotMatch(runner, /\.from\("candidate_responses"\)\.upsert/);
assert.match(workspace, /\/api\/candidate\/attempts\/start/);
assert.doesNotMatch(workspace, /\.update\(\{ status: "in_progress" \}\)/);

console.log("Phase 4 exam-taking regression tests passed.");
