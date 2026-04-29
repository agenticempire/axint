import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCloudCheck } from "../../src/cloud/check.js";
import { writeCloudFeedbackSignal } from "../../src/cloud/feedback-store.js";
import {
  resolveAutoFeedbackPolicy,
  writeAutoFeedbackPolicy,
} from "../../src/feedback/auto.js";
import {
  exportAxintFeedback,
  importAxintFeedback,
  listAxintFeedbackInbox,
  renderFeedbackInboxReport,
} from "../../src/feedback/inbox.js";

describe("Axint feedback inbox", () => {
  it("queues source-free Cloud feedback automatically while preserving opt-out", () => {
    const root = mkdtempSync(join(tmpdir(), "axint-auto-feedback-"));
    try {
      const report = runCloudCheck({
        fileName: "BrokenIntent.swift",
        source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static let title: LocalizedStringResource = "Broken"
}
`,
      });
      expect(report.learningSignal).toBeTruthy();
      const stored = writeCloudFeedbackSignal(report.learningSignal!, { cwd: root });

      expect(stored.autoFeedback?.policy.redaction).toBe("source_not_included");
      expect(stored.autoFeedback?.queued).toBe(true);
      expect(stored.autoFeedback?.queuePath).toBeTruthy();
      expect(existsSync(stored.autoFeedback!.queuePath!)).toBe(true);
      expect(resolveAutoFeedbackPolicy(root).mode).toBe("on");

      writeAutoFeedbackPolicy(root, "off");
      const second = writeCloudFeedbackSignal(report.learningSignal!, { cwd: root });
      expect(second.autoFeedback?.submitted).toBe("disabled");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exports, imports, and clusters source-free feedback from another project", () => {
    const friend = mkdtempSync(join(tmpdir(), "axint-friend-feedback-"));
    const maintainer = mkdtempSync(join(tmpdir(), "axint-maintainer-feedback-"));
    try {
      const report = runCloudCheck({
        fileName: "BrokenIntent.swift",
        source: `
import AppIntents

struct BrokenIntent: AppIntent {
    static let title: LocalizedStringResource = "Broken"
}
`,
      });
      writeCloudFeedbackSignal(report.learningSignal!, { cwd: friend });
      const exported = exportAxintFeedback({
        cwd: friend,
        projectLabel: "Friend Workout App",
      });
      expect(exported.packetCount).toBe(1);

      const imported = importAxintFeedback([exported.outPath], { cwd: maintainer });
      expect(imported.imported).toHaveLength(1);

      const inbox = listAxintFeedbackInbox({ cwd: maintainer });
      expect(inbox.items[0]?.projectLabel).toBe("Friend Workout App");
      expect(inbox.clusters[0]?.diagnostics).toContain("AX704");
      expect(renderFeedbackInboxReport(inbox, "markdown")).toContain("Next Axint Fixes");
      expect(
        readdirSync(join(maintainer, ".axint/feedback/inbox")).length
      ).toBeGreaterThan(0);
    } finally {
      rmSync(friend, { recursive: true, force: true });
      rmSync(maintainer, { recursive: true, force: true });
    }
  });
});
