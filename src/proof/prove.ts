import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fixSwiftSourceMultipass } from "../core/swift-fixer.js";
import {
  queueAutomaticFeedback,
  type AxintProofLearningSignal,
} from "../feedback/auto.js";
import {
  renderAxintRunReport,
  runAxintProject,
  type AxintRunFormat,
  type AxintRunPlatform,
  type AxintRunReport,
} from "../run/project-runner.js";
import {
  createSignedProofReceipt,
  verifySignedProofReceipt,
  writeSignedProofReceipt,
  type AxintProofReceiptArtifacts,
  type AxintProofRepair,
  type AxintSignedProofReceipt,
} from "./receipt.js";

export interface AxintProveInput {
  cwd?: string;
  version: string;
  projectName?: string;
  scheme?: string;
  workspace?: string;
  project?: string;
  destination?: string;
  configuration?: string;
  derivedDataPath?: string;
  testPlan?: string;
  onlyTesting?: string[];
  platform?: AxintRunPlatform;
  modifiedFiles?: string[];
  skipBuild?: boolean;
  skipTests?: boolean;
  runtime?: boolean;
  timeoutSeconds?: number;
  dryRun?: boolean;
  fix?: boolean;
  outputDir?: string;
  signal?: AbortSignal;
}

export interface AxintProveReport {
  status: AxintRunReport["status"];
  gate: AxintRunReport["gate"];
  run: AxintRunReport;
  receipt: AxintSignedProofReceipt;
  repairs: AxintProofRepair[];
  reranAfterRepair: boolean;
  testDiscovery: {
    available: boolean;
    reason: string;
  };
  artifacts: {
    runJson?: string;
    runMarkdown?: string;
    receipt: AxintProofReceiptArtifacts;
  };
}

export async function proveAxintProject(
  input: AxintProveInput
): Promise<AxintProveReport> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const outputDirectory = resolve(cwd, input.outputDir ?? ".axint/proof");
  const testDiscovery = discoverXcodeTests(cwd, input);
  const skipTests = input.skipTests === true || !testDiscovery.available;
  const platform = input.platform ?? inferProjectPlatform(cwd);
  const runInput = {
    cwd,
    projectName: input.projectName,
    expectedVersion: input.version,
    platform,
    scheme: input.scheme,
    workspace: input.workspace,
    project: input.project,
    destination: input.destination,
    configuration: input.configuration,
    derivedDataPath: input.derivedDataPath,
    testPlan: input.testPlan,
    onlyTesting: input.onlyTesting,
    modifiedFiles: input.modifiedFiles,
    skipBuild: input.skipBuild,
    skipTests,
    runtime: input.runtime,
    timeoutSeconds: input.timeoutSeconds,
    dryRun: input.dryRun,
    writeReport: true,
    integration: "minimal" as const,
    localOnly: true,
    advisory: true,
    fix: false,
    outputDir: outputDirectory,
    signal: input.signal,
  };

  let run = await runAxintProject(runInput);
  annotateTestDiscovery(run, testDiscovery, input.skipTests === true);
  const repairs = inspectDeterministicRepairs(run, cwd, input.fix === true);
  const applied = repairs.some((repair) => repair.outcome === "applied");
  if (applied) {
    run = await runAxintProject(runInput);
    annotateTestDiscovery(run, testDiscovery, input.skipTests === true);
  }

  const receipt = createSignedProofReceipt({
    report: run,
    version: input.version,
    repairs,
    sourceMutation: applied,
  });
  const receiptArtifacts = writeSignedProofReceipt(receipt, outputDirectory);
  const report: AxintProveReport = {
    status: run.status,
    gate: run.gate,
    run,
    receipt,
    repairs,
    reranAfterRepair: applied,
    testDiscovery,
    artifacts: {
      runJson: run.artifacts.json,
      runMarkdown: run.artifacts.markdown,
      receipt: receiptArtifacts,
    },
  };
  queueAutomaticFeedback(buildProofLearningSignal(report, input.version), {
    cwd,
    packetType: "proof",
  });
  return report;
}

