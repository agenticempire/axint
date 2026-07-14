#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdownFiles = execFileSync("git", ["ls-files", "*.md"], {
  cwd: ROOT,
  encoding: "utf-8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const failures = [];

for (const file of markdownFiles) {
  const absolute = resolve(ROOT, file);
  if (!existsSync(absolute)) continue;
  const source = readFileSync(absolute, "utf-8").replace(/```[\s\S]*?```/g, "");
  const destinations = [
    ...matches(source, /!?\[[^\]]*\]\(([^)]+)\)/g),
    ...matches(
      source,
      /<(?:a|img|source)\b[^>]*\b(?:href|src|srcset)=["']([^"']+)["'][^>]*>/gi
    ),
  ];

  for (const raw of destinations) {
    const destination = normalizeDestination(raw);
    if (!destination || isExternal(destination)) continue;
    const pathOnly = destination.split("#", 1)[0].split("?", 1)[0];
    if (!pathOnly) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(pathOnly);
    } catch {
      failures.push(`${file}: invalid URL encoding in ${destination}`);
      continue;
    }
    const target = resolve(dirname(absolute), decoded);
    if (!existsSync(target))
      failures.push(`${file}: missing local target ${destination}`);
  }
}

if (failures.length > 0) {
  console.error("Broken local Markdown links:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Checked local links in ${markdownFiles.length} tracked Markdown files`);

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function normalizeDestination(raw) {
  const value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    return close === -1 ? value.slice(1) : value.slice(1, close);
  }
  return value.split(/\s+["']/u, 1)[0];
}

function isExternal(destination) {
  return (
    destination.startsWith("#") ||
    destination.startsWith("/") ||
    destination.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(destination)
  );
}
