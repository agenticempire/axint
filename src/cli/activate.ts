import type { Command } from "commander";
import {
  renderActivationSmokeReport,
  runActivationSmokeTest,
  type ActivationSmokeFormat,
} from "../activation/smoke-test.js";

export function registerActivate(program: Command): void {
  program
    .command("activate")
    .description(
      "Run a source-free compiler smoke test so an install proves first real Axint use"
    )
    .option("--format <format>", "Output format: markdown or json", "markdown")
    .action((options: { format?: string }) => {
      const format = parseActivationFormat(options.format);
      const report = runActivationSmokeTest();
      console.log(renderActivationSmokeReport(report, format));
      if (report.status !== "ok") process.exitCode = 1;
    });
}

function parseActivationFormat(value: string | undefined): ActivationSmokeFormat {
  return value === "json" ? "json" : "markdown";
}
