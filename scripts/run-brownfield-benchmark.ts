import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { BROWNFIELD_CORPUS } from "../benchmarks/brownfield/corpus.js";
import { normalizeDiagnosticEvidence } from "../src/core/diagnostic-evidence.js";
import { validateSwiftSource } from "../src/core/swift-validator.js";

interface CaseResult {
  id: string;
  title: string;
  expectation: "clean" | "finding";
  expectedCodes: string[];
  emittedCodes: string[];
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  passed: boolean;
}

export interface BrownfieldBenchmarkReport {
  schema: "https://axint.ai/schemas/brownfield-benchmark.v1.json";
  corpus: {
    name: string;
    version: string;
    scope: string;
    cases: number;
    cleanCases: number;
    findingCases: number;
  };
  metrics: {
    precision: number;
    recall: number;
    cleanAbstentionRate: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
  };
  cases: CaseResult[];
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

export function runBrownfieldBenchmark(): BrownfieldBenchmarkReport {
  const cases = BROWNFIELD_CORPUS.map<CaseResult>((fixture) => {
    const diagnostics = validateSwiftSource(
      fixture.source,
      `benchmarks/brownfield/${fixture.id}.swift`
    ).diagnostics.map(normalizeDiagnosticEvidence);
    const emittedCodes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].sort();
    const expected = new Set(fixture.expectedCodes);
    const emitted = new Set(emittedCodes);
    const truePositives = emittedCodes.filter((code) => expected.has(code));
    const falsePositives = emittedCodes.filter((code) => !expected.has(code));
    const falseNegatives = fixture.expectedCodes.filter((code) => !emitted.has(code));
    return {
      id: fixture.id,
      title: fixture.title,
      expectation: fixture.expectation,
      expectedCodes: [...fixture.expectedCodes].sort(),
      emittedCodes,
      truePositives,
      falsePositives,
      falseNegatives,
      passed: falsePositives.length === 0 && falseNegatives.length === 0,
    };
  });

  const truePositives = cases.reduce((sum, item) => sum + item.truePositives.length, 0);
  const falsePositives = cases.reduce((sum, item) => sum + item.falsePositives.length, 0);
  const falseNegatives = cases.reduce((sum, item) => sum + item.falseNegatives.length, 0);
  const cleanCases = cases.filter((item) => item.expectation === "clean");
  const cleanAbstentions = cleanCases.filter((item) => item.emittedCodes.length === 0).length;

  return {
    schema: "https://axint.ai/schemas/brownfield-benchmark.v1.json",
    corpus: {
      name: "Axint curated brownfield regression corpus",
      version: "1.0.0",
      scope:
        "Small, transparent rule-level regression corpus. It is not a representative estimate for arbitrary production Swift projects.",
      cases: cases.length,
      cleanCases: cleanCases.length,
      findingCases: cases.length - cleanCases.length,
    },
    metrics: {
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
      cleanAbstentionRate: ratio(cleanAbstentions, cleanCases.length),
      truePositives,
      falsePositives,
      falseNegatives,
    },
    cases,
  };
}

function renderMarkdown(report: BrownfieldBenchmarkReport): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `# Brownfield precision benchmark

This is a small, curated regression corpus. It proves the listed cases and nothing broader.

- Corpus: ${report.corpus.version}
- Cases: ${report.corpus.cases} (${report.corpus.cleanCases} clean, ${report.corpus.findingCases} with labeled findings)
- Precision: ${pct(report.metrics.precision)}
- Recall: ${pct(report.metrics.recall)}
- Clean-case abstention: ${pct(report.metrics.cleanAbstentionRate)}
- False positives: ${report.metrics.falsePositives}
- False negatives: ${report.metrics.falseNegatives}

| Case | Expected | Emitted | Result |
| --- | --- | --- | --- |
${report.cases
  .map(
    (item) =>
      `| ${item.title} | ${item.expectedCodes.join(", ") || "abstain"} | ${item.emittedCodes.join(", ") || "abstain"} | ${item.passed ? "pass" : "fail"} |`
  )
  .join("\n")}
`;
}

const root = resolve(import.meta.dirname, "..");
const jsonPath = resolve(root, "benchmarks/brownfield/latest.json");
const markdownPath = resolve(root, "benchmarks/brownfield/README.md");
const report = runBrownfieldBenchmark();
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = renderMarkdown(report);
const check = process.argv.includes("--check");

if (check) {
  if (!existsSync(jsonPath) || !existsSync(markdownPath)) {
    throw new Error("Brownfield benchmark artifacts are missing. Run npm run benchmark:brownfield.");
  }
  if (readFileSync(jsonPath, "utf-8") !== json) {
    throw new Error("benchmarks/brownfield/latest.json is stale.");
  }
  if (readFileSync(markdownPath, "utf-8") !== markdown) {
    throw new Error("benchmarks/brownfield/README.md is stale.");
  }
} else {
  writeFileSync(jsonPath, json, "utf-8");
  writeFileSync(markdownPath, markdown, "utf-8");
}

if (report.cases.some((item) => !item.passed)) {
  throw new Error("Brownfield benchmark contains mislabeled or regressed cases.");
}

console.log(
  `brownfield benchmark: ${report.corpus.cases} cases · precision ${report.metrics.precision} · recall ${report.metrics.recall} · abstention ${report.metrics.cleanAbstentionRate}`
);
