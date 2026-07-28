import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = await source("supabase/migrations/202607280007_exam_builder_snapshots.sql");
const api = await source("src/app/api/admin/assessments/route.ts");
const dashboard = await source("src/components/admin-dashboard.tsx");
const workflow = await source(".github/workflows/ci.yml");

assert.match(migration, /source_bank_item_id/);
assert.match(migration, /source_bank_item_updated_at/);
assert.match(migration, /frozen_at/);
assert.match(migration, /Published assessment questions are frozen/);
assert.match(migration, /An assessment needs at least one question before publishing/);
assert.match(migration, /Published assessment configuration is frozen/);

assert.match(api, /requireAdmin/);
assert.match(api, /question_bank_items/);
assert.match(api, /status: "draft"/);
assert.match(api, /status: "published"/);
assert.match(api, /source_bank_item_id/);
assert.match(api, /totalPoints/);
assert.match(dashboard, /Add from question bank/);
assert.match(workflow, /npm run test:phase3/);

console.log("Phase 3 exam builder regression tests passed.");
