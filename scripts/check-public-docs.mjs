#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf-8");
const packageJson = JSON.parse(read("package.json"));
const metrics = JSON.parse(read("metrics.json"));
const roadmap = read("ROADMAP.md");
const security = read("SECURITY.md");
const releaseNotes = read("docs/RELEASE_NOTES.md");
const languageReadme = read("spec/language/README.md");
const languageBenchmark = read("spec/language/benchmark.md");
const failures = [];

const totalTests =
  Number(metrics.tests?.typescript ?? 0) + Number(metrics.tests?.python ?? 0);
const expectedRelease = `[v${packageJson.version}](https://github.com/agenticempire/axint/releases/tag/v${packageJson.version})`;
const expectedSnapshot =
  `Current verified snapshot: ${metrics.mcpTools} MCP tools + ` +
  `${metrics.mcpPrompts} prompts · ${metrics.bundledTemplates} templates · ` +
  `${metrics.diagnostics} diagnostic codes · ${totalTests} tests.`;

checkMarker(
  roadmap,
  "<!-- metrics:roadmap-release:start -->",
  "<!-- metrics:roadmap-release:end -->",
  expectedRelease,
  "ROADMAP release"
);
checkMarker(
  roadmap,
  "<!-- metrics:roadmap-snapshot:start -->",
  "<!-- metrics:roadmap-snapshot:end -->",
  expectedSnapshot,
  "ROADMAP metrics snapshot"
);

const [major, minor] = String(packageJson.version).split(".");
const currentMinor = `${major}.${minor}.x`;
if (
  !new RegExp(
    `^\\|\\s*${escapeRegExp(currentMinor)}\\s*\\|\\s*Full support\\s*\\|`,
    "m"
  ).test(security)
) {
  failures.push(
    `SECURITY.md does not mark current release line ${currentMinor} as fully supported`
  );
}

if (!releaseNotes.includes(`## ${packageJson.version} -`)) {
  failures.push(`docs/RELEASE_NOTES.md has no current ${packageJson.version} entry`);
}

if (!languageReadme.includes("Implemented experimental surface")) {
  failures.push("language README does not state the implemented experimental status");
}
if (!languageReadme.includes("Direct `.axint` input is not yet wired")) {
  failures.push("language README does not state the direct compile boundary");
}
if (!languageBenchmark.includes("Status: Proposed protocol")) {
  failures.push("language benchmark is not clearly marked as a proposed protocol");
}

for (const [label, pattern] of [
  ["per-PR language benchmark", /benchmark runs on every PR/i],
  [
    "release-blocking language benchmark",
    /release is blocked until the benchmark passes/i,
  ],
  ["published language benchmark badge", /README badge .* links the latest/i],
]) {
  if (pattern.test(languageBenchmark)) {
    failures.push(`language benchmark still claims an unimplemented ${label}`);
  }
}

const internalDocs = [
  "docs/CASE_STUDY_SWARM.md",
  "docs/SHIP_KITS_SPRINT.md",
  "docs/superpowers/plans/2026-07-07-wwdc26-apple-roadmap.md",
  "docs/audits/2026-07-07-apple-platform-gap-analysis.md",
];
for (const path of internalDocs) {
  if (existsSync(resolve(ROOT, path))) {
    failures.push(`internal planning document remains public: ${path}`);
  }
}

if (failures.length > 0) {
  console.error("Public documentation checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Public docs match ${packageJson.version}, canonical metrics, security support, and implemented benchmark status`
);

function checkMarker(source, start, end, expected, label) {
  const firstStart = source.indexOf(start);
  const firstEnd = source.indexOf(end);
  const duplicateStart = source.indexOf(start, firstStart + start.length);
  const duplicateEnd = source.indexOf(end, firstEnd + end.length);
  if (
    firstStart === -1 ||
    firstEnd === -1 ||
    firstEnd < firstStart ||
    duplicateStart !== -1 ||
    duplicateEnd !== -1
  ) {
    failures.push(`${label} marker block is missing, duplicated, or malformed`);
    return;
  }
  const actual = source.slice(firstStart + start.length, firstEnd);
  if (actual !== expected) {
    failures.push(`${label} is stale; run npm run roadmap:sync`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
