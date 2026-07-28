import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const runner = await source("src/components/assessment-runner.tsx");
const workspace = await source("src/components/candidate-workspace.tsx");
const confirmationPage = await source("src/app/candidate/submission/[candidateId]/page.tsx");
const confirmation = await source("src/components/submission-confirmation.tsx");
const dashboard = await source("src/components/admin-dashboard.tsx");

assert.match(runner, /candidate\/submission\/\$\{candidateId\}/);
assert.match(runner, /response_type==="link"/);
assert.match(runner, /response_type==="file_upload"/);
assert.match(runner, /candidate-submissions/);
assert.match(workspace, /View submission/);
assert.match(confirmationPage, /\.in\("status", \["submitted", "reviewed"\]\)/);
assert.match(confirmation, /Your answers are locked/);
assert.match(confirmation, /createSignedUrl\(path, 300\)/);
assert.match(dashboard, /View & review/);
assert.match(dashboard, /Open submitted file/);
assert.match(dashboard, /createSignedUrl\(path, 300\)/);

console.log("Submission flow regression tests passed.");
