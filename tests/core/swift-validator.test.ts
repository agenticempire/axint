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
});

// ─── AX705–AX707: TimelineProvider methods ──────────────────────────

describe("swift validator — AX705–AX707 TimelineProvider methods", () => {
  it("flags all three missing methods", () => {
    const source = `
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
      struct Entry: TimelineEntry {
          let date: Date
          let value: Int
      }
    `;
    expect(validate(source).diagnostics).toHaveLength(0);
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
