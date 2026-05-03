import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSwiftSources } from "../../src/core/swift-validator.js";

// ─── AX844 — synthesized conformance propagation ─────────────────────

describe("AX844 — synthesized Hashable/Equatable/Codable conformance", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax844-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Models"), { recursive: true });
    // BuilderProfile is Sendable, Identifiable, Codable — NOT Hashable.
    writeFileSync(
      join(tmpRoot, "Models", "SocialModels.swift"),
      `import Foundation

struct BuilderProfile: Sendable, Identifiable, Codable {
    let id: UUID
    let name: String
}
`
    );
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("fires on the dogfooding Hashable propagation case", () => {
    const inputPath = join(tmpRoot, "Stores", "SocialStore.swift");
    mkdirSync(join(tmpRoot, "Stores"), { recursive: true });
    const inputSource = `import Foundation

struct LiveTeammate: Identifiable, Hashable, Sendable {
    let builder: BuilderProfile
    let lastActiveAt: Date
    var id: UUID { builder.id }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax844 = results[0]!.diagnostics.filter((d) => d.code === "AX844");
    expect(ax844.length).toBeGreaterThanOrEqual(1);
    const hashableHit = ax844.find((d) => d.message.includes("Hashable"));
    expect(hashableHit).toBeDefined();
    expect(hashableHit!.message).toContain("LiveTeammate");
    expect(hashableHit!.message).toContain("BuilderProfile");
  });

  it("fires when a stored array element type doesn't conform", () => {
    const inputPath = join(tmpRoot, "Stores", "Bucket.swift");
    const inputSource = `import Foundation

struct SkillEndorsementBucket: Hashable, Sendable, Identifiable {
    let skill: String
    let count: Int
    let endorsers: [BuilderProfile]
    var id: String { skill }
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax844 = results[0]!.diagnostics.filter((d) => d.code === "AX844");
    expect(ax844.length).toBeGreaterThanOrEqual(1);
    expect(ax844[0]!.message).toContain("BuilderProfile");
  });

  it("does not fire on primitive types like String / Int / Date", () => {
    const inputPath = join(tmpRoot, "Stores", "Pure.swift");
    const inputSource = `import Foundation

struct PureBucket: Hashable, Codable {
    let name: String
    let count: Int
    let when: Date
    let amount: Double
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX844").length).toBe(0);
  });

  it("does not fire when the property type extends to declare the protocol elsewhere", () => {
    // Add an extension that declares Hashable on BuilderProfile.
    writeFileSync(
      join(tmpRoot, "Models", "BuilderProfile+Hashable.swift"),
      `import Foundation

extension BuilderProfile: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: BuilderProfile, rhs: BuilderProfile) -> Bool {
        lhs.id == rhs.id
    }
}
`
    );

    const inputPath = join(tmpRoot, "Stores", "OK.swift");
    const inputSource = `import Foundation

struct OK: Hashable {
    let builder: BuilderProfile
}
`;
    writeFileSync(inputPath, inputSource);
    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX844").length).toBe(0);

    // Cleanup the extension so other tests aren't affected.
    rmSync(join(tmpRoot, "Models", "BuilderProfile+Hashable.swift"));
  });
});

// ─── AX843 — state-machine orphan ─────────────────────────────────────

describe("AX843 — enum case written but never read", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = join(tmpdir(), `axint-ax843-${Date.now()}`);
    mkdirSync(join(tmpRoot, "Stores"), { recursive: true });
    mkdirSync(join(tmpRoot, "Views"), { recursive: true });
  });

  afterAll(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("fires on the dogfooding voiceInbox case (writer exists, no reader)", () => {
    // Writer file: assigns .voiceInbox in two places.
    writeFileSync(
      join(tmpRoot, "Stores", "Navigator.swift"),
      `import SwiftUI

@Observable
final class Navigator {
    var rightPane: RightPane = .none
    var rightPaneVisible: Bool = false

    func toggleVoiceInbox() {
        rightPane = .voiceInbox
        rightPaneVisible.toggle()
    }
}
`
    );

    // Live root: writes the enum case but never switches on it.
    writeFileSync(
      join(tmpRoot, "Views", "SocialShellView.swift"),
      `import SwiftUI

struct SocialShellView: View {
    @State var nav = Navigator()
    var body: some View {
        Button("Toggle") {
            nav.rightPane = .voiceInbox
        }
    }
}
`
    );

    // Enum declaration in the input set.
    const inputPath = join(tmpRoot, "Stores", "RightPane.swift");
    const inputSource = `import Foundation

enum RightPane {
    case none
    case voiceInbox
    case settings
}
`;
    writeFileSync(inputPath, inputSource);

    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    const ax843 = results[0]!.diagnostics.filter((d) => d.code === "AX843");
    expect(ax843.length).toBeGreaterThanOrEqual(1);
    expect(ax843.some((d) => d.message.includes("voiceInbox"))).toBe(true);
  });

  it("does not fire when a switch reads the case", () => {
    writeFileSync(
      join(tmpRoot, "Views", "ConsumerView.swift"),
      `import SwiftUI

struct ConsumerView: View {
    let pane: RightPane
    var body: some View {
        switch pane {
        case .voiceInbox: Text("voice")
        case .none: Text("none")
        case .settings: Text("settings")
        }
    }
}
`
    );

    const inputPath = join(tmpRoot, "Stores", "RightPane2.swift");
    const inputSource = `import Foundation

enum RightPane {
    case none
    case voiceInbox
    case settings
}
`;
    writeFileSync(inputPath, inputSource);

    const results = validateSwiftSources([{ file: inputPath, source: inputSource }], {
      projectRoot: tmpRoot,
    });
    expect(results[0]!.diagnostics.filter((d) => d.code === "AX843").length).toBe(0);
  });
});

// ─── AX845 — @MainActor static in init default value ────────────────

describe("AX845 — @MainActor static method in init default-value expression", () => {
  it("fires on the dogfooding GitHubEventsStore pattern", () => {
    const source = `import Foundation

@Observable @MainActor
final class GitHubEventsStore {
    private let storageBase: URL

    init(storageBase: URL = GitHubEventsStore.defaultStorageBase()) {
        self.storageBase = storageBase
    }

    private static func defaultStorageBase() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }
}
`;
    const [result] = validateSwiftSources([{ file: "GitHubEventsStore.swift", source }]);
    const ax845 = result.diagnostics.filter((d) => d.code === "AX845");
    expect(ax845.length).toBe(1);
    expect(ax845[0]!.message).toContain("GitHubEventsStore");
    expect(ax845[0]!.message).toContain("defaultStorageBase");
    expect(ax845[0]!.suggestion).toContain("nonisolated");
  });

  it("does not fire when the static method is marked nonisolated", () => {
    const source = `import Foundation

@MainActor
final class Store {
    private let base: URL
    init(base: URL = Store.defaultBase()) { self.base = base }
    nonisolated private static func defaultBase() -> URL {
        FileManager.default.temporaryDirectory
    }
}
`;
    const [result] = validateSwiftSources([{ file: "Store.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX845").length).toBe(0);
  });

  it("does not fire when the class is not @MainActor", () => {
    const source = `import Foundation

final class PlainStore {
    private let base: URL
    init(base: URL = PlainStore.defaultBase()) { self.base = base }
    private static func defaultBase() -> URL {
        FileManager.default.temporaryDirectory
    }
}
`;
    const [result] = validateSwiftSources([{ file: "PlainStore.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX845").length).toBe(0);
  });

  it("fires on Self.foo() reference inside the same @MainActor type", () => {
    const source = `import Foundation

@MainActor
struct Config {
    let name: String
    init(name: String = Self.defaultName()) { self.name = name }
    private static func defaultName() -> String { "default" }
}
`;
    const [result] = validateSwiftSources([{ file: "Config.swift", source }]);
    const ax845 = result.diagnostics.filter((d) => d.code === "AX845");
    expect(ax845.length).toBe(1);
    expect(ax845[0]!.message).toContain("defaultName");
  });
});

// ─── AX846 — @ViewBuilder with non-View return type ─────────────────

describe("AX846 — @ViewBuilder requires View return type", () => {
  it("fires on the dogfooding @ViewBuilder some Shape pattern", () => {
    const source = `import SwiftUI

struct MonogramTile: View {
    let isCircle: Bool
    let cornerRadius: CGFloat

    @ViewBuilder
    private var shape: some Shape {
        if isCircle {
            Circle()
        } else {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        }
    }

    var body: some View { Color.clear }
}
`;
    const [result] = validateSwiftSources([{ file: "MonogramTile.swift", source }]);
    const ax846 = result.diagnostics.filter((d) => d.code === "AX846");
    expect(ax846.length).toBe(1);
    expect(ax846[0]!.message).toContain("Shape");
    expect(ax846[0]!.suggestion).toContain("AnyShape");
  });

  it("does not fire on @ViewBuilder some View (the canonical valid case)", () => {
    const source = `import SwiftUI

struct V: View {
    @ViewBuilder
    private var inner: some View {
        if true { Text("a") } else { Text("b") }
    }
    var body: some View { inner }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX846").length).toBe(0);
  });

  it("does not fire on @ViewBuilder func returning some View", () => {
    const source = `import SwiftUI

struct V: View {
    @ViewBuilder
    private func chip(label: String) -> some View {
        Text(label)
    }
    var body: some View { chip(label: "hi") }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX846").length).toBe(0);
  });
});

// ─── AX847 — type-erased SwiftUI protocol method missing ─────────────

describe("AX847 — type-erased AnyShape methods that don't exist on Shape", () => {
  it("fires on the dogfooding AnyShape.strokeBorder pattern", () => {
    const source = `import SwiftUI

struct MonogramTile: View {
    let isCircle: Bool
    private var shape: AnyShape {
        if isCircle { return AnyShape(Circle()) }
        return AnyShape(Rectangle())
    }
    var body: some View {
        Color.clear
            .overlay(shape.strokeBorder(.gray, lineWidth: 1))
    }
}
`;
    const [result] = validateSwiftSources([{ file: "MonogramTile.swift", source }]);
    const ax847 = result.diagnostics.filter((d) => d.code === "AX847");
    expect(ax847.length).toBeGreaterThanOrEqual(1);
    expect(ax847[0]!.message).toContain("AnyShape");
    expect(ax847[0]!.message).toContain("strokeBorder");
    expect(ax847[0]!.suggestion).toContain(".stroke");
  });

  it("does not fire when .stroke is used (the correct method)", () => {
    const source = `import SwiftUI

struct V: View {
    private var shape: AnyShape { AnyShape(Circle()) }
    var body: some View {
        Color.clear.overlay(shape.stroke(.gray, lineWidth: 1))
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX847").length).toBe(0);
  });

  it("does not fire on a concrete shape type that does conform to InsettableShape", () => {
    const source = `import SwiftUI

struct V: View {
    var body: some View {
        Color.clear.overlay(Circle().strokeBorder(.gray, lineWidth: 1))
    }
}
`;
    const [result] = validateSwiftSources([{ file: "V.swift", source }]);
    expect(result.diagnostics.filter((d) => d.code === "AX847").length).toBe(0);
  });
});

