import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

import {
  BROWNFIELD_CORPUS,
  type BrownfieldCase,
} from "../benchmarks/brownfield/corpus.js";
import { normalizeDiagnosticEvidence } from "../src/core/diagnostic-evidence.js";
import { validateSwiftSource } from "../src/core/swift-validator.js";

interface CaseResult {
  id: string;
  title: string;
  category: BrownfieldCase["category"];
  platform: BrownfieldCase["platform"];
  provenance: BrownfieldCase["provenance"];
  expectation: "clean" | "finding";
  sourceSha256: string;
  expectedCodes: string[];
  emittedCodes: string[];
  emittedFindings: Array<{
    code: string;
    confidence: string;
    status: string;
    blocking: boolean;
  }>;
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  passed: boolean;
}

interface CategoryMetrics {
  cases: number;
  cleanCases: number;
  findingCases: number;
  precision: number;
  recall: number;
  cleanAbstentionRate: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface BrownfieldBenchmarkReport {
  schema: "https://axint.ai/schemas/brownfield-benchmark.v2.json";
  methodology: {
    unit: "diagnostic-code-per-labeled-case";
    sourceDisclosure: "sha256-only";
    compilerEvidence: "not-included-in-static-corpus";
    interpretation: string;
  };
  corpus: {
    name: string;
    version: string;
    scope: string;
    cases: number;
    cleanCases: number;
    findingCases: number;
    categories: string[];
    provenance: Record<string, number>;
  };
  thresholds: {
    minimumCases: number;
    minimumCategories: number;
    precision: number;
    recall: number;
    cleanAbstentionRate: number;
    passed: boolean;
    failures: string[];
  };
  metrics: {
    precision: number;
    recall: number;
    cleanAbstentionRate: number;
    falsePositiveRate: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    byCategory: Record<string, CategoryMetrics>;
  };
  cases: CaseResult[];
}

export interface BrownfieldCorpusManifest {
  schema: "https://axint.ai/schemas/brownfield-corpus.v1.json";
  name: string;
  version: string;
  scope: string;
  cases: Array<
    Omit<BrownfieldCase, "source" | "provenance"> & {
      sourcePath: string;
      provenance?: BrownfieldCase["provenance"];
    }
  >;
}

const DEFAULT_THRESHOLDS = {
  minimumCases: 20,
  minimumCategories: 6,
  precision: 0.95,
  recall: 0.95,
  cleanAbstentionRate: 0.95,
};

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

export function runBrownfieldBenchmark(
  corpus: BrownfieldCase[] = BROWNFIELD_CORPUS,
  metadata: { name?: string; version?: string; scope?: string } = {}
): BrownfieldBenchmarkReport {
  const cases = corpus.map<CaseResult>((fixture) => {
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
      category: fixture.category,
      platform: fixture.platform,
      provenance: fixture.provenance,
      expectation: fixture.expectation,
      sourceSha256: sha256(fixture.source),
      expectedCodes: [...fixture.expectedCodes].sort(),
      emittedCodes,
      emittedFindings: diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        confidence: diagnostic.confidence ?? "probable",
        status: diagnostic.status ?? "active",
        blocking: diagnostic.blocking === true,
      })),
      truePositives,
      falsePositives,
      falseNegatives,
      passed: falsePositives.length === 0 && falseNegatives.length === 0,
    };
  });

  const totals = metricsForCases(cases);
  const categories = [...new Set(cases.map((item) => item.category))].sort();
  const byCategory = Object.fromEntries(
    categories.map((category) => [
      category,
      metricsForCases(cases.filter((item) => item.category === category)),
    ])
  );
  const thresholdFailures = [
    cases.length < DEFAULT_THRESHOLDS.minimumCases
      ? `corpus has ${cases.length} cases; minimum is ${DEFAULT_THRESHOLDS.minimumCases}`
      : undefined,
    categories.length < DEFAULT_THRESHOLDS.minimumCategories
      ? `corpus has ${categories.length} categories; minimum is ${DEFAULT_THRESHOLDS.minimumCategories}`
      : undefined,
    totals.precision < DEFAULT_THRESHOLDS.precision
      ? `precision ${totals.precision} is below ${DEFAULT_THRESHOLDS.precision}`
      : undefined,
    totals.recall < DEFAULT_THRESHOLDS.recall
      ? `recall ${totals.recall} is below ${DEFAULT_THRESHOLDS.recall}`
      : undefined,
    totals.cleanAbstentionRate < DEFAULT_THRESHOLDS.cleanAbstentionRate
      ? `clean abstention ${totals.cleanAbstentionRate} is below ${DEFAULT_THRESHOLDS.cleanAbstentionRate}`
      : undefined,
  ].filter((failure): failure is string => Boolean(failure));

  return {
    schema: "https://axint.ai/schemas/brownfield-benchmark.v2.json",
    methodology: {
      unit: "diagnostic-code-per-labeled-case",
      sourceDisclosure: "sha256-only",
      compilerEvidence: "not-included-in-static-corpus",
      interpretation:
        "This report measures rule-level precision, recall, and abstention on its disclosed labeled corpus. It is not a production-wide accuracy claim. Xcode evidence reconciliation is tested separately.",
    },
    corpus: {
      name: metadata.name ?? "Axint curated brownfield regression corpus",
      version: metadata.version ?? "2.0.0",
      scope:
        metadata.scope ??
        "Transparent rule-level fixtures across common Apple project surfaces. Private project manifests can be evaluated locally without publishing source.",
      cases: cases.length,
      cleanCases: cases.filter((item) => item.expectation === "clean").length,
      findingCases: cases.filter((item) => item.expectation === "finding").length,
      categories,
      provenance: countBy(cases.map((item) => item.provenance)),
    },
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      passed: thresholdFailures.length === 0,
      failures: thresholdFailures,
    },
    metrics: {
      ...totals,
      falsePositiveRate: ratio(
        totals.falsePositives,
        totals.truePositives + totals.falsePositives
      ),
      byCategory,
    },
    cases,
  };
}

