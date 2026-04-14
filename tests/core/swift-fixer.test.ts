import { describe, it, expect } from "vitest";
import { fixSwiftSource } from "../../src/core/swift-fixer.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";

function fix(source: string) {
  return fixSwiftSource(source, "test.swift");
}

describe("swift fixer — property wrapper let → var", () => {
  it("rewrites @State let to @State var", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("@State var count");
    expect(result.fixed.some((d) => d.code === "AX703")).toBe(true);
    expect(result.remaining.filter((d) => d.code === "AX703")).toHaveLength(0);
  });

  it("rewrites @Binding, @ObservedObject, @StateObject, @EnvironmentObject in one pass", () => {
    const source = `
      struct Row: View {
          @Binding let isOn: Bool
          @ObservedObject let model: ViewModel
          @StateObject let state = State()
          @EnvironmentObject let theme: Theme
          var body: some View { EmptyView() }
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("@Binding var isOn");
    expect(result.source).toContain("@ObservedObject var model");
    expect(result.source).toContain("@StateObject var state");
    expect(result.source).toContain("@EnvironmentObject var theme");
    expect(validateSwiftSource(result.source, "test.swift").diagnostics).toHaveLength(0);
  });
});

describe("swift fixer — AppIntent injections", () => {
  it("injects perform() into an AppIntent that lacks one", () => {
    const source = `
      import AppIntents

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send Message"
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("func perform()");
    expect(result.fixed.some((d) => d.code === "AX701")).toBe(true);
    expect(result.remaining.filter((d) => d.code === "AX701")).toHaveLength(0);
  });

  it("injects a title into an AppIntent that lacks one", () => {
    const source = `
      struct LogEvent: AppIntent {
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("static var title: LocalizedStringResource");
    expect(result.fixed.some((d) => d.code === "AX704")).toBe(true);
  });
});

describe("swift fixer — Widget / App / TimelineEntry injections", () => {
  it("injects a body into a Widget", () => {
    const source = `
      struct WeatherWidget: Widget {
          let kind: String = "WeatherWidget"
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("var body: some WidgetConfiguration");
    expect(result.fixed.some((d) => d.code === "AX702")).toBe(true);
  });

  it("injects a Scene body into an App", () => {
    const source = `
      @main
      struct MyApp: App { }
    `;
    const result = fix(source);
    expect(result.source).toContain("var body: some Scene");
    expect(result.fixed.some((d) => d.code === "AX714")).toBe(true);
  });

  it("injects let date: Date into a TimelineEntry", () => {
    const source = `
      struct Entry: TimelineEntry {
          let value: Int
      }
    `;
    const result = fix(source);
    expect(result.source).toContain("let date: Date");
    expect(result.fixed.some((d) => d.code === "AX713")).toBe(true);
  });
});

describe("swift fixer — leaves non-mechanical issues alone", () => {
  it("does not touch sources that are already clean", () => {
    const source = `
      struct CounterView: View {
          @State var count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = fix(source);
    expect(result.source).toBe(source);
    expect(result.fixed).toHaveLength(0);
    expect(result.remaining).toHaveLength(0);
  });

  it("reports remaining warnings (e.g. AX715) without trying to invent copy", () => {
    const source = `
      struct LogEvent: AppIntent {
          static var title: LocalizedStringResource = "Log Event"
          static var description = IntentDescription("")
          func perform() async throws -> some IntentResult { .result() }
      }
    `;
    const result = fix(source);
    expect(result.fixed).toHaveLength(0);
    expect(result.remaining.some((d) => d.code === "AX715")).toBe(true);
  });
});

describe("swift fixer — multi-fix files", () => {
  it("handles a file with several different issues in one pass", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }

      struct SendMessage: AppIntent {
          static var title: LocalizedStringResource = "Send"
      }
    `;
    const result = fix(source);
    const codes = result.fixed.map((d) => d.code).sort();
    expect(codes).toEqual(["AX701", "AX703"]);
    expect(validateSwiftSource(result.source, "test.swift").diagnostics).toHaveLength(0);
  });
});
