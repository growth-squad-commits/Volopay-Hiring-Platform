import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function has(text, value, label) {
  assert.ok(text.includes(value), `Missing Phase 1 behavior: ${label}`);
}

const candidateLogin = await source("src/app/candidate/login/page.tsx");
const demoCandidateRoute = await source("src/app/api/auth/demo-candidate/route.ts");
const adminLoginRoute = await source("src/app/api/auth/login/route.ts");
const magicLinkRoute = await source("src/app/api/auth/magic-link/route.ts");
const callbackRoute = await source("src/app/auth/callback/route.ts");
const candidatePage = await source("src/app/candidate/page.tsx");
const assessmentPage = await source("src/app/candidate/assessment/[candidateId]/page.tsx");
const adminDashboard = await source("src/components/admin-dashboard.tsx");
const candidateApi = await source("src/app/api/admin/candidates/route.ts");
const serverAuth = await source("src/lib/server/auth.ts");
const rateLimit = await source("src/lib/server/rate-limit.ts");
const activeMigration = await source("supabase/migrations/202607280003_candidate_active_access.sql");
const expiryMigration = await source("supabase/migrations/202607280004_candidate_access_expiry.sql");
const consolidatedPolicies = await source("supabase/migrations/202607280005_consolidate_candidate_rls.sql");

assert.ok(!candidateLogin.includes('type="password"'), "Candidate password input must remain removed.");
has(candidateLogin, "/api/auth/magic-link", "candidate magic-link endpoint");
has(candidateLogin, "/api/auth/demo-candidate", "temporary candidate demo endpoint");
has(candidateLogin, "Continue with demo access", "candidate demo sign-in control");
has(demoCandidateRoute, 'scope: "demo-candidate-ip"', "demo sign-in rate limit");
has(demoCandidateRoute, "admin.auth.admin.generateLink", "passwordless server-side demo session");
has(demoCandidateRoute, 'type: "email"', "demo token verification");
has(demoCandidateRoute, 'source: "temporary_demo"', "isolated demo assignment");
has(demoCandidateRoute, 'status: "not_started"', "database-compatible demo candidate status");
has(demoCandidateRoute, "DEMO_ACCESS_ENDS_AT", "automatic demo-access expiry");
assert.ok(!demoCandidateRoute.includes("signInWithPassword"), "Demo access must not restore password login.");
has(candidateLogin, "Your assessment access has expired", "expired-access message");
has(adminLoginRoute, 'body.portal !== "admin"', "Admin-only password login");
has(adminLoginRoute, "login-account:admin", "Admin account rate limit");
has(magicLinkRoute, '.eq("is_active", true)', "active Candidate filtering");
has(magicLinkRoute, "access_expires_at", "Candidate expiry filtering");
has(magicLinkRoute, "magic-link-account", "magic-link account rate limit");
has(callbackRoute, "safeCandidatePath", "safe callback redirect");
has(callbackRoute, 'type === "email"', "email OTP verification");
has(callbackRoute, "createAdminClient", "server-side Candidate assignment lookup");
has(callbackRoute, "access_expired", "expired callback handling");
has(candidatePage, '.eq("is_active", true)', "active Candidate workspace access");
has(assessmentPage, '.eq("is_active", true)', "active assessment access");
has(adminDashboard, "Access expires at", "Candidate expiry controls");
has(adminDashboard, "window.confirm", "deactivation confirmation");
has(adminDashboard, "Deactivate access", "deactivation prompt");
has(adminDashboard, "Name, Email, Phone, Access Expires At", "Candidate Excel expiry column");
has(candidateApi, "accessExpiresAt", "Candidate expiry API field");
has(candidateApi, "Candidate access expiry must be in the future", "future-expiry validation");
has(serverAuth, "NEXT_PUBLIC_SITE_URL", "canonical magic-link origin");
has(serverAuth, 'request.headers.get("x-forwarded-host")', "Cloudflare forwarded host fallback");
has(serverAuth, 'request.headers.get("x-forwarded-proto")', "Cloudflare forwarded protocol fallback");
has(rateLimit, "consume_auth_rate_limit", "database-backed auth rate limiting");
has(activeMigration, "add column if not exists is_active boolean not null default true", "active Candidate column");
has(activeMigration, "old.is_active is not true", "inactive Candidate update guard");
has(expiryMigration, "add column if not exists access_expires_at timestamptz", "Candidate expiry column migration");
has(expiryMigration, "candidate_access_allowed", "central Candidate access function");
has(consolidatedPolicies, "drop policy if exists candidates_candidate_select", "old Candidate select policy removal");
has(consolidatedPolicies, "drop policy if exists candidate_responses_candidate_update", "old response update policy removal");

console.log("Phase 1 authentication regression tests passed.");
