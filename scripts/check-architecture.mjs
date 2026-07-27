import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const featureMapPath = join(root, "architecture", "feature-map.json");
const budgetsPath = join(root, "architecture", "module-budgets.json");
const errors = [];

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [path];
  });
}

const featureMap = readJson(featureMapPath, "feature-map.json");
const budgets = readJson(budgetsPath, "module-budgets.json");

if (featureMap?.version !== 1 || !featureMap.features) {
  errors.push("feature-map.json must declare version 1 and a features object.");
}

for (const [name, feature] of Object.entries(featureMap?.features ?? {})) {
  if (!feature.entry || !Array.isArray(feature.owners)) {
    errors.push(`${name} must declare an entry and owners.`);
    continue;
  }

  for (const path of [feature.entry, ...feature.owners]) {
    if (!existsSync(join(root, path))) {
      errors.push(`${name} references missing owner: ${path}`);
    }
  }

  if (!feature.validation || !feature.validation.startsWith("npm run ")) {
    errors.push(`${name} must declare an npm validation command.`);
  }
}

if (budgets?.version !== 1 || !budgets.defaults?.newSourceFileMaxLines) {
  errors.push("module-budgets.json must declare version 1 and source limits.");
}

const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css"]);
const sourceLimit = budgets?.defaults?.newSourceFileMaxLines ?? 700;
const testLimit = budgets?.defaults?.newTestFileMaxLines ?? 600;
const legacy = budgets?.legacyNonGrowth ?? {};

for (const path of sourceFiles(join(root, "src"))) {
  if (!allowedExtensions.has(extname(path))) continue;
  const repoPath = relative(root, path).replaceAll("\\", "/");
  const lines = readFileSync(path, "utf8").split(/\r?\n/).length;
  const isTest = /\.(test|spec)\.[^.]+$/.test(repoPath);
  const limit = legacy[repoPath] ?? (isTest ? testLimit : sourceLimit);
  if (lines > limit) {
    errors.push(`${repoPath} has ${lines} lines; its architecture budget is ${limit}.`);
  }
}

const styleDirectory = join(root, "src", "styles");
for (const path of sourceFiles(styleDirectory)) {
  if (extname(path) !== ".css" || path === join(styleDirectory, "tokens.css")) continue;
  const repoPath = relative(root, path).replaceAll("\\", "/");
  const contents = readFileSync(path, "utf8");
  const rawColors = contents.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  if (rawColors.length) {
    errors.push(`${repoPath} contains raw colors (${[...new Set(rawColors)].join(", ")}); add semantic values to tokens.css instead.`);
  }
  if (/surface-inverse|line-inverse|accent\b/.test(contents)) {
    errors.push(`${repoPath} references a retired dark-theme token.`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Architecture contract passed.");