export function buildProofLearningSignal(
  report: AxintProveReport,
  version: string
): AxintProofLearningSignal {
  const commands = report.receipt.payload.evidence.commands;
  const commandOutcome = (kind: "build" | "test" | "runtime") => {
    const matching = commands.filter(
      (command) => command.kind === kind && !command.dryRun
    );
    if (matching.length === 0) return null;
    return matching.every(
      (command) => command.exitCode === 0 && !command.timedOut && !command.signal
    );
  };
  const diagnosticCodes = Array.from(
    new Set([
      ...report.run.swiftValidation.diagnostics.map((diagnostic) => diagnostic.code),
      ...report.run.cloudChecks.flatMap((check) =>
        check.diagnostics.map((diagnostic) => diagnostic.code)
      ),
      ...report.repairs.flatMap((repair) => repair.codes),
    ])
  ).slice(0, 16);
  const repairsApplied = report.repairs.filter(
    (repair) => repair.outcome === "applied"
  ).length;
  const repairsProposed = report.repairs.filter(
    (repair) => repair.outcome === "proposed"
  ).length;
  const owner =
    report.run.xcodeTestFailures.length > 0
      ? "xcode-runner"
      : diagnosticCodes.length > 0
        ? "swift-validator"
        : "proof-runner";

  return {
    schema: "https://axint.ai/schemas/proof-feedback.v1.json",
    fingerprint: `proof-${report.receipt.payload.id}`,
    createdAt: report.receipt.payload.createdAt,
    compilerVersion: version,
    redaction: "source_not_included",
    kind: `proof-${report.gate.decision}`,
    priority: report.status === "fail" ? "p1" : report.status === "pass" ? "p3" : "p2",
    status: report.status,
    diagnosticCodes,
    signals: [
      `proof-${report.status}`,
      `gate-${report.gate.decision}`,
      report.testDiscovery.available ? "tests-discovered" : "tests-unavailable",
      ...(repairsApplied > 0 ? ["deterministic-repair-applied"] : []),
      ...(repairsProposed > 0 ? ["deterministic-repair-proposed"] : []),
      ...(report.reranAfterRepair ? ["proof-reran-after-repair"] : []),
    ],
    suggestedOwner: owner,
    suggestedAction:
      report.status === "pass"
        ? "Correlate this passing proof shape with earlier repair signals and preserve the successful recipe."
        : "Cluster the failing diagnostics and evidence stage, then improve the responsible validator or proof recipe.",
    projectShape: {
      platform: report.receipt.payload.project.platform,
      changedFiles: report.receipt.payload.project.git.changedFiles,
      evidenceSteps: report.receipt.payload.evidence.steps.length,
    },
    outcome: {
      decision: report.gate.decision,
      repairsApplied,
      repairsProposed,
      reranAfterRepair: report.reranAfterRepair,
      buildPassed: commandOutcome("build"),
      testsPassed: commandOutcome("test"),
      runtimePassed: commandOutcome("runtime"),
    },
  };
}

export function renderAxintProveReport(
  report: AxintProveReport,
  format: AxintRunFormat = "markdown"
): string {
  if (format === "json") {
    const compactRun = JSON.parse(renderAxintRunReport(report.run, "json")) as unknown;
    return `${JSON.stringify({ ...report, run: compactRun }, null, 2)}\n`;
  }
  if (format === "prompt") {
    return report.run.repairPrompt.replace(
      /After repairing, rerun `axint run`/g,
      "After repairing, rerun `axint prove`"
    );
  }

  const verification = verifySignedProofReceipt(report.receipt);
  const proposed = report.repairs.filter((repair) => repair.outcome === "proposed");
  const lines = [
    `# Axint Prove: ${report.gate.decision}`,
    "",
    `- Status: ${report.status}`,
    `- Reason: ${report.gate.reason}`,
    `- Receipt signature: ${verification.valid ? "valid" : "invalid"}`,
    `- Receipt: ${report.artifacts.receipt.json}`,
    `- Human-readable receipt: ${report.artifacts.receipt.markdown}`,
    "- Local-only: yes",
    "- Source included in receipt: no",
    `- Repairs applied: ${report.repairs.filter((repair) => repair.outcome === "applied").length}`,
    `- Reran after repair: ${report.reranAfterRepair ? "yes" : "no"}`,
    `- Test discovery: ${report.testDiscovery.available ? "test target found" : report.testDiscovery.reason}`,
    "",
    "## Evidence",
    "",
    ...report.run.steps.map(
      (step) => `- ${step.state.toUpperCase()} ${step.name}: ${step.detail}`
    ),
    "",
    "## Findings",
    "",
    ...(report.run.swiftValidation.diagnostics.length
      ? report.run.swiftValidation.diagnostics.map(
          (finding) =>
            `- ${finding.code} ${finding.id} [${finding.status === "suppressed" ? "suppressed" : (finding.confidence ?? "probable")}]: ${finding.message}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""}`
        )
      : ["- None."]),
    ...(proposed.length
      ? [
          "",
          "## Deterministic Repairs Available",
          "",
          ...proposed.map((repair) => `- ${repair.file}: ${repair.codes.join(", ")}`),
          "",
          "Apply only these deterministic rewrites and rerun proof with `axint prove --fix`.",
        ]
      : []),
    "",
    "## Next",
    "",
    ...(report.run.nextSteps.length
      ? report.run.nextSteps.map(
          (step) => `- ${step.replace(/axint run/g, "axint prove")}`
        )
      : ["- Keep the signed receipt with the reviewed change."]),
    "",
    "## Verify",
    "",
    `\`axint receipt verify ${report.artifacts.receipt.json}\``,
  ];
  return lines.join("\n");
}

