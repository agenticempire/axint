import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proveAxintProject, renderAxintProveReport } from "../../src/proof/prove.js";
import {
  verifySignedProofReceipt,
  type AxintSignedProofReceipt,
} from "../../src/proof/receipt.js";
import {
  applyFindingFeedback,
  writeFindingFeedbackFromReceipt,
} from "../../src/feedback/findings.js";

function makeProject(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "axint-prove-"));
  const schemeDir = join(dir, "ProofApp.xcodeproj", "xcshareddata", "xcschemes");
  mkdirSync(schemeDir, { recursive: true });
  writeFileSync(join(schemeDir, "ProofApp.xcscheme"), "<Scheme></Scheme>\n");
  writeFileSync(join(dir, "ContentView.swift"), source);
  return dir;
}

function installRepairAwareXcodebuild(dir: string): string {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const executable = join(bin, "xcodebuild");
  writeFileSync(
    executable,
    [
      "#!/bin/sh",
      "if grep -q '@State private let' ContentView.swift; then",
      '  echo "$PWD/ContentView.swift:4: error: @State property must use var" >&2',
      "  exit 1",
      "fi",
      "echo '** BUILD OR TEST SUCCEEDED **'",
      "exit 0",
      "",
    ].join("\n")
  );
  chmodSync(executable, 0o755);
  return bin;
}

describe.sequential("Axint proof platform", { timeout: 20_000 }, () => {
  let previousHome: string | undefined;
  let previousPath: string | undefined;

  beforeEach(() => {
    previousHome = process.env.AXINT_HOME;
    previousPath = process.env.PATH;
    process.env.AXINT_HOME = mkdtempSync(join(tmpdir(), "axint-proof-home-"));
  });

  afterEach(() => {
    process.env.AXINT_HOME = previousHome;
    process.env.PATH = previousPath;
  });

  it("never promotes planned dry-run commands to shipping evidence", async () => {
    const dir = makeProject(`import SwiftUI

struct ContentView: View {
    var body: some View { Text("Hello") }
}
`);
    const report = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      dryRun: true,
    });

    expect(report.status).toBe("needs_review");
    expect(report.gate.decision).toBe("evidence_required");
    expect(report.testDiscovery.available).toBe(false);
    expect(verifySignedProofReceipt(report.receipt).valid).toBe(true);
    expect(existsSync(report.artifacts.receipt.json)).toBe(true);
    expect(renderAxintProveReport(report)).toContain("Receipt signature: valid");
    const feedbackDir = join(dir, ".axint/feedback/outbox");
    const proofEnvelope = readdirSync(feedbackDir)
      .filter((file) => file.endsWith(".json"))
      .map(
        (file) =>
          JSON.parse(readFileSync(join(feedbackDir, file), "utf-8")) as {
            packetType?: string;
            packet?: { schema?: string; status?: string; redaction?: string };
          }
      )
      .find((envelope) => envelope.packetType === "proof");
    expect(proofEnvelope?.packet).toMatchObject({
      schema: "https://axint.ai/schemas/proof-feedback.v1.json",
      status: "needs_review",
      redaction: "source_not_included",
    });
  });

  it("detects receipt tampering", async () => {
    const dir = makeProject(`import SwiftUI
struct ContentView: View { var body: some View { Text("Hello") } }
`);
    const report = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      dryRun: true,
    });
    const tampered = JSON.parse(
      JSON.stringify(report.receipt)
    ) as AxintSignedProofReceipt;
    tampered.payload.outcome.reason = "This payload was changed after signing.";

    const verification = verifySignedProofReceipt(tampered);
    expect(verification.valid).toBe(false);
    expect(verification.payloadHashMatches).toBe(false);

    const signerTampered = JSON.parse(
      JSON.stringify(report.receipt)
    ) as AxintSignedProofReceipt;
    signerTampered.integrity.signer.name = "Altered signer";
    expect(verifySignedProofReceipt(signerTampered).valid).toBe(false);

    expect(
      verifySignedProofReceipt(report.receipt, {
        trustedFingerprint: "sha256:not-the-signer",
      }).valid
    ).toBe(false);
    expect(
      verifySignedProofReceipt(report.receipt, {
        trustedFingerprint: report.receipt.integrity.signer.fingerprint,
      }).valid
    ).toBe(true);
  });

  it("infers the Apple platform from Xcode build settings", async () => {
    const dir = makeProject(`import SwiftUI
struct ContentView: View { var body: some View { Text("Hello") } }
`);
    writeFileSync(
      join(dir, "ProofApp.xcodeproj", "project.pbxproj"),
      "buildSettings = { SDKROOT = iphoneos; };\n"
    );
    const report = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      dryRun: true,
    });

    expect(report.run.platform).toBe("iOS");
    expect(report.run.destination).toContain("iOS Simulator");
  });

  it("applies deterministic fixes only when requested and reruns proof", async () => {
    const dir = makeProject(`import SwiftUI

struct ContentView: View {
    @State private let count = 0
    var body: some View { Text("\\(count)") }
}
`);
    process.env.PATH = `${installRepairAwareXcodebuild(dir)}:${previousPath ?? ""}`;

    const preview = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      skipTests: true,
      outputDir: ".axint/preview-proof",
    });
    expect(preview.repairs).toContainEqual({
      file: "ContentView.swift",
      codes: ["AX703"],
      outcome: "proposed",
    });
    expect(readFileSync(join(dir, "ContentView.swift"), "utf-8")).toContain(
      "@State private let"
    );

    const repaired = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      fix: true,
      outputDir: ".axint/repaired-proof",
    });
    expect(repaired.reranAfterRepair).toBe(true);
    expect(repaired.status).toBe("needs_review");
    expect(repaired.repairs[0]?.outcome).toBe("applied");
    expect(readFileSync(join(dir, "ContentView.swift"), "utf-8")).toContain(
      "@State private var"
    );
    expect(repaired.receipt.payload.execution.automaticFixes).toBe(true);
    expect(repaired.receipt.payload.execution.projectMutation).toBe("allowed");
    expect(verifySignedProofReceipt(repaired.receipt).valid).toBe(true);
  });

  it("records finding feedback from a receipt and suppresses it on the next run", async () => {
    const dir = makeProject(`import SwiftUI

struct ComposerView: View {
    @State private var draft = ""
    var body: some View {
        TextEditor(text: $draft).overlay { Text("Write") }
    }
}
`);
    const report = await proveAxintProject({
      cwd: dir,
      version: "0.0.0-test",
      dryRun: true,
    });
    const finding = report.run.swiftValidation.diagnostics.find(
      (diagnostic) => diagnostic.code === "AX764"
    );
    expect(finding?.id).toMatch(/^axf_/);

    writeFindingFeedbackFromReceipt({
      cwd: dir,
      receiptPath: report.artifacts.receipt.json,
      identifier: finding!.id!,
      verdict: "false-positive",
      note: "Covered by a project-specific interaction test.",
    });
    const next = applyFindingFeedback([finding!], dir)[0]!;
    expect(next.status).toBe("suppressed");
    expect(next.blocking).toBe(false);
    expect(next.feedback?.verdict).toBe("false-positive");
    expect(JSON.stringify(next)).not.toContain("TextEditor(text");
  });
});
