#!/usr/bin/env node
// Enforce the public release contract:
// - root package.json is the canonical version
// - release tags must match that version
// - npm and PyPI should either both have the version already or neither should
// - after publish, both registries must report the released version live

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCanonicalVersion } from "./versions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRE_BOTH_LIVE = process.argv.includes("--require-both-live");

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
const npmName = pkg.name;
const version = readCanonicalVersion();
const pypiName = readPyProjectName();

const refTag = process.env.GITHUB_REF_NAME;
if (refTag?.startsWith("v") && refTag.slice(1) !== version) {
  fail(
    `git tag ${refTag} does not match canonical version ${version}. Run npm run versions:sync before tagging.`
  );
}

const npmLive = isNpmVersionPublished(npmName, version);
const pypiLive = await isPyPIVersionPublished(pypiName, version);

if (!REQUIRE_BOTH_LIVE && npmLive !== pypiLive) {
  fail(
    `${npmName}@${version} and ${pypiName} ${version} are out of sync before publish. ` +
      `Fix the missing registry publish before cutting another release tag.`
  );
}

if (REQUIRE_BOTH_LIVE && (!npmLive || !pypiLive)) {
  fail(
    `post-publish parity failed: npm=${statusWord(npmLive)} / pypi=${statusWord(pypiLive)} for ${version}`
  );
}

console.log(
  [
    REQUIRE_BOTH_LIVE ? "release parity verified live" : "release parity preflight passed",
    `version=${version}`,
    `npm=${statusWord(npmLive)}`,
    `pypi=${statusWord(pypiLive)}`,
  ].join(" · ")
);

function readPyProjectName() {
  const pyproject = readFileSync(resolve(ROOT, "python/pyproject.toml"), "utf-8");
  const match = pyproject.match(/^name\s*=\s*"([^"]+)"/m);
  if (!match) fail("python/pyproject.toml has no project.name");
  return match[1];
}

function isNpmVersionPublished(name, targetVersion) {
  const result = spawnSync("npm", ["view", `${name}@${targetVersion}`, "version"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (result.status !== 0) return false;
  return result.stdout.trim() === targetVersion;
}

async function isPyPIVersionPublished(name, targetVersion) {
  const response = await fetch(
    `https://pypi.org/pypi/${encodeURIComponent(name)}/${targetVersion}/json`,
    {
      headers: {
        "user-agent": "axint-release-parity-check",
      },
    }
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    fail(`PyPI parity lookup failed with ${response.status} ${response.statusText}`);
  }
  return true;
}

function statusWord(value) {
  return value ? "live" : "missing";
}

function fail(message) {
  console.error(`release parity check failed: ${message}`);
  process.exit(1);
}
