import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compileAnyFile } from "../../src/core/compiler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "../../examples");
const exampleFiles = readdirSync(examplesDir)
  .filter((file) => file.endsWith(".ts"))
  .sort();

const EXPECTED_SURFACES = new Map<
  string,
  | "intent"
  | "view"
  | "widget"
  | "app"
  | "liveActivity"
  | "appEnum"
  | "appShortcut"
  | "extension"
>([
  ["calendar-assistant.ts", "intent"],
  ["health-log.ts", "intent"],
  ["messaging.ts", "intent"],
  ["pizza-delivery.live-activity.ts", "liveActivity"],
  ["pizza-order.app-shortcut.ts", "appShortcut"],
  ["pizza-share.extension.ts", "extension"],
  ["pizza-size.app-enum.ts", "appEnum"],
  ["profile-card.ts", "view"],
  ["smart-home.ts", "intent"],
  ["step-counter.ts", "widget"],
  ["trail-planner.ts", "intent"],
  ["weather-app.ts", "app"],
]);

describe("bundled examples", () => {
  it("compile cleanly across every shipped Apple surface example", () => {
    expect(exampleFiles).toEqual([...EXPECTED_SURFACES.keys()].sort());

    for (const file of exampleFiles) {
      const result = compileAnyFile(join(examplesDir, file));
      const diagnosticSummary = result.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("; ");

      expect(result.success, `${file} failed: ${diagnosticSummary}`).toBe(true);
      expect(result.surface).toBe(EXPECTED_SURFACES.get(file));
      expect(result.output).toBeDefined();
    }
  });

  it("keeps the HealthKit example aligned with the current entitlement + privacy contract", () => {
    const file = join(examplesDir, "health-log.ts");
    const source = readFileSync(file, "utf-8");

    expect(source).toContain("com.apple.developer.healthkit");
    expect(source).toContain("NSHealthShareUsageDescription");
    expect(source).toContain("NSHealthUpdateUsageDescription");
    expect(source).toContain("param.double");

    const result = compileAnyFile(file, {
      emitInfoPlist: true,
      emitEntitlements: true,
    });

    expect(result.success).toBe(true);
    expect(result.surface).toBe("intent");
    expect(result.diagnostics.some((d) => d.code === "AX114")).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX115")).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX116")).toBe(false);

    if (result.surface !== "intent" || !result.output) {
      throw new Error("health-log.ts did not compile as an intent example");
    }

    expect(result.output.infoPlistFragment).toContain("NSHealthShareUsageDescription");
    expect(result.output.infoPlistFragment).toContain("NSHealthUpdateUsageDescription");
    expect(result.output.entitlementsFragment).toContain("com.apple.developer.healthkit");
  });
});
