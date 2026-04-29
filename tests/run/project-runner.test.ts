import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { renderAxintRunReport, runAxintProject } from "../../src/run/project-runner.js";
import { cancelRunJob, getRunJobStatus } from "../../src/run/job-store.js";

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
    expect(report.job.id).toBe(report.id);
    expect(report.job.statusCommand).toContain("axint run status");
    expect(report.job.cancelCommand).toContain("axint run cancel");
    expect(report.artifacts.json).toBeDefined();
    expect(report.artifacts.projectContextJson).toBeDefined();
    expect(readFileSync(report.artifacts.projectContextJson!, "utf-8")).toContain(
      '"schema": "https://axint.ai/schemas/project-context-index.v1.json"'
    );
    expect(readFileSync(report.artifacts.json!, "utf-8")).toContain('"status"');

    const status = getRunJobStatus({ cwd: dir, id: report.id });
    expect(status.status).toBe(report.status);
    expect(status.activePids).toEqual([]);
    expect(status.job?.commands.map((command) => command.label)).toEqual([
      "Xcode build",
      "Xcode test",
    ]);
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

  it("does not claim suggest was used and advances past axint.run after passing build proof", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      ["#!/bin/sh", "echo axint fake xcodebuild", "exit 0", ""].join("\n")
    );
    chmodSync(xcodebuild, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const report = await runAxintProject({
        cwd: dir,
        writeReport: false,
      });
      const rendered = renderAxintRunReport(report);

      expect(report.commands.build?.exitCode).toBe(0);
      expect(report.commands.test?.exitCode).toBe(0);
      expect(report.commands.build?.logPath).toContain(".axint/run/logs");
      expect(report.commands.test?.logPath).toContain(".axint/run/logs");
      expect(report.commands.test?.resultBundlePath).toContain(".axint/run/results");
      expect(report.commands.test?.args).toContain("-resultBundlePath");
      expect(report.workflow.checked.join("\n")).not.toContain("axint.suggest");
      expect(report.workflow.nextTool).toBe("axint.workflow.check(stage=pre-commit)");
      expect(rendered).not.toContain("- axint.run\n");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("renders compact status-aware JSON by default with source as opt-in", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        "echo axint fake xcodebuild with enough output for compact json",
        "echo '** TEST SUCCEEDED **'",
        "exit 0",
        "",
      ].join("\n")
    );
    chmodSync(xcodebuild, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const report = await runAxintProject({
        cwd: dir,
        writeReport: false,
      });

      const compact = JSON.parse(renderAxintRunReport(report, "json")) as {
        cloudChecks: Array<{ swiftCode?: string; sourceRedaction?: unknown }>;
        commands: { build?: { stdout?: string; stdoutTail?: string } };
        outputRedaction?: { mode: string; includeSourceFlag: string };
        repairPrompt: string;
      };
      expect(compact.cloudChecks[0]?.swiftCode).toBeUndefined();
      expect(compact.cloudChecks[0]?.sourceRedaction).toBeDefined();
      expect(compact.commands.build?.stdout).toBeUndefined();
      expect(compact.commands.build?.stdoutTail).toContain("fake xcodebuild");
      expect(compact.outputRedaction?.mode).toBe("compact");
      expect(compact.outputRedaction?.includeSourceFlag).toBe("--include-source");

      const full = JSON.parse(
        renderAxintRunReport(report, "json", { includeSource: true })
      ) as {
        cloudChecks: Array<{ swiftCode?: string }>;
        commands: { build?: { stdout?: string } };
      };
      expect(full.cloudChecks[0]?.swiftCode).toContain("struct ContentView");
      expect(full.commands.build?.stdout).toContain("fake xcodebuild");

      if (report.status === "pass") {
        const prompt = renderAxintRunReport(report, "prompt");
        expect(prompt).toContain("Axint Run passed");
        expect(prompt).toContain("Continue with the next proof");
        expect(prompt).not.toContain("Do not continue ordinary coding");
      }
    } finally {
      process.env.PATH = previousPath;
    }
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
    expect(report.commands.test?.args).toContain("-resultBundlePath");
    expect(report.commands.test?.resultBundlePath).toContain(".axint/run/results");
  });

  it("feeds passing focused UI proof into every post-test Cloud Check", async () => {
    const dir = makeFakeXcodeProject();
    mkdirSync(join(dir, "Swarm", "Views"), { recursive: true });
    mkdirSync(join(dir, "Swarm", "Models"), { recursive: true });
    mkdirSync(join(dir, "Swarm", "Stores"), { recursive: true });
    mkdirSync(join(dir, "SwarmUITests"), { recursive: true });
    writeFileSync(
      join(dir, "Swarm", "Views", "DiscoverView.swift"),
      [
        "import SwiftUI",
        "",
        "struct DiscoverView: View {",
        "  var body: some View {",
        '    ScrollView { Text("Discover") }',
        "  }",
        "}",
        "",
      ].join("\n")
    );
    writeFileSync(
      join(dir, "Swarm", "Models", "SocialModels.swift"),
      "import Foundation\nstruct DiscoverCard: Identifiable { let id = UUID(); var title: String }\n"
    );
    writeFileSync(
      join(dir, "Swarm", "Stores", "DiscoveryStore.swift"),
      'import Foundation\nfinal class DiscoveryStore { var selectedIntent = "All" }\n'
    );
    writeFileSync(
      join(dir, "SwarmUITests", "SwarmUITests.swift"),
      "import XCTest\nfinal class SwarmUITests: XCTestCase {}\n"
    );

    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        'if echo " $* " | grep -q " test "; then',
        "  echo \"Test Suite 'SwarmUITests' started.\"",
        "  echo \"Test Case '-[SwarmUITests testDiscoverPrimaryTabsStartAtTopAfterScrolling]' passed (1.01 seconds).\"",
        "  echo \"Test Case '-[SwarmUITests testDiscoverIntentFiltersRouteAndUpdatePrioritySummary]' passed (1.12 seconds).\"",
        "  echo \"Test Case '-[SwarmUITests testDiscoverPrimaryCardsAndAgentActionsAreClickable]' passed (0.98 seconds).\"",
        '  echo "** TEST SUCCEEDED **"',
        '  echo "Executed 3 tests, with 0 failures"',
        "else",
        '  echo "** BUILD SUCCEEDED **"',
        "fi",
        "exit 0",
        "",
      ].join("\n")
    );
    chmodSync(xcodebuild, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const report = await runAxintProject({
        cwd: dir,
        writeReport: false,
        modifiedFiles: [
          "Swarm/Views/DiscoverView.swift",
          "Swarm/Models/SocialModels.swift",
          "Swarm/Stores/DiscoveryStore.swift",
          "SwarmUITests/SwarmUITests.swift",
        ],
        onlyTesting: [
          "SwarmUITests/SwarmUITests/testDiscoverPrimaryTabsStartAtTopAfterScrolling",
          "SwarmUITests/SwarmUITests/testDiscoverIntentFiltersRouteAndUpdatePrioritySummary",
          "SwarmUITests/SwarmUITests/testDiscoverPrimaryCardsAndAgentActionsAreClickable",
        ],
        expectedBehavior:
          "Discover tabs reset to the top hero, intent chips route to the expected sections, project cards open details, and agent primary actions remain clickable.",
        actualBehavior:
          "Focused UITest transcript attached for the current branch repair proof.",
      });

      expect(report.commands.test?.exitCode).toBe(0);
      expect(report.cloudChecks).toHaveLength(4);
      for (const check of report.cloudChecks) {
        const codes = check.diagnostics.map((diagnostic) => diagnostic.code);
        expect(codes).not.toContain("AXCLOUD-BEHAVIOR-MISMATCH");
        const evidenceSummary = check.evidence.summary.join("\n");
        expect(evidenceSummary).toContain("Focused Xcode test proof passed");
        expect(evidenceSummary).toContain(
          "testDiscoverIntentFiltersRouteAndUpdatePrioritySummary"
        );
        expect(evidenceSummary).toContain("TEST SUCCEEDED");
      }
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("reports nothing to cancel when the latest run has already finished", async () => {
    const dir = makeFakeXcodeProject();
    const report = await runAxintProject({
      cwd: dir,
      dryRun: true,
      writeReport: false,
    });

    const result = cancelRunJob({ cwd: dir, id: report.id });

    expect(result.status).toBe("nothing_to_cancel");
    expect(result.killedPids).toEqual([]);
    expect(result.message).toContain("no active child process");
  });
});
