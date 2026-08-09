#!/usr/bin/env node
// Fresh-install smoke for the exact tarball a user gets after publish.
// It proves local dist, npm-packed local install, activation, and the
// create-axint-app no-install launchpad path without touching global npm state.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = mkdtempSync(join(tmpdir(), "axint-install-gauntlet-"));
const env = {
  ...process.env,
  AXINT_DISABLE_TELEMETRY: "1",
  npm_config_audit: "false",
  npm_config_fund: "false",
};

const steps = [];

main();

function main() {
  const distCli = resolve(ROOT, "dist/cli/index.js");
  if (!existsSync(distCli)) {
    fail(
      "dist/cli/index.js is missing. Run `npm run build` before the install gauntlet."
    );
  }

  const localActivation = run(
    "local dist activation",
    ["node", distCli, "activate", "--format", "json"],
    ROOT
  );
  assertActivation(localActivation.stdout, "local dist activation");

  const pack = run(
    "npm pack",
    ["npm", "pack", "--json", "--pack-destination", TMP],
    ROOT
  );
  const tarball = resolve(TMP, readPackedFilename(pack.stdout));

  const freshProject = mkdtempSync(join(TMP, "fresh-project-"));
  run("fresh npm init", ["npm", "init", "-y"], freshProject);
  run(
    "fresh tarball install",
    ["npm", "install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"],
    freshProject
  );

  const bin = resolve(freshProject, "node_modules/.bin/axint");
  const a2aBin = resolve(freshProject, "node_modules/.bin/axint-a2a");
  const createBin = resolve(freshProject, "node_modules/.bin/create-axint-app");
  const packedActivation = run(
    "packed activation",
    [bin, "activate", "--format", "json"],
    freshProject
  );
  assertActivation(packedActivation.stdout, "packed activation");
  const a2aHelp = run("packed A2A executable", [a2aBin, "--help"], freshProject);
  if (!a2aHelp.stdout.includes("Run Axint's A2A v1.0 proof and repair server")) {
    fail("packed A2A executable did not print the expected help");
  }
  run(
    "packed A2A import",
    [
      "node",
      "--input-type=module",
      "--eval",
      "const api = await import('@axint/compiler/a2a'); if (typeof api.createAxintA2AApp !== 'function') process.exit(1);",
    ],
    freshProject
  );

  const starterDir = resolve(freshProject, "apple-day-agent");
  run(
    "create-axint-app no-install",
    [createBin, "apple-day-agent", "--no-install"],
    freshProject
  );
  assertExists(resolve(starterDir, "package.json"), "starter package.json");
  assertExists(resolve(starterDir, ".axint/START_HERE.md"), "starter agent instructions");
  assertExists(
    resolve(starterDir, "share/built-with-axint.html"),
    "starter proof preview"
  );

  console.log("");
  console.log("install gauntlet passed");
  for (const step of steps) console.log(`- ${step}`);
  console.log(`temp: ${TMP}`);
}

function run(label, args, cwd) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    env,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 12,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    fail(`${label} failed with exit ${result.status}`);
  }
  steps.push(label);
  return result;
}

function readPackedFilename(stdout) {
  try {
    const packed = JSON.parse(stdout);
    const filename = packed?.[0]?.filename;
    if (typeof filename === "string" && filename.endsWith(".tgz")) return filename;
  } catch {
    // Fall through to the plain-output parser for older npm versions.
  }

  const line = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.endsWith(".tgz"));
  if (line) return line;
  fail("could not find packed tarball filename in npm pack output");
}

function assertActivation(stdout, label) {
  const start = stdout.indexOf("{");
  if (start === -1) fail(`${label} did not print JSON`);
  const report = JSON.parse(stdout.slice(start));
  if (report.status !== "ok" || report.signal !== "axint_activated") {
    fail(`${label} did not return axint_activated`);
  }
}

function assertExists(path, label) {
  if (!existsSync(path)) fail(`${label} was not created at ${path}`);
}

function fail(message) {
  console.error(`install gauntlet failed: ${message}`);
  process.exit(1);
}
