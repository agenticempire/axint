import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const FORBIDDEN_PATHS = new Set([
  "docs/voice-rules.md",
]);

const SELF_IGNORED_PATHS = new Set([
  "scripts/check-public-boundary.mjs",
]);

const FORBIDDEN_PATTERNS = [
  { label: "internal sprint artifacts", pattern: /true-north-(audit|sprint)-/ },
  { label: "internal operating docs", pattern: /apex-sprint-/ },
  { label: "memory citation markers", pattern: /<oai-mem-citation>/ },
  { label: "hidden admin route", pattern: /status\/compatibility\/x7f3a/ },
  { label: "private admin domain", pattern: /admin\.agenticempire\.co/ },
  { label: "direct model provider key in OSS intelligence path", pattern: /OPENAI_API_KEY/ },
  { label: "direct model selector in OSS intelligence path", pattern: /AXINT_SUGGEST_MODEL/ },
  { label: "private growth-book reference", pattern: /\bHooked\b/ },
  { label: "private growth-framework author reference", pattern: /\bNir\s+Eyal\b/i },
];

function trackedFiles() {
  const output = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const failures = [];

for (const relativePath of trackedFiles()) {
  if (SELF_IGNORED_PATHS.has(relativePath)) {
    continue;
  }

  const absolutePath = resolve(ROOT, relativePath);

  if (FORBIDDEN_PATHS.has(relativePath)) {
    if (!existsSync(absolutePath)) {
      continue;
    }
    failures.push(`${relativePath}: tracked file is not allowed in the public repo`);
    continue;
  }
  let text = "";
  try {
    text = readFileSync(absolutePath, "utf-8");
  } catch {
    continue;
  }

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) {
      failures.push(`${relativePath}: ${rule.label}`);
    }
  }
}

if (failures.length > 0) {
  console.error("public boundary check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("public boundary check passed");
