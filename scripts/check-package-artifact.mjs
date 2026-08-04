#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const result = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: ROOT,
  encoding: "utf8",
});

if (result.status !== 0) {
  fail(result.stderr.trim() || "npm pack --dry-run failed");
}

let manifests;
try {
  manifests = JSON.parse(result.stdout);
} catch {
  fail(`npm pack returned invalid JSON:\n${result.stdout.slice(0, 2_000)}`);
}

const manifest = manifests?.[0];
if (!manifest || manifest.name !== pkg.name || manifest.version !== pkg.version) {
  fail("npm pack did not describe the canonical package name and version");
}

const files = manifest.files ?? [];
const paths = new Set(files.map((file) => file.path));
const required = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "TRADEMARKS.md",
  "package.json",
  "dist/cli/index.js",
  "dist/a2a/index.js",
  "dist/a2a/index.d.ts",
  "dist/core/index.js",
  "dist/core/index.d.ts",
  "dist/mcp/index.js",
  "dist/mcp/index.d.ts",
  "dist/mcp/http.js",
  "dist/mcp/register.js",
  "dist/sdk/index.js",
  "dist/sdk/index.d.ts",
];

for (const path of required) {
  if (!paths.has(path)) fail(`packed npm artifact is missing ${path}`);
}

const allowedTopLevel = new Set([
  "LICENSE",
  "NOTICE",
  "README.md",
  "TRADEMARKS.md",
  "package.json",
]);
const forbidden = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /\.(?:key|pem|p12|mobileprovision)$/i,
  /^(?:src|tests|test-results|coverage|\.github|\.axint)\//,
];

for (const file of files) {
  const path = file.path;
  if (!path.startsWith("dist/") && !allowedTopLevel.has(path)) {
    fail(`unexpected top-level package content: ${path}`);
  }
  if (forbidden.some((pattern) => pattern.test(path))) {
    fail(`sensitive or development-only file would be published: ${path}`);
  }
}

for (const binPath of new Set(Object.values(pkg.bin ?? {}))) {
  const entry = files.find((file) => file.path === binPath);
  if (!entry) fail(`declared executable ${binPath} is missing`);
  if ((entry.mode & 0o111) === 0) {
    fail(`declared executable ${binPath} is not executable in the package`);
  }
}

const packedLimit = 3 * 1024 * 1024;
const unpackedLimit = 12 * 1024 * 1024;
if (manifest.size > packedLimit) {
  fail(
    `packed artifact is ${formatBytes(manifest.size)}; limit is ${formatBytes(packedLimit)}`
  );
}
if (manifest.unpackedSize > unpackedLimit) {
  fail(
    `unpacked artifact is ${formatBytes(manifest.unpackedSize)}; limit is ${formatBytes(unpackedLimit)}`
  );
}

console.log(
  [
    "npm artifact verified",
    `${manifest.entryCount} files`,
    `${formatBytes(manifest.size)} packed`,
    `${formatBytes(manifest.unpackedSize)} unpacked`,
    "no sensitive or development-only paths",
  ].join(" · ")
);

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function fail(message) {
  console.error(`package artifact check failed: ${message}`);
  process.exit(1);
}
