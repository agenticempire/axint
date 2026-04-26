import type { Command } from "commander";
import {
  renderMachineDoctorReport,
  runMachineDoctor,
  type DoctorFormat,
} from "../mcp/doctor.js";

export function registerDoctor(program: Command, version: string) {
  program
    .command("doctor")
    .description(
      "Audit Axint version truth, MCP project wiring, Node paths, and agent setup"
    )
    .option("--dir <dir>", "Project directory to inspect", ".")
    .option("--expect <version>", "Expected Axint version")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown"
    )
    .action((options: { dir: string; expect?: string; format: DoctorFormat }) => {
      const report = runMachineDoctor({
        cwd: options.dir,
        expectedVersion: options.expect,
        runningVersion: version,
      });
      console.log(renderMachineDoctorReport(report, options.format));
      if (report.status === "fail") process.exit(1);
    });
}

function parseFormat(value: string): DoctorFormat {
  if (value === "markdown" || value === "json") return value;
  throw new Error(`invalid format: ${value}`);
}
