#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function extractChangelogSection(changelog: string, version: string): string {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## \\[${escapedVersion}\\][^\\n]*$`, "m").exec(changelog);

  if (!heading) {
    throw new Error(`CHANGELOG.md has no release section for ${version}`);
  }

  const contentStart = heading.index + heading[0].length;
  const remainder = changelog.slice(contentStart);
  const nextHeading = /^## \[/m.exec(remainder);
  const section = remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
  if (!section) {
    throw new Error(`CHANGELOG.md has an empty release section for ${version}`);
  }
  return section;
}

export function renderReleaseBody(changelog: string, version: string): string {
  const section = extractChangelogSection(changelog, version);
  return [
    "## Release notes",
    "",
    section,
    "",
    "## Install",
    "",
    "```bash",
    "npm install -g @axint/compiler",
    "pip install axint",
    "```",
    "",
    "[Full changelog](https://github.com/agenticempire/axint/blob/main/CHANGELOG.md)",
    "",
  ].join("\n");
}

function run(): void {
  const [versionArg, outputFlag, outputPath] = process.argv.slice(2);
  const version = versionArg?.replace(/^v/, "");
  if (!version) {
    throw new Error(
      "usage: npm run release:notes -- <version> [--output <release-notes.md>]"
    );
  }
  if (outputFlag !== undefined && outputFlag !== "--output") {
    throw new Error(`unknown option: ${outputFlag}`);
  }
  if (outputFlag === "--output" && !outputPath) {
    throw new Error("--output requires a file path");
  }

  const changelog = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");
  const body = renderReleaseBody(changelog, version);
  if (outputPath) {
    writeFileSync(resolve(outputPath), body, "utf-8");
  } else {
    process.stdout.write(body);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
