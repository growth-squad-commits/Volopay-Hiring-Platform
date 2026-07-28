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
const authHelper = await source("src/lib/server/auth.ts");
const rateLimit = await source("src/lib/server/rate-limit.ts");
const activeMigration = await source("supabase/migrations/202607280003_candidate_active_access.sql");

assert.doesNotMatch(candidateLogin, /type="password"|passwordLogin|portal:\s*"candidate"/);
assert.match(candidateLogin, /\/api\/auth\/magic-link/);
assert.match(adminLoginRoute, /body\.portal !== "admin"/);
assert.doesNotMatch(adminLoginRoute, /portal !== "candidate"|login-ip:\$\{portal\}/);
assert.match(adminLoginRoute, /login-account:admin/);
assert.match(magicLinkRoute, /eq\("is_active", true\)/);
assert.match(magicLinkRoute, /magic-link-account/);
assert.match(callbackRoute, /safeCandidatePath/);
assert.match(callbackRoute, /type === "email"/);
assert.match(callbackRoute, /eq\("is_active", true\)/);
assert.match(candidatePage, /eq\("is_active", true\)/);
assert.match(assessmentPage, /eq\("is_active", true\)/);
assert.match(authHelper, /candidate\/assessment\/\[0-9\]\+/);
assert.match(rateLimit, /consume_auth_rate_limit/);
assert.match(activeMigration, /add column if not exists is_active boolean not null default true/);
assert.match(activeMigration, /old\.is_active is not true/);
assert.match(activeMigration, /new\.is_active is distinct from old\.is_active/);

console.log("Phase 1 authentication regression tests passed.");
