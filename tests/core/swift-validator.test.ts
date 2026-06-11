import { describe, it, expect } from "vitest";
import {
  validateSwiftSource,
  validateSwiftSources,
} from "../../src/core/swift-validator.js";

function validate(source: string) {
  return validateSwiftSource(source, "test.swift");
}

describe("swift validator — AX701 AppIntent.perform()", () => {
  it("flags an AppIntent that has no perform() function", () => {
    const source = `
      import AppIntents

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("AX701");
    expect(diagnostics[0].message).toContain("SendMessage");
  });

  it("accepts an AppIntent with perform()", () => {
    const source = `
      import AppIntents

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
          func perform() async throws -> some IntentResult {
              return .result()
          }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.filter((d) => d.code === "AX701")).toHaveLength(0);
  });

  it("accepts perform() even when the protocol is part of a composition", () => {
    const source = `
      import AppIntents

      struct LogEvent: Sendable & AppIntent {
          static var title: LocalizedStringResource = "Log Event"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

describe("swift validator — AX702 Widget body", () => {
  it("flags a Widget missing var body: some WidgetConfiguration", () => {
    const source = `
      import WidgetKit
      import SwiftUI

      struct WeatherWidget: Widget {
          let kind: String = "WeatherWidget"
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe("AX702");
    expect(diagnostics[0].message).toContain("WeatherWidget");
  });

  it("accepts a Widget that declares var body: some WidgetConfiguration", () => {
    const source = `
      struct WeatherWidget: Widget {
          let kind: String = "WeatherWidget"
          var body: some WidgetConfiguration {
              StaticConfiguration(kind: kind, provider: Provider()) { entry in
                  Text(entry.date, style: .time)
              }
          }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX702")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX703 @State must be var", () => {
  it("flags @State declared with let inside a View", () => {
    const source = `
      import SwiftUI

      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.some((d) => d.code === "AX703")).toBe(true);
  });

  it("accepts @State var inside a View", () => {
    const source = `
      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX703")).toHaveLength(
      0
    );
  });

  it("does not flag @State let outside of a SwiftUI View", () => {
    const source = `
      struct NotAView {
          @State let value: Int = 0
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

describe("swift validator — robustness", () => {
  it("does not trip on protocol names inside comments or strings", () => {
    const source = `
      import AppIntents

      // struct FakeWidget: Widget { ... }
      let note = "struct FakeIntent: AppIntent {}"
      struct RealIntent: AppIntent {
          static var title: LocalizedStringResource = "Real Intent"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });

  it("handles multiple types in one file and reports each problem separately", () => {
    const source = `
      import AppIntents
      import SwiftUI
      import WidgetKit

      struct A: AppIntent {
          static var title: LocalizedStringResource = "A"
      }
      struct B: Widget { }
      struct C: View {
          @State let broken: Int = 0
          var body: some View { EmptyView() }
      }
    `;
    const { diagnostics } = validate(source);
    const codes = diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual(["AX701", "AX702", "AX703"]);
  });
});

describe("swift validator — SwiftUI compiler parity", () => {
  it("flags some View helpers with local declarations but no explicit return", () => {
    const source = `
      import SwiftUI

      struct DiscoverView: View {
          var body: some View { projectLoadMoreFooter() }

          private func projectLoadMoreFooter() -> some View {
              let label = "Load more"
              Button(label) { }
          }
      }
    `;

    const { diagnostics } = validate(source);
    expect(diagnostics.map((d) => d.code)).toContain("AX767");
  });

  it("flags non-View computed properties with local declarations but no explicit return", () => {
    const source = `
      struct CadabraSettings {
          var magicSummary: String {
              let tier = "Better"
              "Magic Level: \\(tier)"
          }
      }
    `;

    const { diagnostics } = validate(source);
    const diagnostic = diagnostics.find((d) => d.code === "AX849");
    expect(diagnostic?.message).toContain("magicSummary");
    expect(diagnostic?.suggestion).toContain("return");
  });

  it("attributes the missing return to the offending property, not its neighbor", () => {
    // A stored property above the offender used to get blamed: the type
    // annotation regex crossed newlines and swallowed the next declaration.
    const source = `import SwiftUI

struct StatsView: View {
    let items: [String]
    let completed: Int

    var body: some View {
        VStack {
            Text(subtitle)
        }
    }

    // Done count for the header row.

    var count: Int

    var subtitle: String {
        let done = completed
        "\\(done) of \\(items.count) done"
    }
}
`;

    const { diagnostics } = validate(source);
    const matches = diagnostics.filter((d) => d.code === "AX849");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.message).toContain("'subtitle'");
    expect(matches[0]!.line).toBe(17);
  });

  it("keeps attribution straight across two adjacent computed properties", () => {
    const source = `struct Stats {
    var count: Int { 3 }
    var subtitle: String {
        let done = 2
        "\\(done) of 3 done"
    }
}
`;

    const { diagnostics } = validate(source);
    const matches = diagnostics.filter((d) => d.code === "AX849");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.message).toContain("'subtitle'");
    expect(matches[0]!.line).toBe(3);
  });

  it("flags same-file switches over enum values that omit a declared case", () => {
    const source = `
      enum CadabraPreset {
          case better
          case outfit
          case wild
          case noirFrame

          var suggestedCameraFeel: String {
              switch self {
              case .better:
                  return "Clean"
              case .outfit:
                  return "Styled"
              case .wild:
                  return "Chaotic"
              }
          }
      }
    `;

    const { diagnostics } = validate(source);
    const diagnostic = diagnostics.find((d) => d.code === "AX860");
    expect(diagnostic?.message).toContain("noirFrame");
    expect(diagnostic?.suggestion).toContain("case .noirFrame");
  });

  it("accepts some View helpers that explicitly return the final expression", () => {
    const source = `
      import SwiftUI

      struct DiscoverView: View {
          var body: some View { projectLoadMoreFooter() }

          private func projectLoadMoreFooter() -> some View {
              let label = "Load more"
              return Button(label) { }
          }
      }
    `;

    expect(validate(source).diagnostics.map((d) => d.code)).not.toContain("AX767");
  });

  it("flags nested SwiftUI views that reference parent-only helpers", () => {
    const source = `
      import SwiftUI

      struct ProjectRoomContentView: View {
          private var isAxintProject: Bool { true }
          var body: some View { ProjectIntelligenceView() }
      }

      struct ProjectIntelligenceView: View {
          var body: some View {
              if isAxintProject {
                  Text("Axint")
              } else {
                  Text("Project")
              }
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX739");
    expect(diagnostic?.message).toContain("isAxintProject");
  });

  it("flags changed model/view files with a direct missing member access", () => {
    const model = `
      struct ShareCardDesignProfile {
          let style: ShareCardStyle
      }

      struct ShareCardStyle {
          let detail: String
      }
    `;
    const view = `
      import SwiftUI

      struct LaunchCenterView: View {
          let profile: ShareCardDesignProfile

          var body: some View {
              Text(profile.detail)
          }
      }
    `;

    const diagnostics = validateSwiftSources([
      { file: "ShareCardDesignProfile.swift", source: model },
      { file: "LaunchCenterView.swift", source: view },
    ]).flatMap((result) => result.diagnostics);

    const diagnostic = diagnostics.find((d) => d.code === "AX768");
    expect(diagnostic?.file).toBe("LaunchCenterView.swift");
    expect(diagnostic?.message).toContain("profile.detail");
    expect(diagnostic?.message).toContain("ShareCardDesignProfile");
  });

  it("does not bind untyped closure loop variables to stale nearby model names", () => {
    const source = `
      import SwiftUI

      enum PublicPageModuleKind: CaseIterable, Identifiable {
          case proof
          var id: String { "proof" }
          var symbol: String { "checkmark.seal" }
          var label: String { "Proof" }
      }

      struct PublicPageModule {
          let kind: PublicPageModuleKind
      }

      struct CreatorTemplate {
          let recommendedModules: [PublicPageModuleKind]
      }

      struct ProjectShowcaseView: View {
          let template: CreatorTemplate

          var body: some View {
              let module: PublicPageModule = PublicPageModule(kind: .proof)
              _ = module.kind
              ForEach(template.recommendedModules) { module in
                  Label(module.label, systemImage: module.symbol)
              }
          }
      }
    `;

    const diagnostics = validateSwiftSources([
      { file: "PublicPageCustomization.swift", source },
    ]).flatMap((result) => result.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX768")).toEqual([]);
  });
});

// ─── New rules: AX704 AppIntent title ─────────────────────────────

describe("swift validator — AX704 AppIntent.title", () => {
  it("flags an AppIntent missing static var title", () => {
    const source = `
      struct LogEvent: AppIntent {
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const { diagnostics } = validate(source);
    expect(diagnostics.some((d) => d.code === "AX704")).toBe(true);
  });

  it("accepts an AppIntent with a title", () => {
    const source = `
      struct LogEvent: AppIntent {
          static var title: LocalizedStringResource = "Log Event"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX704")).toHaveLength(
      0
    );
  });

  it("explains static let title as a let-vs-var mismatch", () => {
    const source = `
      struct LogEvent: AppIntent {
          static let title: LocalizedStringResource = "Log Event"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX704");
    expect(diagnostic?.message).toContain("static let");
    expect(diagnostic?.suggestion).toContain("keep the existing title value");
  });
});

// ─── AX705–AX707: TimelineProvider methods ──────────────────────────

describe("swift validator — AX705–AX707 TimelineProvider methods", () => {
  it("flags all three missing methods", () => {
    const source = `
      import WidgetKit

      struct Provider: TimelineProvider {
          typealias Entry = SimpleEntry
      }
    `;
    const { diagnostics } = validate(source);
    const codes = diagnostics.map((d) => d.code).sort();
    expect(codes).toEqual(["AX705", "AX706", "AX707"]);
  });

  it("accepts a complete TimelineProvider", () => {
    const source = `
      import WidgetKit

      struct Provider: TimelineProvider {
          typealias Entry = SimpleEntry
          func placeholder(in context: Context) -> Entry { .init() }
          func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { }
          func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) { }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

// ─── AX708–AX711: other SwiftUI property wrappers must be var ───────

describe("swift validator — AX708–AX711 property wrapper var", () => {
  it("flags @Binding let", () => {
    const source = `
      struct Row: View {
          @Binding let isOn: Bool
          var body: some View { Toggle("x", isOn: $isOn) }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX708")).toBe(true);
  });

  it("flags @ObservedObject let", () => {
    const source = `
      struct Row: View {
          @ObservedObject let model: ViewModel
          var body: some View { EmptyView() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX709")).toBe(true);
  });

  it("flags @StateObject let", () => {
    const source = `
      struct Row: View {
          @StateObject let model = ViewModel()
          var body: some View { EmptyView() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX710")).toBe(true);
  });

  it("flags @EnvironmentObject let", () => {
    const source = `
      struct Row: View {
          @EnvironmentObject let theme: Theme
          var body: some View { EmptyView() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX711")).toBe(true);
  });

  it("accepts correct var declarations", () => {
    const source = `
      import SwiftUI

      struct Row: View {
          @Binding var isOn: Bool
          @ObservedObject var model: ViewModel
          @StateObject var state = State()
          @EnvironmentObject var theme: Theme
          var body: some View { EmptyView() }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

// ─── AX712: AppShortcutsProvider ────────────────────────────────────

describe("swift validator — AX712 AppShortcutsProvider", () => {
  it("flags a provider missing appShortcuts", () => {
    const source = `
      struct Shortcuts: AppShortcutsProvider { }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX712")).toBe(true);
  });

  it("accepts a provider with appShortcuts", () => {
    const source = `
      import AppIntents

      struct Shortcuts: AppShortcutsProvider {
          static var appShortcuts: [AppShortcut] { [] }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

// ─── AX713: TimelineEntry.date ──────────────────────────────────────

describe("swift validator — AX713 TimelineEntry.date", () => {
  it("flags a TimelineEntry missing date", () => {
    const source = `
      struct Entry: TimelineEntry {
          let value: Int
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX713")).toBe(true);
  });

  it("accepts a TimelineEntry with date", () => {
    const source = `
      import WidgetKit

      struct Entry: TimelineEntry {
          let date: Date
          let value: Int
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });

  it("flags a TimelineEntry with duplicate date fields", () => {
    const source = `
      import WidgetKit

      struct Entry: TimelineEntry {
          let date: Date
          let date: Date
          let value: Int
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX750")).toBe(true);
  });
});

describe("swift validator — AX737 duplicate stored properties", () => {
  it("flags duplicate stored properties in generated Swift structs", () => {
    const source = `
      import SwiftUI

      struct MissionCard: View {
          var title: String
          var title: String

          var body: some View {
              Text(title)
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX737");
    expect(diagnostic?.message).toContain("title");
    expect(diagnostic?.suggestion).toContain("Remove the duplicate");
  });

  it("does not flag computed body properties as duplicate stored state", () => {
    const source = `
      import SwiftUI

      struct MissionCard: View {
          var title: String

          var body: some View {
              VStack {
                  Text(title)
              }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX737")).toHaveLength(
      0
    );
  });
});

// ─── AX714: App.body ────────────────────────────────────────────────

describe("swift validator — AX714 App.body", () => {
  it("flags an App struct missing var body: some Scene", () => {
    const source = `
      @main
      struct MyApp: App { }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX714")).toBe(true);
  });

  it("accepts an App with a scene body", () => {
    const source = `
      import SwiftUI

      @main
      struct MyApp: App {
          var body: some Scene {
              WindowGroup { ContentView() }
          }
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
  });
});

// ─── AX715: empty AppIntent description (warning) ──────────────────

describe("swift validator — AX715 empty AppIntent description", () => {
  it("warns on an empty description", () => {
    const source = `
      struct LogEvent: AppIntent {
          static var title: LocalizedStringResource = "Log Event"
          static var description = IntentDescription("")
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX715")).toBe(true);
  });

  it("does not warn when description is populated", () => {
    const source = `
      struct LogEvent: AppIntent {
          static var title: LocalizedStringResource = "Log Event"
          static var description = IntentDescription("Records an event for later review")
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX715")).toHaveLength(
      0
    );
  });
});

// ─── AX716–AX719: imports and AppIntent input coverage ──────────────

describe("swift validator — AX716 missing import AppIntents", () => {
  it("flags AppIntent files without import AppIntents", () => {
    const source = `
      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX716")).toBe(true);
  });

  it("accepts AppIntent files with import AppIntents", () => {
    const source = `
      import AppIntents

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX716")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX717 missing import WidgetKit", () => {
  it("flags Widget files without import WidgetKit", () => {
    const source = `
      import SwiftUI

      struct WeatherWidget: Widget {
          var body: some WidgetConfiguration {
              StaticConfiguration(kind: "Weather", provider: Provider()) { entry in
                  Text("Hi")
              }
          }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX717")).toBe(true);
  });

  it("accepts Widget files with import WidgetKit", () => {
    const source = `
      import SwiftUI
      import WidgetKit

      struct WeatherWidget: Widget {
          var body: some WidgetConfiguration {
              StaticConfiguration(kind: "Weather", provider: Provider()) { entry in
                  Text("Hi")
              }
          }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX717")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX718 missing import SwiftUI", () => {
  it("flags View files without import SwiftUI", () => {
    const source = `
      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX718")).toBe(true);
  });

  it("accepts View files with import SwiftUI", () => {
    const source = `
      import SwiftUI

      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX718")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX738 missing import AppKit", () => {
  it("warns when AppKit types are used without importing AppKit", () => {
    const source = `
      import Foundation

      final class ClipboardStore {
          func copy(_ value: String) {
              NSPasteboard.general.clearContents()
              NSPasteboard.general.setString(value, forType: .string)
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX738");
    expect(diagnostic?.message).toContain("NSPasteboard");
    expect(diagnostic?.suggestion).toContain("import AppKit");
  });

  it("accepts AppKit usage when AppKit is imported", () => {
    const source = `
      import AppKit

      final class ClipboardStore {
          func copy(_ value: String) {
              NSPasteboard.general.clearContents()
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX738")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX719 missing @Parameter on AppIntent inputs", () => {
  it("flags instance properties without @Parameter when they look like intent inputs", () => {
    const source = `
      import AppIntents

      struct TrailCheck: AppIntent {
          static var title: LocalizedStringResource = "Trail Check"
          var trailName: String
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.some((d) => d.code === "AX719")).toBe(true);
  });

  it("accepts AppIntent inputs annotated with @Parameter", () => {
    const source = `
      import AppIntents

      struct TrailCheck: AppIntent {
          static var title: LocalizedStringResource = "Trail Check"
          @Parameter(title: "Trail")
          var trailName: String
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX719")).toHaveLength(
      0
    );
  });

  it("does not flag initialized internal state or openAppWhenRun", () => {
    const source = `
      import AppIntents

      struct TrailCheck: AppIntent {
          static var title: LocalizedStringResource = "Trail Check"
          var openAppWhenRun = true
          let logger: Logger = Logger()
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX719")).toHaveLength(
      0
    );
  });

  it("flags @State inside AppIntent even when initialized", () => {
    const source = `
      import AppIntents
      import SwiftUI

      struct TrailCheck: AppIntent {
          static var title: LocalizedStringResource = "Trail Check"
          @State var trailName: String = ""
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX719");
    expect(diagnostic?.message).toContain("uses @State");
  });
});

describe("swift validator — AX735 ObservationIgnored navigation state", () => {
  it("warns when an @Observable coordinator hides navigator state from SwiftUI", () => {
    const source = `
      import SwiftUI

      @Observable @MainActor
      final class RootCoordinator {
          @ObservationIgnored let navigator: ProjectRoomNavigator
          @ObservationIgnored let service: MarkdownFileService

          init(navigator: ProjectRoomNavigator, service: MarkdownFileService) {
              self.navigator = navigator
              self.service = service
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX735");
    expect(diagnostic?.message).toContain("navigator");
    expect(diagnostic?.suggestion).toContain("Remove @ObservationIgnored");
  });

  it("does not warn for ignored service dependencies", () => {
    const source = `
      import SwiftUI

      @Observable @MainActor
      final class RootCoordinator {
          @ObservationIgnored let fileService: MarkdownFileService

          init(fileService: MarkdownFileService) {
              self.fileService = fileService
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX735")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX736 accessibility identifier propagation", () => {
  it("warns when a container and nested controls both define accessibility identifiers", () => {
    const source = `
      import SwiftUI

      struct MainSwarmWindow: View {
          var body: some View {
              VStack {
                  Button("Back") {}
                      .accessibilityIdentifier("back-to-workspace")
              }
              .padding()
              .accessibilityIdentifier("project-room")
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX736");
    expect(diagnostic?.message).toContain("VStack");
    expect(diagnostic?.suggestion).toContain("specific button");
  });

  it("does not warn when only the nested control has an identifier", () => {
    const source = `
      import SwiftUI

      struct MainSwarmWindow: View {
          var body: some View {
              VStack {
                  Button("Back") {}
                      .accessibilityIdentifier("back-to-workspace")
              }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX736")).toHaveLength(
      0
    );
  });

  it("does not warn for a container identifier without nested identifiers", () => {
    const source = `
      import SwiftUI

      struct WorkspaceHome: View {
          var body: some View {
              ScrollView {
                  Text("Workspace")
              }
              .accessibilityIdentifier("workspace-home")
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX736")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX739 undeclared SwiftUI body references", () => {
  it("flags body references to missing view state", () => {
    const source = `
      import SwiftUI

      struct DiscoverView: View {
          var body: some View {
              VStack {
                  Text("Agents")
              }
              .opacity(agentsAppeared ? 1 : 0)
              .animation(.easeOut, value: agentsAppeared)
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX739");
    expect(diagnostic?.message).toContain("agentsAppeared");
    expect(diagnostic?.suggestion).toContain("@State");
  });

  it("accepts declared properties and local closure variables", () => {
    const source = `
      import SwiftUI

      struct DiscoverView: View {
          @State private var agentsAppeared = false
          let titles = ["One", "Two"]

          var body: some View {
              VStack {
                  ForEach(titles, id: \\.self) { title in
                      Text(title)
                  }
              }
              .opacity(agentsAppeared ? 1 : 0)
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });

  it("accepts tuple closure parameters in ForEach bodies", () => {
    const source = `
      import SwiftUI

      struct HomeFeedView: View {
          let posts = ["Launch", "Build"]

          var body: some View {
              VStack {
                  ForEach(Array(posts.enumerated()), id: \\.offset) { index, post in
                      Text("\\(index): \\(post)")
                  }
              }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });

  it("accepts modifier closure parameters like onChange values", () => {
    const source = `
      import SwiftUI

      struct ProjectImportProgressView: View {
          @State private var phase = "idle"

          var body: some View {
              Text(phase)
                  .onChange(of: phase) { _, newPhase in
                      if newPhase == "complete" {
                          print(newPhase)
                      }
                  }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });

  it("ignores lowercase words that appear only inside string literals", () => {
    const source = `
      import SwiftUI

      struct ProjectMembersView: View {
          let role = "Admin"

          var body: some View {
              VStack {
                  Button {
                      let label = "\\(role) invite"
                      print(label)
                      print("invite")
                  } label: {
                      Text("Send invite")
                  }
                  .tag("invite")
              }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });

  it("accepts private helper methods declared on the view", () => {
    const source = `
      import SwiftUI

      struct OverlayView: View {
          var body: some View {
              ZStack {
                  detailOverlayScrim()
                  detailCloseButton()
              }
          }

          @ViewBuilder
          private func detailOverlayScrim() -> some View {
              Color.black.opacity(0.2)
          }

          private func detailCloseButton() -> some View {
              Button("Close") {}
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });

  it("accepts private helper methods invoked with trailing closures", () => {
    const source = `
      import SwiftUI

      struct HomeFeedView: View {
          @State private var selectedPost: String?

          var body: some View {
              ZStack {
                  if selectedPost != nil {
                      detailOverlayScrim {
                          selectedPost = nil
                      }
                      detailCloseButton {
                          selectedPost = nil
                      }
                  }
              }
          }

          @ViewBuilder
          private func detailOverlayScrim(_ dismiss: @escaping () -> Void) -> some View {
              Color.black.opacity(0.24)
                  .onTapGesture(perform: dismiss)
          }

          private func detailCloseButton(_ dismiss: @escaping () -> Void) -> some View {
              Button("Close", action: dismiss)
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX739")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX764 input overlay hit testing", () => {
  it("warns when a text input overlay can block hit testing", () => {
    const source = `
      import SwiftUI

      struct ComposerView: View {
          @State private var draft = ""

          var body: some View {
              TextEditor(text: $draft)
                  .frame(minHeight: 120)
                  .overlay(alignment: .topLeading) {
                      if draft.isEmpty {
                          Text("Write a comment")
                              .padding(.top, 12)
                              .padding(.leading, 16)
                      }
                  }
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX764");
    expect(diagnostic?.message).toContain("TextEditor");
    expect(diagnostic?.suggestion).toContain("allowsHitTesting(false)");
  });

  it("does not warn when the overlay explicitly disables hit testing", () => {
    const source = `
      import SwiftUI

      struct ComposerView: View {
          @State private var draft = ""

          var body: some View {
              TextEditor(text: $draft)
                  .frame(minHeight: 120)
                  .overlay(alignment: .topLeading) {
                      if draft.isEmpty {
                          Text("Write a comment")
                              .padding(.top, 12)
                              .padding(.leading, 16)
                              .allowsHitTesting(false)
                      }
                  }
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX764")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX765 SwiftUI frame overload parity", () => {
  it("flags maxWidth plus fixed height in a single frame modifier", () => {
    const source = `
      import SwiftUI

      struct DiscoverCard: View {
          var body: some View {
              VStack(alignment: .leading) {
                  Text("Marketplace")
              }
              .frame(maxWidth: .infinity, height: 320, alignment: .topLeading)
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX765");
    expect(diagnostic?.message).toContain("frame(maxWidth:height:alignment:)");
    expect(diagnostic?.suggestion).toContain("frame(height:alignment:)");
  });

  it("accepts chained flexible width and fixed height frame modifiers", () => {
    const source = `
      import SwiftUI

      struct DiscoverCard: View {
          var body: some View {
              VStack(alignment: .leading) {
                  Text("Marketplace")
              }
              .frame(maxWidth: .infinity, alignment: .topLeading)
              .frame(height: 320, alignment: .topLeading)
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX765")).toHaveLength(
      0
    );
  });
});

describe("swift validator — AX766 type-erased SwiftUI modifier chains", () => {
  it("warns when a project-specific modifier follows Label labelStyle", () => {
    const source = `
      import SwiftUI

      struct NewChatButton: View {
          var body: some View {
              Label("New Chat", systemImage: "plus")
                  .labelStyle(.iconOnly)
                  .swarmIcon(size: 18)
          }
      }
    `;

    const diagnostic = validate(source).diagnostics.find((d) => d.code === "AX766");
    expect(diagnostic?.message).toContain("swarmIcon");
    expect(diagnostic?.message).toContain("labelStyle");
    expect(diagnostic?.suggestion).toContain("Move the project-specific modifier");
  });

  it("accepts the project-specific modifier before the type-erasing modifier", () => {
    const source = `
      import SwiftUI

      struct NewChatButton: View {
          var body: some View {
              Label("New Chat", systemImage: "plus")
                  .swarmIcon(size: 18)
                  .labelStyle(.iconOnly)
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX766")).toHaveLength(
      0
    );
  });

  it("accepts known SwiftUI modifiers after labelStyle", () => {
    const source = `
      import SwiftUI

      struct NewChatButton: View {
          var body: some View {
              Label("New Chat", systemImage: "plus")
                  .labelStyle(.iconOnly)
                  .font(.headline)
                  .accessibilityIdentifier("new-chat")
          }
      }
    `;

    expect(validate(source).diagnostics.filter((d) => d.code === "AX766")).toHaveLength(
      0
    );
  });
});

// ─── AX780 — Top-level symbol redeclaration across files ─────────────

describe("swift validator — AX780 top-level redeclaration", () => {
  it("flags two files declaring the same top-level struct in the same module", () => {
    const fileA = `
      import SwiftUI

      struct FlowLayout: Layout {
          var spacing: CGFloat = 8
      }
    `;
    const fileB = `
      import SwiftUI

      struct FlowLayout: Layout {
          var spacing: CGFloat = 12
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "AgentMarketplaceView.swift", source: fileA },
      { file: "BuilderPublicProfileView.swift", source: fileB },
    ]).flatMap((r) => r.diagnostics);

    const ax780 = diagnostics.filter((d) => d.code === "AX780");
    expect(ax780).toHaveLength(1);
    expect(ax780[0]!.file).toBe("BuilderPublicProfileView.swift");
    expect(ax780[0]!.message).toContain("FlowLayout");
    expect(ax780[0]!.message).toContain("AgentMarketplaceView.swift");
  });

  it("does not flag extensions declared in two files (extensions are allowed to repeat)", () => {
    const fileA = `
      extension String {
          var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
      }
    `;
    const fileB = `
      extension String {
          var slug: String { lowercased() }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "StringTrim.swift", source: fileA },
      { file: "StringSlug.swift", source: fileB },
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX780")).toEqual([]);
  });

  it("does not flag file-private declarations with the same name in different files", () => {
    const fileA = `
      private struct LocalCard: View {
          var body: some View { Text("a") }
      }
    `;
    const fileB = `
      private struct LocalCard: View {
          var body: some View { Text("b") }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "ScreenA.swift", source: fileA },
      { file: "ScreenB.swift", source: fileB },
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX780")).toEqual([]);
  });

  it("does not flag a nested type sharing the name of another file's top-level type", () => {
    const fileA = `
      struct Card: View {
          var body: some View { Text("top") }
      }
    `;
    const fileB = `
      enum Wrapper {
          struct Card {
              let title: String
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "Card.swift", source: fileA },
      { file: "Wrapper.swift", source: fileB },
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX780")).toEqual([]);
  });

  it("flags the second and third occurrences when a type is declared in three files", () => {
    const make = (label: string) => `struct Token { let value: String /* ${label} */ }`;
    const diagnostics = validateSwiftSources([
      { file: "A.swift", source: make("A") },
      { file: "B.swift", source: make("B") },
      { file: "C.swift", source: make("C") },
    ]).flatMap((r) => r.diagnostics);

    const ax780 = diagnostics.filter((d) => d.code === "AX780");
    expect(ax780.map((d) => d.file)).toEqual(["B.swift", "C.swift"]);
  });
});

// ─── AX781 — Cross-file optional argument mismatch ───────────────────

describe("swift validator — AX781 cross-file optional arg", () => {
  it("flags an optional struct field passed to a non-optional parameter", () => {
    const brand = `
      struct BrandKit {
          let primaryColorHex: String?
          let backgroundColorHex: String?
      }
    `;
    const studio = `
      import SwiftUI

      struct ProjectBrandStudioView: View {
          let brand: BrandKit

          func parseHex(_ raw: String) -> UInt32? {
              return UInt32(raw, radix: 16)
          }

          var body: some View {
              let primary = parseHex(brand.primaryColorHex)
              return Text(String(describing: primary))
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "BrandKit.swift", source: brand },
      { file: "ProjectBrandStudioView.swift", source: studio },
    ]).flatMap((r) => r.diagnostics);

    const ax781 = diagnostics.filter((d) => d.code === "AX781");
    expect(ax781.length).toBeGreaterThanOrEqual(1);
    expect(ax781[0]!.file).toBe("ProjectBrandStudioView.swift");
    expect(ax781[0]!.message).toContain("parseHex");
    expect(ax781[0]!.message).toContain("primaryColorHex");
    expect(ax781[0]!.message).toContain("BrandKit.swift");
  });

  it("does not flag a non-optional field passed to a non-optional parameter", () => {
    const brand = `
      struct BrandKit {
          let primaryColorHex: String
      }
    `;
    const studio = `
      import SwiftUI

      struct ProjectBrandStudioView: View {
          let brand: BrandKit

          func parseHex(_ raw: String) -> UInt32? {
              return UInt32(raw, radix: 16)
          }

          var body: some View {
              let _ = parseHex(brand.primaryColorHex)
              return Text("ok")
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "BrandKit.swift", source: brand },
      { file: "ProjectBrandStudioView.swift", source: studio },
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX781")).toEqual([]);
  });

  it("does not flag when the parameter type is optional", () => {
    const brand = `
      struct BrandKit {
          let primaryColorHex: String?
      }
    `;
    const studio = `
      import SwiftUI

      struct ProjectBrandStudioView: View {
          let brand: BrandKit

          func parseHex(_ raw: String?) -> UInt32? {
              return raw.flatMap { UInt32($0, radix: 16) }
          }

          var body: some View {
              let _ = parseHex(brand.primaryColorHex)
              return Text("ok")
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "BrandKit.swift", source: brand },
      { file: "ProjectBrandStudioView.swift", source: studio },
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX781")).toEqual([]);
  });
});

// ─── AX768 noise — system-type member resolution ─────────────────────

describe("swift validator — AX768 system-type silencing", () => {
  // The cross-file member check only runs with ≥2 inputs, so each test
  // pairs the file under inspection with a small sibling.
  const sibling = {
    file: "Sibling.swift",
    source: "struct Sibling { let value: String }",
  };

  it("does not flag NSWindow members during partial validation", () => {
    const source = `
      import AppKit
      import SwiftUI

      struct WindowChrome {
          let window: NSWindow

          func tune() {
              window.titlebarAppearsTransparent = true
              window.delegate = nil
              _ = window.contentView
              _ = window.minSize
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "WindowChrome.swift", source },
      sibling,
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX768")).toEqual([]);
  });

  it("still flags real undeclared members on user types", () => {
    const source = `
      struct ShareCardStyle {
          let detail: String
      }
      struct LaunchCenterView {
          let style: ShareCardStyle
          func render() -> String {
              return style.nonexistentMember
          }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "LaunchCenterView.swift", source },
      sibling,
    ]).flatMap((r) => r.diagnostics);

    const ax768 = diagnostics.filter((d) => d.code === "AX768");
    expect(ax768.length).toBeGreaterThanOrEqual(1);
    expect(ax768[0]!.message).toContain("nonexistentMember");
  });

  it("recognizes Foundation URL members during partial validation", () => {
    const source = `
      struct LinkPreview {
          let url: URL
          var host: String? { url.host }
          var ext: String { url.pathExtension }
      }
    `;
    const diagnostics = validateSwiftSources([
      { file: "LinkPreview.swift", source },
      sibling,
    ]).flatMap((r) => r.diagnostics);

    expect(diagnostics.filter((d) => d.code === "AX768")).toEqual([]);
  });
});

// ─── AX782 — Dense View body without an affordance ───────────────────

describe("swift validator — AX782 dense view", () => {
  it("flags a ScrollView with eight stacked sections and no affordance", () => {
    const source = `
      import SwiftUI

      struct BrandBibleView: View {
          var body: some View {
              ScrollView {
                  VStack(spacing: 24) {
                      HeroBanner()
                      IntakeForm()
                      CommandStrip()
                      VoiceCard()
                      AssetsCard()
                      WordmarkCard()
                      LegalCard()
                      AdminCard()
                  }
              }
          }
      }
    `;
    const ax782 = validate(source).diagnostics.filter((d) => d.code === "AX782");
    expect(ax782).toHaveLength(1);
    expect(ax782[0]!.message).toContain("BrandBibleView");
  });

  it("does not flag a ScrollView with a segmented Picker affordance", () => {
    const source = `
      import SwiftUI

      struct BrandBibleView: View {
          @State var segment: BrandSegment = .voice
          var body: some View {
              ScrollView {
                  Picker("", selection: $segment) {
                      Text("Voice").tag(BrandSegment.voice)
                      Text("Assets").tag(BrandSegment.assets)
                      Text("Legal").tag(BrandSegment.legal)
                  }
                  .pickerStyle(.segmented)
                  VStack(spacing: 24) {
                      HeroBanner()
                      IntakeForm()
                      CommandStrip()
                      VoiceCard()
                      AssetsCard()
                      WordmarkCard()
                      LegalCard()
                      AdminCard()
                  }
              }
          }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX782")).toEqual([]);
  });

  it("does not flag a ScrollView with five sections", () => {
    const source = `
      import SwiftUI

      struct BrandBibleView: View {
          var body: some View {
              ScrollView {
                  VStack {
                      HeroBanner()
                      IntakeForm()
                      VoiceCard()
                      AssetsCard()
                      LegalCard()
                  }
              }
          }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX782")).toEqual([]);
  });

  it("does not flag a ScrollView guarded by DisclosureGroup", () => {
    const source = `
      import SwiftUI

      struct AdminPanelView: View {
          var body: some View {
              ScrollView {
                  DisclosureGroup("Power user") {
                      VStack {
                          HeroBanner()
                          IntakeForm()
                          CommandStrip()
                          VoiceCard()
                          AssetsCard()
                          WordmarkCard()
                          LegalCard()
                          AdminCard()
                      }
                  }
              }
          }
      }
    `;
    expect(validate(source).diagnostics.filter((d) => d.code === "AX782")).toEqual([]);
  });
});
