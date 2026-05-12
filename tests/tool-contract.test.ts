import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCloudCheck } from "../src/cloud/check.js";
import { renderAxintRunReport, runAxintProject } from "../src/run/project-runner.js";
import { runWorkflowCheck } from "../src/mcp/workflow-check.js";
import { renderAxintRepairReport, runAxintRepair } from "../src/repair/project-repair.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function tempProject(): string {
  const dir = join(
    tmpdir(),
    `axint-tool-contract-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function writeMinimalXcodeProject(dir: string, scheme = "Demo"): void {
  mkdirSync(join(dir, "Demo.xcodeproj", "xcshareddata", "xcschemes"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, "Demo.xcodeproj", "xcshareddata", "xcschemes", `${scheme}.xcscheme`),
    "<Scheme></Scheme>\n"
  );
}

describe("Axint tool contract", () => {
  it("adds an agent-first contract to Cloud Check reports", () => {
    const report = runCloudCheck({
      source: [
        "import SwiftUI",
        "struct LoginView: View {",
        "    var body: some View {",
        '        Text("Login")',
        "    }",
        "}",
      ].join("\n"),
      fileName: "LoginView.swift",
      language: "swift",
      platform: "iOS",
    });

    expect(report.toolContract?.schema).toBe(
      "https://axint.ai/schemas/tool-contract.v2.json"
    );
    expect(report.toolContract?.tool).toBe("axint.cloud.check");
    expect(report.toolContract?.verdict).toBe(report.gate.decision);
    expect(report.toolContract?.evidence.missing.join("\n")).toMatch(/runtime/i);
  });

  it("adds a contract to workflow checks so the next action is machine-readable", () => {
    const report = runWorkflowCheck({
      cwd: tempProject(),
      requireSession: false,
      stage: "planning",
      readRehydrationContext: true,
      ranStatus: true,
    });

    expect(report.status).toBe("needs_action");
    expect(report.toolContract?.tool).toBe("axint.workflow.check");
    expect(report.toolContract?.verdict).toBe("needs_action");
    expect(report.toolContract?.safeCommand).toBe("axint suggest <app-description>");
    expect(report.toolContract?.diagnostics[0]?.code).toBe("AXWORKFLOW-REQUIRED");
  });

  it("adds a contract to repair reports with a concrete safe command", () => {
    const dir = tempProject();
    writeFileSync(
      join(dir, "Composer.swift"),
      [
        "import SwiftUI",
        "struct Composer: View {",
        '    @State private var draft = ""',
        "    var body: some View {",
        "        TextEditor(text: $draft)",
        '            .overlay { Text("Write") }',
        "    }",
        "}",
      ].join("\n")
    );

    const report = runAxintRepair({
      cwd: dir,
      issue: "The composer is visible but cannot be tapped or typed into.",
      sourcePath: "Composer.swift",
      platform: "iOS",
      writeReport: false,
      writeFeedback: false,
    });

    expect(report.toolContract?.tool).toBe("axint.repair");
    expect(report.toolContract?.verdict).toBe("fix_required");
    expect(report.toolContract?.safeCommand).toContain("axint run");
    expect(renderAxintRepairReport(report)).toContain("## Tool Contract");
  });

  it("adds a contract to axint.run dry-run proof reports", async () => {
    const dir = tempProject();
    writeMinimalXcodeProject(dir);
    writeFileSync(
      join(dir, "ContentView.swift"),
      [
        "import SwiftUI",
        "struct ContentView: View {",
        "    var body: some View {",
        '        Text("Hello")',
        "    }",
        "}",
      ].join("\n")
    );

    const report = await runAxintProject({
      cwd: dir,
      projectName: "Demo",
      platform: "iOS",
      scheme: "Demo",
      dryRun: true,
      modifiedFiles: ["ContentView.swift"],
      writeReport: false,
    });

    expect(report.toolContract?.tool).toBe("axint.run");
    expect(report.toolContract?.verdict).toBe(report.gate.decision);
    expect(report.toolContract?.artifactPaths).toContain(
      join(dir, ".axint/context/latest.json")
    );
    expect(renderAxintRunReport(report)).toContain("## Tool Contract");
  });
});