// ─── Registry search ─────────────────────────────────────────────────

describe("axint registry search", () => {
  let tmpRegistry: string;

  beforeAll(() => {
    tmpRegistry = join(tmpdir(), `axint-registry-${Date.now()}`);
    mkdirSync(join(tmpRegistry, "first-party", "timer"), { recursive: true });
    mkdirSync(join(tmpRegistry, "first-party", "weather-widget"), { recursive: true });
    mkdirSync(join(tmpRegistry, "first-party", "note-capture"), { recursive: true });

    writeFileSync(
      join(tmpRegistry, "first-party", "timer", "manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        name: "timer",
        namespace: "@axint",
        version: "1.0.0",
        description: "Start, stop, or cancel a named timer via Siri or Shortcuts",
        primary_language: "typescript",
        surface_areas: ["app-intent", "productivity"],
        tags: ["timer", "siri", "shortcuts", "productivity"],
        siri_phrases: ["Start a 10 minute pasta timer"],
        min_ios_version: "17.0",
      })
    );

    writeFileSync(
      join(tmpRegistry, "first-party", "weather-widget", "manifest.json"),
      JSON.stringify({
        name: "weather-widget",
        namespace: "@axint",
        version: "1.0.0",
        description: "A WidgetKit widget showing the current weather",
        surface_areas: ["widget"],
        tags: ["weather", "widget"],
      })
    );

    writeFileSync(
      join(tmpRegistry, "first-party", "note-capture", "manifest.json"),
      JSON.stringify({
        name: "note-capture",
        namespace: "@axint",
        version: "1.0.0",
        description: "Capture a quick note from anywhere",
        surface_areas: ["app-intent"],
        tags: ["notes", "capture", "quick"],
      })
    );
  });

  afterAll(() => {
    if (tmpRegistry) rmSync(tmpRegistry, { recursive: true, force: true });
  });

  it("finds the timer package for 'start a timer'", async () => {
    const { searchRegistry } = await import("../../src/registry/search.js");
    const hits = searchRegistry({ query: "start a timer", registryPath: tmpRegistry });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.name).toBe("timer");
    expect(hits[0]!.installCommand).toContain("@axint/timer@1.0.0");
  });

  it("filters by surface area when kind is provided", async () => {
    const { searchRegistry } = await import("../../src/registry/search.js");
    const hits = searchRegistry({
      query: "weather",
      kind: "widget",
      registryPath: tmpRegistry,
    });
    expect(hits.length).toBe(1);
    expect(hits[0]!.name).toBe("weather-widget");
  });

  it("returns empty when no manifest matches", async () => {
    const { searchRegistry } = await import("../../src/registry/search.js");
    const hits = searchRegistry({
      query: "nonexistent zzzzz",
      registryPath: tmpRegistry,
    });
    expect(hits.length).toBe(0);
  });

  it("returns empty when registry is missing entirely", async () => {
    const { searchRegistry } = await import("../../src/registry/search.js");
    const hits = searchRegistry({
      query: "anything",
      registryPath: "/tmp/does-not-exist-zzz",
    });
    expect(hits.length).toBe(0);
  });

  it("ranks tags / siri-phrase matches above bare description matches", async () => {
    const { searchRegistry } = await import("../../src/registry/search.js");
    const hits = searchRegistry({ query: "siri timer", registryPath: tmpRegistry });
    expect(hits[0]!.name).toBe("timer");
    expect(hits[0]!.matchedOn).toContain("tags");
  });
});
