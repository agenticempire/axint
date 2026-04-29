import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAxintAgentAdvice,
  claimAxintAgentFiles,
  installAxintLocalAgent,
  releaseAxintAgentClaims,
  renderAxintAgentAdviceReport,
} from "../../src/project/local-agent.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function tempProject(): string {
  const dir = join(tmpdir(), `axint-local-agent-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function writeSwiftFixture(dir: string): void {
  mkdirSync(join(dir, "Demo.xcodeproj", "xcshareddata", "xcschemes"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, "Demo.xcodeproj", "xcshareddata", "xcschemes", "Demo.xcscheme"),
    "<Scheme></Scheme>\n"
  );
  writeFileSync(
    join(dir, "HomeFeedView.swift"),
    [
      "import SwiftUI",
      "",
      "struct HomeFeedView: View {",
      '    @State private var draft = ""',
      "    var body: some View {",
      "        ScrollView {",
      "            TextEditor(text: $draft)",
      '                .accessibilityIdentifier("home-composer")',
      '                .overlay { Text("Write a comment") }',
      "        }",
      "    }",
      "}",
      "",
    ].join("\n")
  );
}

describe("local Axint agent brain", () => {
  it("installs a project-scoped multi-agent brain with privacy-first defaults", () => {
    const dir = tempProject();
    writeSwiftFixture(dir);

    const report = installAxintLocalAgent({
      cwd: dir,
      projectName: "Demo",
      agent: "codex",
    });

    expect(report.status).toBe("installed");
    expect(report.config.privacy.mode).toBe("local_only");
    expect(report.config.privacy.sourceSharing).toBe("never_by_default");
    expect(report.config.provider.mode).toBe("none");
    expect(report.config.permissions.deny).toContain("read_secrets");
    expect(report.config.permissions.deny).toContain("destructive_git");
    expect(report.config.lanes.codex.editingMode).toBe("patch-first");
    expect(report.config.lanes.xcode.editingMode).toBe("xcode-guarded");
    expect(existsSync(join(dir, ".axint/agent.json"))).toBe(true);
    expect(existsSync(join(dir, ".axint/context/latest.json"))).toBe(true);
    expect(existsSync(join(dir, ".axint/coordination/claims.json"))).toBe(true);
    expect(existsSync(join(dir, ".axint/coordination/ledger.json"))).toBe(true);
    expect(readFileSync(join(dir, ".axint/context/latest.md"), "utf-8")).toContain(
      "HomeFeedView.swift"
    );
  });

  it("returns host-specific next moves from context, repair, and failed proof", () => {
    const dir = tempProject();
    writeSwiftFixture(dir);
    installAxintLocalAgent({ cwd: dir, projectName: "Demo", agent: "codex" });
    mkdirSync(join(dir, ".axint/run"), { recursive: true });
    writeFileSync(
      join(dir, ".axint/run/latest.json"),
      JSON.stringify(
        {
          id: "axrun_failed",
          status: "fail",
          gate: { decision: "fix_required" },
          steps: [
            {
              name: "Xcode test",
              status: "fail",
              detail: "HomeFeedUITests/testComposerFocus failed.",
            },
          ],
          nextSteps: ["Repair composer focus, then rerun focused UI test."],
        },
        null,
        2
      )
    );

    const report = buildAxintAgentAdvice({
      cwd: dir,
      issue: "The Home composer is visible but cannot be typed into.",
      agent: "codex",
      changedFiles: ["HomeFeedView.swift"],
    });

    expect(report.status).toBe("ready");
    expect(report.profile.agent).toBe("codex");
    expect(report.latestProof?.status).toBe("fail");
    expect(report.warnings.join("\n")).toContain("Freshest Axint run failed");
    expect(report.moves.map((move) => move.title)).toContain(
      "Claim changed files before patching"
    );
    expect(report.moves.map((move) => move.title)).toContain(
      "Repair the failed proof first"
    );
    expect(report.moves.map((move) => move.title)).toContain("Use the correct host lane");
    expect(renderAxintAgentAdviceReport(report, "prompt")).toContain(
      "Axint agent advice for Codex"
    );
  });

  it("blocks conflicting file claims across agent lanes", () => {
    const dir = tempProject();
    writeSwiftFixture(dir);
    installAxintLocalAgent({ cwd: dir, projectName: "Demo", agent: "claude" });

    const claim = claimAxintAgentFiles({
      cwd: dir,
      agent: "claude",
      task: "Repair composer focus",
      files: ["HomeFeedView.swift"],
      ttlMinutes: 30,
    });
    expect(claim.status).toBe("claimed");

    const blockedClaim = claimAxintAgentFiles({
      cwd: dir,
      agent: "codex",
      task: "Refactor home feed",
      files: ["HomeFeedView.swift"],
    });
    expect(blockedClaim.status).toBe("blocked");
    expect(blockedClaim.conflicts[0]?.agent).toBe("claude");

    const advice = buildAxintAgentAdvice({
      cwd: dir,
      agent: "codex",
      changedFiles: ["HomeFeedView.swift"],
    });
    expect(advice.status).toBe("blocked");
    expect(advice.warnings.join("\n")).toContain("claude already claimed");

    const release = releaseAxintAgentClaims({
      cwd: dir,
      agent: "claude",
      files: ["HomeFeedView.swift"],
    });
    expect(release.status).toBe("released");

    const afterRelease = buildAxintAgentAdvice({
      cwd: dir,
      agent: "codex",
      changedFiles: ["HomeFeedView.swift"],
    });
    expect(afterRelease.status).toBe("ready");
  });
});
