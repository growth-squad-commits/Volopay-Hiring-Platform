import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const candidateLogin = await source("src/app/candidate/login/page.tsx");
const adminLoginRoute = await source("src/app/api/auth/login/route.ts");
const magicLinkRoute = await source("src/app/api/auth/magic-link/route.ts");
const callbackRoute = await source("src/app/auth/callback/route.ts");
const candidatePage = await source("src/app/candidate/page.tsx");
const assessmentPage = await source("src/app/candidate/assessment/[candidateId]/page.tsx");
const adminDashboard = await source("src/components/admin-dashboard.tsx");
const candidateApi = await source("src/app/api/admin/candidates/route.ts");
const authHelper = await source("src/lib/server/auth.ts");
const rateLimit = await source("src/lib/server/rate-limit.ts");
const activeMigration = await source("supabase/migrations/202607280003_candidate_active_access.sql");
const expiryMigration = await source("supabase/migrations/202607280004_candidate_access_expiry.sql");
const consolidatedPolicies = await source("supabase/migrations/202607280004_consolidate_candidate_rls.sql");

assert.doesNotMatch(candidateLogin, /type="password"|passwordLogin|portal:\s*"candidate"/);
assert.match(candidateLogin, /\/api\/auth\/magic-link/);
assert.match(candidateLogin, /access_expired/);
assert.match(candidateLogin, /Your assessment access has expired/);
assert.match(adminLoginRoute, /body\.portal !== "admin"/);
assert.doesNotMatch(adminLoginRoute, /portal !== "candidate"|login-ip:\$\{portal\}/);
assert.match(adminLoginRoute, /login-account:admin/);
assert.match(magicLinkRoute, /eq\("is_active", true\)/);
assert.match(magicLinkRoute, /access_expires_at/);
assert.match(magicLinkRoute, /magic-link-account/);
assert.match(callbackRoute, /safeCandidatePath/);
assert.match(callbackRoute, /type === "email"/);
assert.match(callbackRoute, /createAdminClient/);
assert.match(callbackRoute, /access_expired/);
assert.match(candidatePage, /eq\("is_active", true\)/);
assert.match(candidatePage, /access_expires_at/);
assert.match(assessmentPage, /eq\("is_active", true\)/);
assert.match(assessmentPage, /access_expires_at/);
assert.match(adminDashboard, /Access expires at/);
assert.match(adminDashboard, /window\.confirm/);
assert.match(adminDashboard, /Deactivate access/);
assert.match(candidateApi, /accessExpiresAt/);
assert.match(candidateApi, /Candidate access expiry must be in the future/);
assert.match(authHelper, /candidate\/assessment\/\[0-9\]\+/);
assert.match(rateLimit, /consume_auth_rate_limit/);
assert.match(activeMigration, /add column if not exists is_active boolean not null default true/);
assert.match(activeMigration, /old\.is_active is not true/);
assert.match(activeMigration, /new\.is_active is distinct from old\.is_active/);
assert.match(expiryMigration, /add column if not exists access_expires_at timestamptz/);
assert.match(expiryMigration, /candidate_access_allowed/);
assert.match(consolidatedPolicies, /drop policy if exists candidates_candidate_select/);
assert.match(consolidatedPolicies, /drop policy if exists candidate_responses_candidate_update/);

console.log("Phase 1 authentication regression tests passed.");
