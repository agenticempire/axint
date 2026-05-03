import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSwiftSources } from "../../src/core/swift-validator.js";

// ─── AX787 — string-interpolation extension ──────────────────────────

describe("AX787 — undefined identifier inside string interpolation", () => {
  it("fires on the dogfooding `\\(projectName)` pattern", () => {
    const source = `
import SwiftUI

struct ProjectWarRoomView: View {
    var showcase: ShowcaseModel?
    var project: ProjectModel?

    var body: some View {
        let summary = "Project \\(projectName) has 3 open items"
        return Text(summary)
    }
}
`;
    const [result] = validateSwiftSources([{ file: "ProjectWarRoomView.swift", source }]);
    const ax787 = result.diagnostics.filter((d) => d.code === "AX787");
    expect(ax787.length).toBeGreaterThanOrEqual(1);
    expect(ax787.some((d) => d.message.includes("projectName"))).toBe(true);
  });

  it("does not fire when the interpolated identifier is declared in scope", () => {
    const source = `
import SwiftUI

struct V: View {
    let displayName: String
    var body: some View {
        let line = "Hello, \\(displayName)!"
        return Text(line)
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX787").length).toBe(0);
  });

  it("does not fire on Swift built-ins like print/abs/Date", () => {
    const source = `
import Foundation
struct V {
    var summary: String { "Now is \\(Date)" }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX787").length).toBe(0);
  });
});

// ─── AX840 — missing module import ────────────────────────────────────

describe("AX840 — symbol used but defining module not imported", () => {
  it("fires on the dogfooding `UTType.text` without UniformTypeIdentifiers", () => {
    const source = `
import AppKit
import SwiftUI

struct DropZone: View {
    var body: some View {
        Color.clear.onDrop(of: [.text], delegate: NoopDropDelegate())
    }
}

private struct NoopDropDelegate: DropDelegate {}
`;
    const results = validateSwiftSources([{ file: "DropZone.swift", source }]);
    const ax790 = results[0]!.diagnostics.filter((d) => d.code === "AX840");
    expect(ax790.length).toBeGreaterThanOrEqual(1);
    expect(ax790[0]!.message).toContain("UniformTypeIdentifiers");
  });

  it("does not fire when the module is imported", () => {
    const source = `
import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct DropZone: View {
    var body: some View {
        Color.clear.onDrop(of: [.text], delegate: NoopDropDelegate())
    }
}

private struct NoopDropDelegate: DropDelegate {}
`;
    const results = validateSwiftSources([{ file: "DropZone.swift", source }]);
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX840").length).toBe(0);
  });

  it("fires on AVPlayer without AVFoundation", () => {
    const source = `
import SwiftUI

struct V: View {
    let player = AVPlayer(url: URL(string: "https://example.com")!)
    var body: some View { Text("x") }
}
`;
    const results = validateSwiftSources([{ file: "V.swift", source }]);
    const ax790 = results[0]!.diagnostics.filter((d) => d.code === "AX840");
    expect(ax790.length).toBe(1);
    expect(ax790[0]!.message).toContain("AVFoundation");
  });

  it("only emits one diagnostic per missing module", () => {
    const source = `
import SwiftUI

struct V: View {
    var body: some View {
        Color.clear
            .onDrop(of: [.text], delegate: D())
            .onDrop(of: [.image], delegate: D())
            .onDrop(of: [.url], delegate: D())
    }
}
private struct D: DropDelegate {}
`;
    const results = validateSwiftSources([{ file: "V.swift", source }]);
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX840").length).toBe(1);
  });
});

// ─── AX841 — project-index member resolution ─────────────────────────

describe("AX841 — member access on cross-file type via project index", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax791-test-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Stores"), { recursive: true });
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });

    // The "remote" type that lives outside the input set.
    writeFileSync(
      join(tmpRoot, "Stores", "VoiceInboxStore.swift"),
      `
import Foundation

@MainActor
final class VoiceInboxStore: ObservableObject {
    @Published var results: [String] = []
    func clear() { results.removeAll() }
}
`
    );

    // The "in-flight" file the agent is editing.
    writeFileSync(
      join(tmpRoot, "Views", "PersonalWorkspaceView.swift"),
      `
import SwiftUI

struct PersonalWorkspaceView: View {
    let voiceInbox: VoiceInboxStore
    var body: some View {
        Text("\\(voiceInbox.items.count) voice notes")
    }
}
`
    );
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Note: AX841 runs against stripped source (with string literals removed)
  // so it catches member access in normal expression position. String
  // interpolation cases (\\(voiceInbox.items)) are AX787's domain.

  it("fires on `voiceInbox.items` when VoiceInboxStore exposes `results` (the dogfooding case)", () => {
    const inputPath = join(tmpRoot, "Views", "PersonalWorkspaceView.swift");
    const inputSource = `
import SwiftUI

struct PersonalWorkspaceView: View {
    let voiceInbox: VoiceInboxStore
    var body: some View {
        let count = voiceInbox.items.count
        return Text("\\(count) voice notes")
    }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax791 = results[0]!.diagnostics.filter((d) => d.code === "AX841");
    expect(ax791.length).toBeGreaterThanOrEqual(1);
    expect(ax791[0]!.message).toContain("VoiceInboxStore");
    expect(ax791[0]!.message).toContain("items");
  });

  it("emits a 'did you mean' suggestion when the typo is close (Levenshtein)", () => {
    const inputPath = join(tmpRoot, "Views", "PersonalWorkspaceView.swift");
    // 'reslts' is a 1-edit typo of 'results' so the suggestion should fire.
    const inputSource = `
import SwiftUI

struct PersonalWorkspaceView: View {
    let voiceInbox: VoiceInboxStore
    var body: some View {
        let count = voiceInbox.reslts.count
        return Text("\\(count) voice notes")
    }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax791 = results[0]!.diagnostics.filter((d) => d.code === "AX841");
    expect(ax791.length).toBeGreaterThanOrEqual(1);
    expect(ax791[0]!.message).toContain("Did you mean 'results'?");
  });

  it("does not fire when projectRoot is omitted", () => {
    const inputPath = join(tmpRoot, "Views", "PersonalWorkspaceView.swift");
    const inputSource = `
import SwiftUI

struct PersonalWorkspaceView: View {
    let voiceInbox: VoiceInboxStore
    var body: some View {
        let count = voiceInbox.items.count
        return Text("\\(count) voice notes")
    }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }]);
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX841").length).toBe(0);
  });

  it("does not fire when the member exists on the type", () => {
    const inputPath = join(tmpRoot, "Views", "PersonalWorkspaceView.swift");
    const inputSource = `
import SwiftUI

struct PersonalWorkspaceView: View {
    let voiceInbox: VoiceInboxStore
    var body: some View {
        let count = voiceInbox.results.count
        return Text("\\(count) voice notes")
    }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX841").length).toBe(0);
  });
});

