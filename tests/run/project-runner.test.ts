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
      agent: "codex",
      dryRun: true,
      writeReport: true,
    });

    expect(report.session.token).toMatch(/^axsess_/);
    expect(report.agent.agent).toBe("codex");
    expect(report.agentAdvice?.status).toBe("needs_setup");
    expect(report.repairPrompt).toContain("Host/tool lane: Codex");
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
      agent: "cursor",
      dryRun: true,
      runtime: true,
      writeReport: false,
    });

    const prompt = renderAxintRunReport(report, "prompt");
    expect(prompt).toContain("You are repairing an Apple-native project");
    expect(prompt).toContain("Host/tool lane: Cursor");
    expect(prompt).toContain("Agent brain:");
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

  it("extracts failing Xcode test details into the run report and Cloud Check", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        'original="$*"',
        'bundle=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "-resultBundlePath" ]; then',
        "    shift",
        '    bundle="$1"',
        "  fi",
        "  shift",
        "done",
        '[ -n "$bundle" ] && mkdir -p "$bundle"',
        'if echo " $original " | grep -q " test "; then',
        "  echo \"Test Suite 'SwarmUITests' started.\"",
        "  echo \"Test Case '-[SwarmUITests testBuilderProfileOpensWithStableActionControls]' started.\"",
        '  echo "$PWD/SwarmUITests/SwarmUITests.swift:793: error: -[SwarmUITests testBuilderProfileOpensWithStableActionControls] : XCTAssertTrue failed - builder-profile-scroll should exist"',
        "  echo \"Test Case '-[SwarmUITests testBuilderProfileOpensWithStableActionControls]' failed (3.31 seconds).\"",
        '  echo "** TEST FAILED **"',
        '  echo "Executed 1 test, with 1 failure"',
        "  exit 65",
        "else",
        '  echo "** BUILD SUCCEEDED **"',
        "  exit 0",
        "fi",
        "",
      ].join("\n")
    );
    chmodSync(xcodebuild, 0o755);
    const xcrun = join(binDir, "xcrun");
    writeFileSync(
      xcrun,
      [
        "#!/bin/sh",
        "cat <<JSON",
        '{"testFailureSummaries":[{"message":{"_value":"XCTAssertTrue failed - builder-profile-scroll should exist"},"documentLocationInCreatingWorkspace":{"url":{"_value":"file://$PWD/SwarmUITests/SwarmUITests.swift#StartingLineNumber=793&EndingLineNumber=793"}},"testName":{"_value":"testBuilderProfileOpensWithStableActionControls"},"suiteName":{"_value":"SwarmUITests"}}]}',
        "JSON",
        "",
      ].join("\n")
    );
    chmodSync(xcrun, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const report = await runAxintProject({
        cwd: dir,
        writeReport: false,
        onlyTesting: [
          "SwarmUITests/SwarmUITests/testBuilderProfileOpensWithStableActionControls",
        ],
        expectedBehavior: "Builder profile action controls should exist and be hittable.",
        actualBehavior: "Axint should extract the exact failing XCTest assertion.",
      });
      const rendered = renderAxintRunReport(report);
      const cloudCodes = report.cloudChecks.flatMap((check) =>
        check.diagnostics.map((diagnostic) => diagnostic.code)
      );

      expect(report.status).toBe("fail");
      expect(report.xcodeTestFailures).toHaveLength(1);
      expect(report.xcodeTestFailures[0]).toMatchObject({
        testName: "testBuilderProfileOpensWithStableActionControls",
        line: 793,
        identifier: "builder-profile-scroll",
        likelyArea: "Builder or creator profile interaction surface",
        likelyCause:
          "The UI element is missing from the accessibility tree or has a stale identifier/query.",
        repairHint:
          "Verify the accessibilityIdentifier, conditional rendering path, navigation state, and test launch setup.",
        source: "xcresult",
      });
      expect(report.xcodeTestFailures[0]?.file).toMatch(
        /SwarmUITests\/SwarmUITests\.swift$/
      );
      expect(report.xcodeTestFailures[0]?.message).toContain(
        "builder-profile-scroll should exist"
      );
      expect(report.nextSteps.join("\n")).toContain(
        "testBuilderProfileOpensWithStableActionControls"
      );
      expect(report.repairPrompt).toContain("Xcode test failures");
      expect(report.repairPrompt).toContain("builder-profile-scroll should exist");
      expect(report.repairPrompt).toContain("Verify the accessibilityIdentifier");
      expect(rendered).toContain("## Xcode Test Failures");
      expect(rendered).toContain("SwarmUITests.swift:793");
      expect(rendered).toContain("builder-profile-scroll should exist");
      expect(cloudCodes).toContain("AXCLOUD-XCTEST-FAILURE");
      expect(cloudCodes).toContain("AXCLOUD-UI-TEST-ELEMENT");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("classifies not-hittable UI failures as interaction-blocking repairs", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        'if echo " $* " | grep -q " test "; then',
        "  echo \"Test Suite 'ComposerBlockerUITests' started.\"",
        "  echo \"Test Case '-[ComposerBlockerUITests testComposerTextFieldAcceptsInput]' started.\"",
        '  echo "$PWD/ComposerBlockerUITests.swift:9: error: -[ComposerBlockerUITests testComposerTextFieldAcceptsInput] : XCTAssertTrue failed - composer-input should be hittable"',
        "  echo \"Test Case '-[ComposerBlockerUITests testComposerTextFieldAcceptsInput]' failed (2.41 seconds).\"",
        '  echo "** TEST FAILED **"',
        "  exit 65",
        "else",
        '  echo "** BUILD SUCCEEDED **"',
        "  exit 0",
        "fi",
        "",
      ].join("\n")
    );
    chmodSync(xcodebuild, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const report = await runAxintProject({
        cwd: dir,
        agent: "codex",
        writeReport: false,
        onlyTesting: [
          "ComposerBlockerUITests/ComposerBlockerUITests/testComposerTextFieldAcceptsInput",
        ],
      });

      expect(report.xcodeTestFailures[0]).toMatchObject({
        testName: "testComposerTextFieldAcceptsInput",
        identifier: "composer-input",
        likelyCause:
          "The control exists, but another layer, disabled state, hit-testing override, transition, or offscreen layout is preventing interaction.",
      });
      expect(report.xcodeTestFailures[0]?.repairHint).toContain(
        "ZStack/overlay/contentShape"
      );
      expect(report.repairPrompt).toContain("ZStack/overlay/contentShape");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("classifies UI automation startup failures as runner infrastructure", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        'if echo " $* " | grep -q " test "; then',
        '  echo "The test runner failed to initialize for UI testing."',
        '  echo "Timed out while enabling automation mode."',
        '  echo "** TEST FAILED **"',
        "  exit 65",
        "else",
        '  echo "** BUILD SUCCEEDED **"',
        "  exit 0",
        "fi",
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
        onlyTesting: ["SwarmUITests/SwarmUITests/testOnboardingControls"],
      });
      const rendered = renderAxintRunReport(report);
      const cloudCodes = report.cloudChecks.flatMap((check) =>
        check.diagnostics.map((diagnostic) => diagnostic.code)
      );

      expect(report.runnerHealth).toContainEqual(
        expect.objectContaining({ kind: "ui-automation-infrastructure" })
      );
      expect(report.nextSteps.join("\n")).toContain("Xcode UI automation did not start");
      expect(rendered).toContain("## Xcode Runner Health");
      expect(rendered).toContain("ui-automation-infrastructure");
      expect(cloudCodes).toContain("AXCLOUD-XCTEST-AUTOMATION-INFRASTRUCTURE");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("does not tell agents to add a focused test when only-testing timed out before assertions", async () => {
    const dir = makeFakeXcodeProject();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const xcodebuild = join(binDir, "xcodebuild");
    writeFileSync(
      xcodebuild,
      [
        "#!/bin/sh",
        'if echo " $* " | grep -q " test "; then',
        "  sleep 2",
        "  exit 1",
        "else",
        '  echo "** BUILD SUCCEEDED **"',
        "  exit 0",
        "fi",
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
        timeoutSeconds: 1,
        onlyTesting: ["SwarmTests/P3FrontendArchitectureTests"],
      });
      const nextSteps = report.nextSteps.join("\n");
      const prompt = report.repairPrompt;

      expect(report.runnerHealth).toContainEqual(
        expect.objectContaining({ kind: "hosted-test-runner-timeout" })
      );
      expect(nextSteps).toContain("Focused selector compiled");
      expect(nextSteps).not.toContain("Add or update a focused unit/UI test");
      expect(prompt).toContain("hosted-test-runner-timeout");
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
