import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = await source("supabase/migrations/202607280006_question_banks.sql");
const validation = await source("src/lib/server/question-bank-validation.ts");
const bankApi = await source("src/app/api/admin/question-banks/route.ts");
const itemApi = await source("src/app/api/admin/question-bank-items/route.ts");
const bulkApi = await source("src/app/api/admin/question-bank-import/route.ts");
const manager = await source("src/components/question-bank-manager.tsx");
const dashboard = await source("src/components/admin-dashboard.tsx");
const csv = await source("src/lib/csv.ts");
const workflow = await source(".github/workflows/ci.yml");

assert.match(migration, /create table if not exists public\.question_banks/);
assert.match(migration, /create table if not exists public\.question_bank_items/);
assert.match(migration, /response_type in \('written','link','file_upload'\)/);
assert.match(migration, /marks > 0/);
assert.match(migration, /question_bank_items_bank_id_idx/);
assert.match(migration, /private\.is_admin/);

assert.match(validation, /positive whole number/);
assert.match(validation, /written.*link.*file_upload/s);
assert.match(validation, /Maximum file size/);
assert.match(validation, /allowed file types/);
assert.doesNotMatch(validation, /mcq|options|correct_answer/i);

assert.match(bankApi, /requireAdmin/);
assert.match(bankApi, /method|PATCH|DELETE/s);
assert.match(itemApi, /requireAdmin/);
assert.match(bulkApi, /questions\.length > 500/);
assert.match(bulkApi, /errors: \{ row: number; error: string \}\[\]/);
assert.match(manager, /Edit bank/);
assert.match(manager, /Duplicate/);
assert.match(manager, /Written answer type/);
assert.match(manager, /Optional/);
assert.match(manager, /question-bank-import/);
assert.match(csv, /quoted/);
assert.match(dashboard, /Access Expires At/);
assert.match(dashboard, /href="\/admin\/question-banks"/);
assert.match(workflow, /npm run test:phase1/);
assert.match(workflow, /npm run build/);

console.log("Phase 2 question bank regression tests passed.");
