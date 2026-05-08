import { compileFromIR } from "../core/compiler.js";
import type { Diagnostic, IRIntent } from "../core/types.js";

export type ActivationSmokeFormat = "markdown" | "json";

export type ActivationSmokeReport = {
  status: "ok" | "fail";
  signal: "axint_activated";
  intentName: string;
  swiftFile: string | null;
  swiftLines: number;
  diagnostics: Array<Pick<Diagnostic, "code" | "severity" | "message">>;
  next: string[];
};

const ACTIVATION_IR: IRIntent = {
  name: "AxintActivationProbe",
  title: "Axint Activation Probe",
  description:
    "Confirms Axint can compile a built-in App Intent without reading project source.",
  parameters: [],
  returnType: { kind: "primitive", value: "string" },
  sourceFile: "<axint:activation>",
};

export function runActivationSmokeTest(): ActivationSmokeReport {
  const result = compileFromIR(ACTIVATION_IR, {
    validate: true,
  });

  const diagnostics = result.diagnostics.map(({ code, severity, message }) => ({
    code,
    severity,
    message,
  }));

  return {
    status: result.success ? "ok" : "fail",
    signal: "axint_activated",
    intentName: ACTIVATION_IR.name,
    swiftFile: result.output?.outputPath ?? null,
    swiftLines: countNonBlankLines(result.output?.swiftCode ?? ""),
    diagnostics,
    next: result.success
      ? [
          "Use axint.compile, axint.cloud.check, or axint.run on the project work.",
          "Leave the activation result in the current agent thread before editing code.",
        ]
      : [
          "Run axint doctor to inspect the local Axint install.",
          "Retry after updating with axint upgrade --apply.",
        ],
  };
}

export function renderActivationSmokeReport(
  report: ActivationSmokeReport,
  format: ActivationSmokeFormat = "markdown"
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines = [
    "# Axint Activation",
    "",
    `Status: ${report.status}`,
    `Signal: ${report.signal}`,
    `Compiler probe: ${report.intentName}`,
    `Swift output: ${report.swiftFile ?? "not emitted"}`,
    `Generated Swift lines: ${report.swiftLines}`,
  ];

  if (report.diagnostics.length > 0) {
    lines.push("", "## Diagnostics");
    for (const diagnostic of report.diagnostics) {
      lines.push(`- ${diagnostic.severity}[${diagnostic.code}]: ${diagnostic.message}`);
    }
  }

  lines.push("", "## Next");
  for (const item of report.next) lines.push(`- ${item}`);

  return lines.join("\n");
}

function countNonBlankLines(source: string): number {
  let count = 0;
  for (const line of source.split("\n")) {
    if (line.trim()) count += 1;
  }
  return count;
}