// ─── AX842 — view reachability ───────────────────────────────────────

describe("AX842 — SwiftUI View has zero call sites in the project", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax792-test-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });

    // Live App scene — root.
    writeFileSync(
      join(tmpRoot, "App.swift"),
      `
import SwiftUI
@main
struct LiveApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}
`
    );

    // Reachable view, called from the App.
    writeFileSync(
      join(tmpRoot, "Views", "ContentView.swift"),
      `
import SwiftUI
struct ContentView: View {
    var body: some View { ReachableChild() }
}
`
    );

    // Reachable child, called from ContentView.
    writeFileSync(
      join(tmpRoot, "Views", "ReachableChild.swift"),
      `
import SwiftUI
struct ReachableChild: View {
    var body: some View { Text("hi") }
}
`
    );

    // The dead view — declared but never instantiated anywhere.
    // (This file is what we "edit" in the test below.)
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("fires on a View struct with zero call sites in the project", () => {
    const inputPath = join(tmpRoot, "Views", "DeadView.swift");
    const inputSource = `
import SwiftUI
struct DeadView: View {
    var body: some View { Text("dead") }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax792 = results[0]!.diagnostics.filter((d) => d.code === "AX842");
    expect(ax792.length).toBe(1);
    expect(ax792[0]!.message).toContain("DeadView");
  });

  it("does not fire on a View that is reachable from the App body", () => {
    const inputPath = join(tmpRoot, "Views", "ContentView.swift");
    const inputSource = `
import SwiftUI
struct ContentView: View {
    var body: some View { ReachableChild() }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX842").length).toBe(0);
  });

  it("does not fire on a View tagged with `// axint:reachable`", () => {
    const inputPath = join(tmpRoot, "Views", "ReflectiveView.swift");
    const inputSource = `
import SwiftUI

// axint:reachable — instantiated via NSStoryboard/dynamic wiring
struct ReflectiveView: View {
    var body: some View { Text("loaded reflectively") }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX842").length).toBe(0);
  });

  it("does not fire when projectRoot is omitted", () => {
    const inputPath = join(tmpRoot, "Views", "DeadView.swift");
    const inputSource = `
import SwiftUI
struct DeadView: View {
    var body: some View { Text("dead") }
}
`;
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }]);
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX842").length).toBe(0);
  });
});
