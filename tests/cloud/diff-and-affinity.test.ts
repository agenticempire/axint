import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseUnifiedDiff,
  filterDiagnosticsToDiff,
} from "../../src/cloud/diff-filter.js";
import {
  findSnapshotAffinity,
  renderSnapshotAffinityHint,
} from "../../src/cloud/snapshot-affinity.js";
import {
  runWorkflowCheck,
  renderWorkflowCheckReport,
} from "../../src/mcp/workflow-check.js";

// ─── --diff-only ──────────────────────────────────────────────────────

describe("parseUnifiedDiff + filterDiagnosticsToDiff", () => {
  it("filters diagnostics down to changed lines only", () => {
    const cwd = mkdtempSync(join(tmpdir(), "axint-diff-"));
    try {
      const filePath = join(cwd, "BriefView.swift");
      writeFileSync(filePath, "// placeholder\n");

      const diff = `diff --git a/BriefView.swift b/BriefView.swift
index 0000001..0000002 100644
--- a/BriefView.swift
+++ b/BriefView.swift
@@ -10,0 +11,3 @@
+        Text(item.title)
+        Text(item.headline)
+        Spacer()
@@ -42,1 +45,1 @@
-        Text("old")
+        Text("new")
`;
      const changed = parseUnifiedDiff(diff, cwd);
      expect(changed.files.size).toBe(1);
      const lines = changed.byFile.get(filePath)!;
      expect(lines.has(11)).toBe(true);
      expect(lines.has(12)).toBe(true);
      expect(lines.has(13)).toBe(true);
      expect(lines.has(45)).toBe(true);
      expect(lines.has(20)).toBe(false);

      const { kept, suppressed } = filterDiagnosticsToDiff(
        [
          {
            code: "AX841",
            severity: "error",
            message: "ambient warning on untouched line",
            file: filePath,
            line: 20,
          },
          {
            code: "AX841",
            severity: "error",
            message: "real warning on touched line",
            file: filePath,
            line: 12,
          },
        ],
        changed
      );
      expect(suppressed).toBe(1);
      expect(kept.length).toBe(1);
      expect(kept[0]!.line).toBe(12);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps file-scoped diagnostics with no line number", () => {
    const cwd = mkdtempSync(join(tmpdir(), "axint-diff-"));
    try {
      const filePath = join(cwd, "Foo.swift");
      const diff = `diff --git a/Foo.swift b/Foo.swift
--- a/Foo.swift
+++ b/Foo.swift
@@ -1,0 +1,1 @@
+import Foundation
`;
      const changed = parseUnifiedDiff(diff, cwd);
      const { kept, suppressed } = filterDiagnosticsToDiff(
        [
          {
            code: "AXCLOUD-NON-APPLE-ARTIFACT",
            severity: "info",
            message: "file-scoped",
            file: filePath,
          },
        ],
        changed
      );
      expect(suppressed).toBe(0);
      expect(kept.length).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("suppresses diagnostics for files completely absent from the diff", () => {
    const cwd = mkdtempSync(join(tmpdir(), "axint-diff-"));
    try {
      const touched = join(cwd, "Touched.swift");
      const untouched = join(cwd, "Untouched.swift");
      const diff = `diff --git a/Touched.swift b/Touched.swift
--- a/Touched.swift
+++ b/Touched.swift
@@ -0,0 +1,1 @@
+import Foundation
`;
      const changed = parseUnifiedDiff(diff, cwd);
      const { kept, suppressed } = filterDiagnosticsToDiff(
        [
          {
            code: "AX841",
            severity: "error",
            message: "ambient",
            file: untouched,
            line: 1,
          },
          {
            code: "AX841",
            severity: "error",
            message: "real",
            file: touched,
            line: 1,
          },
        ],
        changed
      );
      expect(suppressed).toBe(1);
      expect(kept.length).toBe(1);
      expect(kept[0]!.file).toBe(touched);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// ─── snapshot affinity ────────────────────────────────────────────────

describe("findSnapshotAffinity", () => {
  it("finds matching baselines under SwarmSnapshotTests/__Snapshots__", () => {
    const root = mkdtempSync(join(tmpdir(), "axint-snap-"));
    try {
      mkdirSync(join(root, "Swarm/Views"), { recursive: true });
      mkdirSync(join(root, "SwarmSnapshotTests/__Snapshots__/BriefViewTests"), {
        recursive: true,
      });
      const swiftFile = join(root, "Swarm/Views/BriefView.swift");
      writeFileSync(
        swiftFile,
        'import SwiftUI\nstruct BriefView: View { var body: some View { Text("x") } }\n'
      );
      writeFileSync(
        join(
          root,
          "SwarmSnapshotTests/__Snapshots__/BriefViewTests/BriefView_iPhone16Pro.png"
        ),
        ""
      );
      writeFileSync(
        join(
          root,
          "SwarmSnapshotTests/__Snapshots__/BriefViewTests/BriefView_iPadPro13.png"
        ),
        ""
      );
      writeFileSync(
        join(
          root,
          "SwarmSnapshotTests/__Snapshots__/BriefViewTests/OtherView_iPhone.png"
        ),
        ""
      );

      const result = findSnapshotAffinity({ swiftFile, projectRoot: root });
      expect(result.hasBaselines).toBe(true);
      expect(result.viewName).toBe("BriefView");
      expect(result.baselinePaths.length).toBe(2);
      const hint = renderSnapshotAffinityHint(result);
      expect(hint).toContain("BriefView");
      expect(hint).toContain("2 snapshot baselines");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns hasBaselines=false when no PNGs match the view name", () => {
    const root = mkdtempSync(join(tmpdir(), "axint-snap-"));
    try {
      mkdirSync(join(root, "Swarm/Views"), { recursive: true });
      mkdirSync(join(root, "SwarmSnapshotTests/__Snapshots__"), { recursive: true });
      const swiftFile = join(root, "Swarm/Views/UnseenView.swift");
      writeFileSync(swiftFile, "");
      const result = findSnapshotAffinity({ swiftFile, projectRoot: root });
      expect(result.hasBaselines).toBe(false);
      expect(renderSnapshotAffinityHint(result)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── drift-age stamp on workflow.check ────────────────────────────────

describe("workflow.check drift-age stamp", () => {
  it("returns undefined on the first call and a duration on the second", () => {
    const cwd = mkdtempSync(join(tmpdir(), "axint-drift-"));
    try {
      const first = runWorkflowCheck({
        cwd,
        agent: "claude",
        sessionToken: "test-token",
        sessionStarted: true,
        requireSession: false,
        stage: "context-recovery",
      });
      expect(first.driftAge).toBeUndefined();

      const second = runWorkflowCheck({
        cwd,
        agent: "claude",
        sessionToken: "test-token",
        sessionStarted: true,
        requireSession: false,
        stage: "before-write",
      });
      expect(second.driftAge).toBeDefined();
      expect(second.driftAge!.minutesSinceLastCheck).toBeGreaterThanOrEqual(0);
      expect(second.driftAge!.previousStage).toBe("context-recovery");
      expect(second.driftAge!.exceedsThreshold).toBe(false);

      const rendered = renderWorkflowCheckReport(second);
      expect(rendered).toContain("## Drift Age");
      expect(rendered.toLowerCase()).toContain("minute");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
