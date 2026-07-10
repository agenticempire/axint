import { describe, expect, it } from "vitest";

import {
  isDiagnosticBlocking,
  reconcileDiagnosticsWithEvidence,
  summarizeDiagnosticEvidence,
} from "../../src/core/diagnostic-evidence.js";
import type { Diagnostic } from "../../src/core/types.js";

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  file = "Sources/Feature.swift",
  line = 12
): Diagnostic {
  return {
    code,
    severity,
    message: "Fixture finding",
    file,
    line,
  };
}

describe("diagnostic evidence reconciliation", () => {
  it("suppresses a compiler-shaped static error when the selected Xcode build passes", () => {
    const [result] = reconcileDiagnosticsWithEvidence([diagnostic("AX765", "error")], {
      build: {
        exitCode: 0,
        stdout: "** BUILD SUCCEEDED **",
        command: "xcodebuild -scheme Demo build",
      },
    });

    expect(result.status).toBe("suppressed");
    expect(result.originalSeverity).toBe("error");
    expect(result.severity).toBe("info");
    expect(isDiagnosticBlocking(result)).toBe(false);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ source: "xcode-build", relation: "contradicts" })
    );
  });

  it("keeps accessibility heuristics advisory after a successful compile", () => {
    const [result] = reconcileDiagnosticsWithEvidence([diagnostic("AX736", "warning")], {
      build: { exitCode: 0, stdout: "** BUILD SUCCEEDED **" },
    });

    expect(result.status).toBe("active");
    expect(result.confidence).toBe("advisory");
    expect(result.severity).toBe("warning");
    expect(isDiagnosticBlocking(result)).toBe(false);
  });

  it("confirms a static finding when Xcode emits an error at the same source location", () => {
    const [result] = reconcileDiagnosticsWithEvidence([diagnostic("AX765", "error")], {
      build: {
        exitCode: 65,
        stderr:
          "/tmp/Demo/Sources/Feature.swift:12:7: error: incorrect argument label in call",
      },
    });

    expect(result.status).toBe("active");
    expect(result.confidence).toBe("confirmed");
    expect(isDiagnosticBlocking(result)).toBe(true);
  });

  it("makes every unconfirmed finding non-blocking in advisory-only mode", () => {
    const results = reconcileDiagnosticsWithEvidence(
      [diagnostic("AX765", "error"), diagnostic("AX736", "warning")],
      { advisoryOnly: true }
    );
    const summary = summarizeDiagnosticEvidence(results);

    expect(results.every((result) => !isDiagnosticBlocking(result))).toBe(true);
    expect(summary.blocking).toBe(0);
    expect(summary.probable).toBe(1);
    expect(summary.advisory).toBe(1);
  });
});
