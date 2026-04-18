// Shared description of every surface that pins the Axint version.
// `scripts/sync-versions.mjs` writes; `scripts/check-versions.mjs` reads.
// Root `package.json` is the canonical source. Touch that, then run sync.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const CANONICAL_FILE = "package.json";

export function readCanonicalVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, CANONICAL_FILE), "utf-8"));
  if (typeof pkg.version !== "string" || !pkg.version) {
    throw new Error(`root package.json has no version field`);
  }
  return pkg.version;
}

/**
 * Each surface knows how to read and (re)write its own version.
 * Keeping the logic next to the file path prevents drift between the two.
 */
export const SURFACES = [
  pkgJson("package.json"),
  pyproject("python/pyproject.toml"),
  pyModule("python/axint/__init__.py"),
  pkgJson("extensions/vscode/package.json"),
  pkgJson("extensions/claude-desktop/server/package.json"),
  serverJson("server.json"),
  workerConst("workers/mcp-http/src/worker.ts"),
];

function pkgJson(relPath) {
  const abs = resolve(ROOT, relPath);
  const pattern = /"version":\s*"[^"]*"/;
  return {
    file: relPath,
    read() {
      const pkg = JSON.parse(readFileSync(abs, "utf-8"));
      return [{ where: "version", value: pkg.version }];
    },
    write(version) {
      // Preserve exact formatting — only the version line changes.
      const text = readFileSync(abs, "utf-8");
      if (!pattern.test(text)) throw new Error(`${relPath} has no version field`);
      writeFileSync(abs, text.replace(pattern, `"version": "${version}"`));
    },
  };
}

function pyproject(relPath) {
  const abs = resolve(ROOT, relPath);
  const pattern = /^version\s*=\s*"([^"]+)"/m;
  return {
    file: relPath,
    read() {
      const match = readFileSync(abs, "utf-8").match(pattern);
      if (!match) throw new Error(`${relPath} has no version line`);
      return [{ where: "version", value: match[1] }];
    },
    write(version) {
      const text = readFileSync(abs, "utf-8");
      if (!pattern.test(text)) throw new Error(`${relPath} has no version line`);
      writeFileSync(abs, text.replace(pattern, `version = "${version}"`));
    },
  };
}

function serverJson(relPath) {
  const abs = resolve(ROOT, relPath);
  return {
    file: relPath,
    read() {
      const data = JSON.parse(readFileSync(abs, "utf-8"));
      const rows = [{ where: "version", value: data.version }];
      for (const [i, pkg] of (data.packages ?? []).entries()) {
        rows.push({ where: `packages[${i}].version`, value: pkg.version });
      }
      return rows;
    },
    write(version) {
      const data = JSON.parse(readFileSync(abs, "utf-8"));
      data.version = version;
      for (const pkg of data.packages ?? []) pkg.version = version;
      writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
    },
  };
}

function pyModule(relPath) {
  const abs = resolve(ROOT, relPath);
  const pattern = /^__version__\s*=\s*"([^"]+)"/m;
  return {
    file: relPath,
    read() {
      const match = readFileSync(abs, "utf-8").match(pattern);
      if (!match) throw new Error(`${relPath} has no __version__ constant`);
      return [{ where: "__version__", value: match[1] }];
    },
    write(version) {
      const text = readFileSync(abs, "utf-8");
      if (!pattern.test(text)) throw new Error(`${relPath} has no __version__ constant`);
      writeFileSync(abs, text.replace(pattern, `__version__ = "${version}"`));
    },
  };
}

function workerConst(relPath) {
  const abs = resolve(ROOT, relPath);
  const pattern = /(const\s+VERSION\s*=\s*)"([^"]+)"/;
  return {
    file: relPath,
    read() {
      const match = readFileSync(abs, "utf-8").match(pattern);
      if (!match) throw new Error(`${relPath} has no VERSION constant`);
      return [{ where: "VERSION", value: match[2] }];
    },
    write(version) {
      const text = readFileSync(abs, "utf-8");
      if (!pattern.test(text)) throw new Error(`${relPath} has no VERSION constant`);
      writeFileSync(abs, text.replace(pattern, `$1"${version}"`));
    },
  };
}
