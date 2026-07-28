import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = await source("supabase/migrations/202607280006_question_banks.sql");
const validation = await source("src/lib/server/question-bank-validation.ts");
const bankApi = await source("src/app/api/admin/question-banks/route.ts");
const itemApi = await source("src/app/api/admin/question-bank-items/route.ts");

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
assert.match(bankApi, /questions\.length > 500/);
assert.match(bankApi, /validateQuestionInput/);
assert.match(itemApi, /requireAdmin/);
assert.match(itemApi, /validateQuestionInput/);

console.log("Phase 2 question bank regression tests passed.");
