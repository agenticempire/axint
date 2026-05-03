import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSwiftDiagnostics } from "../../src/cloud/swift-typecheck.js";
import { parseSnapshotFailures } from "../../src/cloud/snapshot-tests.js";
import { scaffoldPaintTests } from "../../src/cloud/paint-test.js";

// ─── swift -typecheck output parsing ─────────────────────────────────

describe("parseSwiftDiagnostics", () => {
  it("parses an error line with file:line:col format", () => {
    const stderr = `/path/to/MonogramTile.swift:24:14: error: Value of type 'AnyShape' has no member 'strokeBorder'
        shape.strokeBorder(.gray, lineWidth: 1)
              ^~~~~~~~~~~~`;
    const diagnostics = parseSwiftDiagnostics(stderr);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.code).toBe("AX-SWIFTC-ERROR");
    expect(diagnostics[0]!.severity).toBe("error");
    expect(diagnostics[0]!.message).toContain("AnyShape");
    expect(diagnostics[0]!.message).toContain("strokeBorder");
    expect(diagnostics[0]!.file).toBe("/path/to/MonogramTile.swift");
    expect(diagnostics[0]!.line).toBe(24);
    expect(diagnostics[0]!.column).toBe(14);
  });

  it("parses warnings as severity 'warning' with the warning code", () => {
    const stderr = `/path/Foo.swift:8:5: warning: 'someAPI' is deprecated`;
    const diagnostics = parseSwiftDiagnostics(stderr);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.severity).toBe("warning");
    expect(diagnostics[0]!.code).toBe("AX-SWIFTC-WARNING");
  });

  it("skips note lines (compiler annotations on prior diagnostics)", () => {
    const stderr = `/path/A.swift:1:1: error: something
/path/B.swift:2:2: note: see also`;
    const diagnostics = parseSwiftDiagnostics(stderr);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.severity).toBe("error");
  });

  it("returns empty for empty input", () => {
    expect(parseSwiftDiagnostics("")).toEqual([]);
  });

  it("ignores non-diagnostic lines", () => {
    const stderr = `Compiling Swift module ...
/path/Foo.swift:10:5: error: real error
some other unrelated chatter`;
    const diagnostics = parseSwiftDiagnostics(stderr);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.line).toBe(10);
  });
});

// ─── snapshot test failure parsing ───────────────────────────────────

describe("parseSnapshotFailures", () => {
  it("extracts a snapshot failure into a Diagnostic with file/line/suite", () => {
    const output = `/path/Tests/HomeViewSnapshotTests.swift:42: error: -[HomeViewSnapshotTests testHomeViewIPhone16Pro] : Snapshot failed: pixel diff exceeds tolerance`;
    const diagnostics = parseSnapshotFailures(output, "/path");
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.code).toBe("AX-SNAPSHOT-FAIL");
    expect(diagnostics[0]!.severity).toBe("error");
    expect(diagnostics[0]!.message).toContain("HomeViewSnapshotTests");
    expect(diagnostics[0]!.message).toContain("testHomeViewIPhone16Pro");
    expect(diagnostics[0]!.file).toBe("/path/Tests/HomeViewSnapshotTests.swift");
    expect(diagnostics[0]!.line).toBe(42);
  });

  it("surfaces the failure artifact path in the suggestion when present", () => {
    const output = `/path/Test.swift:10: error: -[Suite test] : Snapshot failed Recorded snapshot: "/tmp/__Failures__/test.png"`;
    const diagnostics = parseSnapshotFailures(output, "/path");
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]!.suggestion).toContain("/tmp/__Failures__/test.png");
  });

  it("returns empty when no failures are present", () => {
    const output = `Test Suite 'HomeViewSnapshotTests' passed
Executed 12 tests, with 0 failures`;
    expect(parseSnapshotFailures(output, "/path")).toEqual([]);
  });
});

// ─── UIPaint scaffold ────────────────────────────────────────────────

describe("scaffoldPaintTests", () => {
  it("generates one assertion per zero-arg View per viewport, skips App + PreviewProvider", () => {
    const tmpRoot = join(tmpdir(), `axint-paint-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });

    writeFileSync(
      join(tmpRoot, "App.swift"),
      `import SwiftUI
@main
struct DemoApp: App {
  var body: some Scene { WindowGroup { ContentView() } }
}
`
    );

    writeFileSync(
      join(tmpRoot, "Views", "ContentView.swift"),
      `import SwiftUI
struct ContentView: View {
  var body: some View { Text("hi") }
}

struct ContentPreview: View, PreviewProvider {
  static var previews: some View { ContentView() }
  var body: some View { ContentView() }
}
`
    );

    writeFileSync(
      join(tmpRoot, "Views", "AvatarView.swift"),
      `import SwiftUI
struct AvatarView: View {
  let name: String
  var body: some View { Text(name) }
}
`
    );

    const result = scaffoldPaintTests({
      projectRoot: tmpRoot,
      moduleName: "Demo",
      write: false,
    });

    // ContentView is mountable. AvatarView has a required `name` so it's
    // skipped. DemoApp is App. ContentPreview is PreviewProvider.
    expect(result.viewCount).toBe(1);
    expect(result.generated).toContain("test_ContentView_paints_iPhone16Pro");
    expect(result.generated).toContain("test_ContentView_paints_iPadPro13");
    expect(result.generated).not.toContain("test_DemoApp");
    expect(result.generated).not.toContain("test_ContentPreview");

    const skippedReasons = result.skipped.map((s) => `${s.name}:${s.reason}`);
    expect(skippedReasons.some((r) => r.startsWith("DemoApp:"))).toBe(true);
    expect(skippedReasons.some((r) => r.startsWith("ContentPreview:"))).toBe(true);
    expect(skippedReasons.some((r) => r.startsWith("AvatarView:"))).toBe(true);

    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("dry-run returns generated content without writing", () => {
    const tmpRoot = join(tmpdir(), `axint-paint-dry-${Date.now()}`);
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(
      join(tmpRoot, "V.swift"),
      `import SwiftUI
struct V: View { var body: some View { Text("a") } }
`
    );
    const result = scaffoldPaintTests({
      projectRoot: tmpRoot,
      moduleName: "Demo",
      write: false,
    });
    expect(result.outputPath).toBeUndefined();
    expect(result.viewCount).toBe(1);
    expect(result.generated).toContain("test_V_paints_iPhone16Pro");
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("writes the file when write is not false", () => {
    const tmpRoot = join(tmpdir(), `axint-paint-write-${Date.now()}`);
    mkdirSync(join(tmpRoot, "SwarmPaintTests"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "View1.swift"),
      `import SwiftUI
struct One: View { var body: some View { Text("1") } }
`
    );

    const out = join(tmpRoot, "SwarmPaintTests", "GenPaint.swift");
    const result = scaffoldPaintTests({
      projectRoot: tmpRoot,
      moduleName: "Demo",
      outputPath: out,
    });
    expect(result.outputPath).toBe(out);
    const written = readFileSync(out, "utf-8");
    expect(written).toContain("test_One_paints_iPhone16Pro");
    rmSync(tmpRoot, { recursive: true, force: true });
  });
});
