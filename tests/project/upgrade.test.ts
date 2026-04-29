import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderAxintUpgradeReport,
  runAxintUpgrade,
  type AxintUpgradeCommandResult,
} from "../../src/project/upgrade.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "axint-upgrade-"));
  tempDirs.push(dir);
  return dir;
}

describe("Axint same-thread upgrade", () => {
  it("plans an upgrade without applying it", () => {
    const dir = tempProject();
    const report = runAxintUpgrade({
      cwd: dir,
      currentVersion: "0.4.11",
      latestVersion: "0.4.12",
    });

    expect(report.status).toBe("ready");
    expect(report.updateAvailable).toBe(true);
    expect(report.commands.map((command) => command.display)).toContain(
      "npm install -g @axint/compiler@0.4.12"
    );
    expect(report.commands.map((command) => command.command)).not.toContain("axint");
    expect(report.sameThreadPrompt).toContain("Keep this chat/thread");
    expect(report.sameThreadPrompt).toContain("Reload or reconnect");
  });

  it("applies an upgrade, refreshes optional Xcode wiring, and writes artifacts", () => {
    const dir = tempProject();
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];

    const report = runAxintUpgrade(
      {
        cwd: dir,
        currentVersion: "0.4.11",
        latestVersion: "0.4.12",
        apply: true,
        reinstallXcode: true,
      },
      {
        runCommand(command, args, options): AxintUpgradeCommandResult {
          calls.push({ command, args, cwd: options.cwd });
          return { status: 0, stdout: "ok" };
        },
      }
    );

    expect(report.status).toBe("upgraded");
    expect(calls).toEqual([
      {
        command: "npm",
        args: ["install", "-g", "@axint/compiler@0.4.12"],
        cwd: dir,
      },
      {
        command: "axint",
        args: ["xcode", "install", "--project", dir],
        cwd: dir,
      },
    ]);
    expect(report.artifacts?.json).toBe(join(dir, ".axint", "upgrade", "latest.json"));
    expect(report.artifacts?.markdown).toBe(join(dir, ".axint", "upgrade", "latest.md"));
    expect(existsSync(report.artifacts?.json ?? "")).toBe(true);
    expect(readFileSync(report.artifacts?.markdown ?? "", "utf-8")).toContain(
      "Same-Thread Continuation"
    );
  });

  it("reports current when the requested version is already installed", () => {
    const dir = tempProject();
    const report = runAxintUpgrade({
      cwd: dir,
      currentVersion: "0.4.12",
      latestVersion: "0.4.12",
      apply: true,
    });

    expect(report.status).toBe("current");
    expect(report.commands).toHaveLength(0);
    expect(renderAxintUpgradeReport(report, "prompt")).toContain("already current");
  });
});