function inspectDeterministicRepairs(
  report: AxintRunReport,
  cwd: string,
  apply: boolean
): AxintProofRepair[] {
  const files = new Set(
    report.swiftValidation.diagnostics
      .filter((finding) => finding.status !== "suppressed" && finding.file)
      .map((finding) => resolve(cwd, finding.file!))
      .filter((file) => withinProject(file, cwd) && existsSync(file))
  );
  const repairs: AxintProofRepair[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    const result = fixSwiftSourceMultipass(source, relative(cwd, file));
    if (result.fixed.length === 0 || result.source === source) continue;
    if (apply) writeFileSync(file, result.source, "utf-8");
    repairs.push({
      file: relative(cwd, file).replace(/\\/g, "/"),
      codes: [...new Set(result.fixed.map((finding) => finding.code))].sort(),
      outcome: apply ? "applied" : "proposed",
    });
  }
  return repairs;
}

function withinProject(path: string, cwd: string): boolean {
  const rel = relative(cwd, path);
  return (
    !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\")
  );
}

function discoverXcodeTests(
  cwd: string,
  input: AxintProveInput
): AxintProveReport["testDiscovery"] {
  if (input.skipTests) {
    return { available: false, reason: "tests were explicitly skipped" };
  }
  if (input.onlyTesting?.length || input.testPlan) {
    return { available: true, reason: "an explicit test selector or plan was supplied" };
  }

  const projectFiles = findFiles(cwd, (path) => path.endsWith("project.pbxproj"));
  for (const path of projectFiles) {
    const source = readFileSync(path, "utf-8");
    if (
      /com\.apple\.product-type\.bundle\.(?:unit-test|ui-testing)/.test(source) ||
      /productType\s*=\s*"?com\.apple\.product-type\.bundle\.(?:unit-test|ui-testing)"?/.test(
        source
      )
    ) {
      return { available: true, reason: "an Xcode unit or UI test target was found" };
    }
  }

  const schemeFiles = findFiles(cwd, (path) => extname(path) === ".xcscheme");
  for (const path of schemeFiles) {
    if (/<TestableReference\b/.test(readFileSync(path, "utf-8"))) {
      return {
        available: true,
        reason: "the selected project contains a testable scheme",
      };
    }
  }

  return {
    available: false,
    reason: "no Xcode unit or UI test target was discovered",
  };
}

function inferProjectPlatform(cwd: string): AxintRunPlatform {
  const projectFiles = findFiles(cwd, (path) => path.endsWith("project.pbxproj"));
  const source = projectFiles
    .flatMap((path) => {
      try {
        return [readFileSync(path, "utf-8")];
      } catch {
        return [];
      }
    })
    .join("\n");
  if (/SDKROOT\s*=\s*(?:iphoneos|iphonesimulator)/i.test(source)) return "iOS";
  if (/SDKROOT\s*=\s*(?:watchos|watchsimulator)/i.test(source)) return "watchOS";
  if (/SDKROOT\s*=\s*(?:xros|xrsimulator)/i.test(source)) return "visionOS";
  return "macOS";
}

function annotateTestDiscovery(
  report: AxintRunReport,
  discovery: AxintProveReport["testDiscovery"],
  explicitlySkipped: boolean
) {
  if (discovery.available || explicitlySkipped) return;
  const step = report.steps.find((item) => item.name === "Xcode test");
  if (step)
    step.detail =
      "No Xcode unit or UI test target was discovered; test proof is still required before shipping.";
  if (report.gate.decision === "evidence_required") {
    report.gate.reason =
      "The Xcode build can be proved, but no test target was discovered, so test evidence is still required before shipping.";
    if (report.toolContract) {
      report.toolContract.summary = `${report.projectName}: ${report.gate.reason}`;
      report.toolContract.nextAction.reason = report.gate.reason;
    }
  }
}

function findFiles(cwd: string, predicate: (path: string) => boolean): string[] {
  const ignored = new Set([
    ".git",
    ".axint",
    ".build",
    ".swiftpm",
    "DerivedData",
    "node_modules",
    "Pods",
  ]);
  const found: string[] = [];
  const visit = (directory: string, depth: number) => {
    if (depth < 0 || !existsSync(directory)) return;
    for (const entry of readdirSync(directory)) {
      if (ignored.has(entry)) continue;
      const path = join(directory, entry);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) visit(path, depth - 1);
      else if (stat.isFile() && predicate(path)) found.push(path);
    }
  };
  visit(cwd, 7);
  return found.sort();
}
