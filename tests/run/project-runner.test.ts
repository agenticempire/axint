import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { renderAxintRunReport, runAxintProject } from "../../src/run/project-runner.js";

function makeFakeXcodeProject() {
  const dir = mkdtempSync(join(tmpdir(), "axint-run-"));
  const schemeDir = join(dir, "Swarm.xcodeproj", "xcshareddata", "xcschemes");
  mkdirSync(schemeDir, { recursive: true });
  writeFileSync(join(schemeDir, "Swarm.xcscheme"), "<Scheme></Scheme>\n");
  writeFileSync(
    join(dir, "ContentView.swift"),
    [
      "import SwiftUI",
      "",
      "struct ContentView: View {",
      "  var body: some View {",
      '    Text("Hello")',
      "  }",
      "}",
      "",
    ].join("\n")
  );
  return dir;
}

describe("runAxintProject", () => {
  it("plans the enforced Axint build loop in dry-run mode", async () => {
    const dir = makeFakeXcodeProject();
    const report = await runAxintProject({
      cwd: dir,
      expectedVersion: "0.0.0-test",
      dryRun: true,
      writeReport: true,
    });

    expect(report.session.token).toMatch(/^axsess_/);
    expect(report.workflow.status).toBe("ready");
    expect(report.swiftValidation.filesChecked).toBe(1);
    expect(report.cloudChecks).toHaveLength(1);
    expect(report.commands.build?.dryRun).toBe(true);
    expect(report.commands.test?.dryRun).toBe(true);
    expect(report.commands.build?.args).toContain("-project");
    expect(report.commands.build?.args).toContain("Swarm");
    expect(report.artifacts.json).toBeDefined();
    expect(report.artifacts.projectContextJson).toBeDefined();
    expect(readFileSync(report.artifacts.projectContextJson!, "utf-8")).toContain(
      '"schema": "https://axint.ai/schemas/project-context-index.v1.json"'
    );
    expect(readFileSync(report.artifacts.json!, "utf-8")).toContain('"status"');
  });

  it("renders a repair prompt for agents", async () => {
    const dir = makeFakeXcodeProject();
    const report = await runAxintProject({
      cwd: dir,
      dryRun: true,
      runtime: true,
      writeReport: false,
    });

    const prompt = renderAxintRunReport(report, "prompt");
    expect(prompt).toContain("You are repairing an Apple-native project");
    expect(prompt).toContain("After repairing, rerun `axint run`");
  });

  it("plans focused Xcode UI tests with only-testing selectors", async () => {
    const dir = makeFakeXcodeProject();
    const report = await runAxintProject({
      cwd: dir,
      dryRun: true,
      writeReport: false,
      onlyTesting: [
        "SwarmUITests/SwarmUITests/testProjectCommandCenterPrimaryActionsRouteToCoreTabs",
        "SwarmUITests/SwarmUITests/testCaptureButtonIsHittable, -only-testing:SwarmUITests/SwarmUITests/testOpenVaultRoutes",
      ],
    });

    expect(report.commands.test?.args).toContain(
      "-only-testing:SwarmUITests/SwarmUITests/testProjectCommandCenterPrimaryActionsRouteToCoreTabs"
    );
    expect(report.commands.test?.args).toContain(
      "-only-testing:SwarmUITests/SwarmUITests/testCaptureButtonIsHittable"
    );
    expect(report.commands.test?.args).toContain(
      "-only-testing:SwarmUITests/SwarmUITests/testOpenVaultRoutes"
    );
  });
});
