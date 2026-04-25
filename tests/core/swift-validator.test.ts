import { describe, it, expect } from "vitest";
import { validateSwiftSource } from "../../src/core/swift-validator.js";

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
