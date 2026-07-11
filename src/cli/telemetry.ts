import type { Command } from "commander";
import { syncAutomaticFeedback } from "../feedback/auto.js";
import {
  getAdoptionTelemetryStatus,
  renderAdoptionTelemetryStatus,
  setAdoptionTelemetryOptOut,
  setAdoptionTelemetrySharingLevel,
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
    .description("Enable standard source-free product telemetry")
    .action(() => {
      setAdoptionTelemetrySharingLevel("standard");
      console.log("Axint standard product telemetry is on for this user.");
      console.log("Run `axint telemetry status` to inspect exactly what is sent.");
    });

  telemetry
    .command("standard")
    .description("Share product usage and structured project-interest signals")
    .action(() => {
      setAdoptionTelemetrySharingLevel("standard");
      console.log("Axint standard product telemetry is on.");
      console.log(
        "Source-free repair and proof packets stay local unless separately enabled."
      );
    });

  telemetry
    .command("enhanced")
    .description("Help improve Axint with source-free repair and proof diagnostics")
    .action(async () => {
      setAdoptionTelemetrySharingLevel("enhanced");
      console.log("Axint enhanced diagnostics sharing is on.");
      console.log(
        "This adds source-free issue classes, diagnostic codes, project shape, redacted evidence excerpts, and proof outcomes."
      );
      console.log(
        "Raw source, project names, credentials, and local paths are never sent."
      );
      const sync = await syncAutomaticFeedback({ maxPackets: 10 });
      if (sync.attempted > 0) {
        console.log(`Synced ${sync.sent}/${sync.attempted} queued learning packets.`);
      }
    });
}
