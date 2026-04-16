import { appendFileSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { compileFile } from "../src/core/compiler.ts";

type CloudDiagnostic = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
};

type CloudCheck = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

function countLines(source: string): number {
  return source.split("\n").filter((line) => line.trim().length > 0).length;
}

function buildChecks(
  success: boolean,
  errors: number,
  warnings: number,
  outputLines: number,
): CloudCheck[] {
  return [
    {
      label: "Compiler run",
      state: success ? "pass" : "fail",
      detail: success
        ? "The canonical Calendar Assistant example compiled successfully."
        : "The canonical Calendar Assistant example failed to compile cleanly.",
    },
    {
      label: "Diagnostics",
      state: errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
      detail:
        errors > 0
          ? `${errors} error(s) and ${warnings} warning(s) were emitted during CI validation.`
          : warnings > 0
            ? `${warnings} warning(s) were emitted during CI validation.`
            : "No diagnostics were emitted for the canonical CI example.",
    },
    {
      label: "Swift output",
      state: outputLines > 0 ? "pass" : "warn",
      detail:
        outputLines > 0
          ? `Generated ${outputLines} non-blank lines of Swift output for the CI baseline.`
          : "No Swift output was generated for the CI baseline.",
    },
  ];
}

function buildNextSteps(errors: number, warnings: number) {
  if (errors > 0) {
    return [
      "Review the compiler diagnostics attached to this CI report.",
      "Fix the failing example or compiler regression before the next release.",
      "Re-run CI and compare the next Cloud report against this failing baseline.",
    ];
  }

  if (warnings > 0) {
    return [
      "Review the warning set attached to this CI report.",
      "Compare the next Cloud report against this run to watch for drift.",
      "Keep this report as the working Apple validation baseline until the warnings are resolved.",
    ];
  }

  return [
    "Use this Cloud report as the current Apple validation baseline for CI.",
    "Compare the next CI run against this report to catch compiler or SDK drift quickly.",
    "Share this report in release reviews when you need a durable Apple-native proof point.",
  ];
}

async function main() {
  const token = process.env.AXINT_CLOUD_REPORT_TOKEN;
  if (!token) {
    console.log("AXINT_CLOUD_REPORT_TOKEN is not set; skipping Cloud report publish.");
    return;
  }

  const cloudUrl =
    process.env.AXINT_CLOUD_REPORT_URL
    ?? "https://registry.axint.ai/api/v1/cloud/reports/ci";
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const examplePath = resolve(process.cwd(), "examples/calendar-assistant.ts");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    version: string;
  };
  const source = readFileSync(examplePath, "utf-8");
  const compileResult = compileFile(examplePath, {
    outDir: "generated/ci",
    validate: true,
  });

  const diagnostics: CloudDiagnostic[] = compileResult.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    file: diagnostic.file,
    line: diagnostic.line,
    suggestion: diagnostic.suggestion,
  }));

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const infos = diagnostics.filter((diagnostic) => diagnostic.severity === "info").length;
  const swiftCode = compileResult.output?.swiftCode ?? "";
  const sourceLines = countLines(source);
  const outputLines = countLines(swiftCode);
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl =
    repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : undefined;

  const payload = {
    report: {
      label: "CI validation · Calendar Assistant",
      status: errors === 0 && warnings === 0 ? "healthy" : "attention",
      compilerVersion: packageJson.version,
      mode: "ci",
      surface: "intent",
      language: "typescript",
      fileName: basename(examplePath),
      sourceLines,
      outputLines,
      outputPath: compileResult.output?.outputPath ?? "generated/ci/CreateCalendarEventIntent.swift",
      swiftCode,
      diagnostics,
      errors,
      warnings,
      infos,
      checks: buildChecks(compileResult.success, errors, warnings, outputLines),
      nextSteps: buildNextSteps(errors, warnings),
    },
    shareState: {
      v: 1,
      mode: "ci",
      source,
      surface: "intent",
      language: "typescript",
      fileName: basename(examplePath),
    },
    github: {
      repository,
      ref: process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      actor: process.env.GITHUB_ACTOR,
      workflow: process.env.GITHUB_WORKFLOW,
      runId,
      runUrl,
      eventName: process.env.GITHUB_EVENT_NAME,
    },
  };

  const response = await fetch(cloudUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud report publish failed (${response.status}): ${body}`);
  }

  const result = (await response.json()) as {
    id: string;
    created_at: string;
    url: string;
  };

  console.log(`Published Axint Cloud report: ${result.url}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## Axint Cloud report",
        "",
        `- Report: ${result.url}`,
        `- Compiler: ${packageJson.version}`,
        `- Diagnostics: ${errors}E / ${warnings}W / ${infos}I`,
        "",
      ].join("\n"),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