export function renderBrownfieldBenchmarkMarkdown(
  report: BrownfieldBenchmarkReport
): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `# Brownfield precision benchmark

This is a transparent labeled corpus, not a production-wide accuracy claim. Published artifacts contain fixture hashes, labels, and results, but no Swift source.

- Corpus: ${report.corpus.name} ${report.corpus.version}
- Cases: ${report.corpus.cases} (${report.corpus.cleanCases} clean, ${report.corpus.findingCases} with labeled findings)
- Categories: ${report.corpus.categories.join(", ")}
- Precision: ${pct(report.metrics.precision)}
- Recall: ${pct(report.metrics.recall)}
- Clean-case abstention: ${pct(report.metrics.cleanAbstentionRate)}
- False-positive rate: ${pct(report.metrics.falsePositiveRate)}
- Release thresholds: ${report.thresholds.passed ? "pass" : "fail"}

## Category results

| Category | Cases | Precision | Recall | Clean abstention |
| --- | ---: | ---: | ---: | ---: |
${Object.entries(report.metrics.byCategory)
  .map(
    ([category, metrics]) =>
      `| ${category} | ${metrics.cases} | ${metrics.truePositives + metrics.falsePositives > 0 ? pct(metrics.precision) : "n/a"} | ${metrics.truePositives + metrics.falseNegatives > 0 ? pct(metrics.recall) : "n/a"} | ${metrics.cleanCases > 0 ? pct(metrics.cleanAbstentionRate) : "n/a"} |`
  )
  .join("\n")}

## Cases

| Case | Surface | Expected | Emitted | Result |
| --- | --- | --- | --- | --- |
${report.cases
  .map(
    (item) =>
      `| ${item.title} | ${item.category} | ${item.expectedCodes.join(", ") || "abstain"} | ${item.emittedCodes.join(", ") || "abstain"} | ${item.passed ? "pass" : "fail"} |`
  )
  .join("\n")}

## Reproduce

\`npm run benchmark:brownfield:check\`

To evaluate an opt-in private corpus without publishing source, pass a local manifest:

\`npm run benchmark:brownfield -- --corpus /path/to/corpus.json --out /tmp/axint-benchmark.json\`
`;
}

function metricsForCases(cases: CaseResult[]): CategoryMetrics {
  const truePositives = sum(cases.map((item) => item.truePositives.length));
  const falsePositives = sum(cases.map((item) => item.falsePositives.length));
  const falseNegatives = sum(cases.map((item) => item.falseNegatives.length));
  const cleanCases = cases.filter((item) => item.expectation === "clean");
  const cleanAbstentions = cleanCases.filter((item) => item.emittedCodes.length === 0).length;
  return {
    cases: cases.length,
    cleanCases: cleanCases.length,
    findingCases: cases.length - cleanCases.length,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    cleanAbstentionRate: ratio(cleanAbstentions, cleanCases.length),
    truePositives,
    falsePositives,
    falseNegatives,
  };
}

function loadManifest(path: string): {
  cases: BrownfieldCase[];
  metadata: { name: string; version: string; scope: string };
} {
  const manifestPath = resolve(path);
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf-8")
  ) as BrownfieldCorpusManifest;
  if (manifest.schema !== "https://axint.ai/schemas/brownfield-corpus.v1.json") {
    throw new Error("Unsupported brownfield corpus manifest schema.");
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error("Brownfield corpus manifest must contain at least one case.");
  }
  const root = dirname(manifestPath);
  const cases = manifest.cases.map<BrownfieldCase>((item) => {
    const sourcePath = resolve(root, item.sourcePath);
    if (!existsSync(sourcePath) || extname(sourcePath) !== ".swift") {
      throw new Error(`Corpus source is missing or not Swift: ${item.sourcePath}`);
    }
    return {
      ...item,
      provenance: item.provenance ?? "anonymized-project-fixture",
      source: readFileSync(sourcePath, "utf-8"),
    };
  });
  return {
    cases,
    metadata: {
      name: manifest.name,
      version: manifest.version,
      scope: manifest.scope,
    },
  };
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const root = resolve(import.meta.dirname, "..");
const jsonPath = resolve(root, "benchmarks/brownfield/latest.json");
const markdownPath = resolve(root, "benchmarks/brownfield/README.md");
const corpusPath = optionValue("--corpus");
const outputPath = optionValue("--out");
const loaded = corpusPath ? loadManifest(corpusPath) : undefined;
const report = runBrownfieldBenchmark(loaded?.cases, loaded?.metadata);
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = renderBrownfieldBenchmarkMarkdown(report);
const check = process.argv.includes("--check");

if (corpusPath) {
  if (check) throw new Error("--check is reserved for the repository corpus.");
  if (outputPath) writeFileSync(resolve(outputPath), json, "utf-8");
  else console.log(json);
} else if (check) {
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
if (!report.thresholds.passed) {
  throw new Error(`Brownfield benchmark threshold failure: ${report.thresholds.failures.join("; ")}`);
}

console.log(
  `brownfield benchmark: ${report.corpus.cases} cases · ${report.corpus.categories.length} categories · precision ${report.metrics.precision} · recall ${report.metrics.recall} · abstention ${report.metrics.cleanAbstentionRate}`
);
