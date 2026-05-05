import type { Command } from "commander";
import {
  getAdoptionTelemetryStatus,
  renderAdoptionTelemetryStatus,
  setAdoptionTelemetryOptOut,
  type AdoptionTelemetryFormat,
} from "../telemetry/adoption.js";

const FORMATS = ["markdown", "json"] as const;

function parseFormat(value: string): AdoptionTelemetryFormat {
  const normalized = value.trim().toLowerCase();
  if ((FORMATS as readonly string[]).includes(normalized)) {
    return normalized as AdoptionTelemetryFormat;
  }
  throw new Error(`invalid telemetry format: ${value}`);
}

export function registerTelemetry(program: Command): void {
  const telemetry = program
    .command("telemetry")
    .description("Manage source-free Axint adoption telemetry and privacy controls");

  telemetry
    .command("status")
    .description("Show what Axint adoption telemetry sends and never sends")
    .option(
      "--format <format>",
      "Output format: markdown or json",
      parseFormat,
      "markdown"
    )
    .action((options: { format: AdoptionTelemetryFormat }) => {
      console.log(
        renderAdoptionTelemetryStatus(getAdoptionTelemetryStatus(), options.format)
      );
    });

  telemetry
    .command("opt-out")
    .description("Turn off source-free Axint adoption telemetry for this user")
    .action(() => {
      setAdoptionTelemetryOptOut(true);
      console.log("Axint adoption telemetry is off for this user.");
      console.log(
        "Source code, prompts, file paths, and arguments were never collected."
      );
    });

  telemetry
    .command("opt-in")
    .description("Turn source-free Axint adoption telemetry back on for this user")
    .action(() => {
      setAdoptionTelemetryOptOut(false);
      console.log("Axint adoption telemetry is on for this user.");
      console.log("Run `axint telemetry status` to inspect exactly what is sent.");
    });
}
