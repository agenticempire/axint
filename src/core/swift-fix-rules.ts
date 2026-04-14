/**
 * Swift Fix Rules — single source of truth
 *
 * The TypeScript swift-fixer and the auto-generated AxintFixer.swift
 * shipped in the Xcode Source Editor Extension both read from this file.
 * If you add a mechanical fix here, it runs in both places.
 *
 * Two shapes are supported:
 *
 * - RegexFix: a find-and-replace that maps cleanly to NSRegularExpression
 *   on the Swift side. Use this for substitutions like
 *   `nonisolated var` → `nonisolated let` or `DispatchQueue.main.async` →
 *   `Task { @MainActor in`.
 *
 * - StructInjectFix: "find a struct declared with conformance X that
 *   doesn't contain `sentinel`, insert `stub` right after the opening
 *   brace". Used for AppIntent perform, Widget body, App scene body,
 *   TimelineEntry date, ActivityAttributes ContentState.
 *
 * Anything that needs multi-line logic or callbacks (adding @MainActor
 * above a class, unwrapping an await MainActor.run closure) stays in
 * swift-fixer.ts as bespoke code and is not portable to the extension.
 */

export interface RegexFix {
  readonly kind: "regex";
  readonly code: string;
  readonly description: string;
  /** JS regex source. The `g` flag is applied automatically. */
  readonly pattern: string;
  /** Replacement template — $1, $2 etc. work on both sides. */
  readonly replacement: string;
}

export interface StructInjectFix {
  readonly kind: "struct-inject";
  readonly code: string;
  readonly description: string;
  /** Conformance name to search for in the struct header, e.g. "AppIntent". */
  readonly conformance: string;
  /** If the struct body already contains this string, skip it. */
  readonly sentinel: string;
  /** Swift code to inject as the first statement inside the body. */
  readonly stub: string;
}

export type FixRule = RegexFix | StructInjectFix;

// ─── Regex fixes ────────────────────────────────────────────────────

export const REGEX_FIX_RULES: readonly RegexFix[] = [
  {
    kind: "regex",
    code: "AX703",
    description: "@State let → @State var",
    pattern: "(@State\\b[^=\\n]*?)\\blet(\\s+\\w+)",
    replacement: "$1var$2",
  },
  {
    kind: "regex",
    code: "AX708",
    description: "@Binding let → @Binding var",
    pattern: "(@Binding\\b[^=\\n]*?)\\blet(\\s+\\w+)",
    replacement: "$1var$2",
  },
  {
    kind: "regex",
    code: "AX709",
    description: "@ObservedObject let → @ObservedObject var",
    pattern: "(@ObservedObject\\b[^=\\n]*?)\\blet(\\s+\\w+)",
    replacement: "$1var$2",
  },
  {
    kind: "regex",
    code: "AX710",
    description: "@StateObject let → @StateObject var",
    pattern: "(@StateObject\\b[^=\\n]*?)\\blet(\\s+\\w+)",
    replacement: "$1var$2",
  },
  {
    kind: "regex",
    code: "AX711",
    description: "@EnvironmentObject let → @EnvironmentObject var",
    pattern: "(@EnvironmentObject\\b[^=\\n]*?)\\blet(\\s+\\w+)",
    replacement: "$1var$2",
  },
  {
    kind: "regex",
    code: "AX720",
    description: "DispatchQueue.main.async → Task { @MainActor in }",
    pattern: "\\bDispatchQueue\\.main\\.async\\s*(?:\\(\\s*execute\\s*:\\s*)?\\{",
    replacement: "Task { @MainActor in",
  },
  {
    kind: "regex",
    code: "AX727",
    description: "nonisolated var → nonisolated let",
    pattern: "\\bnonisolated\\s+var\\s+(\\w+)",
    replacement: "nonisolated let $1",
  },
  {
    kind: "regex",
    code: "AX734",
    description: "DispatchQueue.global().async → Task.detached",
    pattern:
      "\\bDispatchQueue\\.global\\([^)]*\\)\\.async\\s*(?:\\(\\s*execute\\s*:\\s*)?\\{",
    replacement: "Task.detached {",
  },
];

// ─── Struct-inject fixes ────────────────────────────────────────────

export const STRUCT_INJECT_FIX_RULES: readonly StructInjectFix[] = [
  {
    kind: "struct-inject",
    code: "AX701",
    description: "inject perform() stub into AppIntent",
    conformance: "AppIntent",
    sentinel: "func perform(",
    stub: `    func perform() async throws -> some IntentResult {
        return .result()
    }`,
  },
  {
    kind: "struct-inject",
    code: "AX702",
    description: "inject body into Widget",
    conformance: "Widget",
    sentinel: "var body",
    stub: `    var body: some WidgetConfiguration {
        EmptyWidgetConfiguration()
    }`,
  },
  {
    kind: "struct-inject",
    code: "AX704",
    description: "inject static title into AppIntent",
    conformance: "AppIntent",
    sentinel: "static var title",
    stub: `    static var title: LocalizedStringResource = "Intent"`,
  },
  {
    kind: "struct-inject",
    code: "AX713",
    description: "inject let date: Date into TimelineEntry",
    conformance: "TimelineEntry",
    sentinel: "let date",
    stub: `    let date: Date`,
  },
  {
    kind: "struct-inject",
    code: "AX714",
    description: "inject Scene body into App",
    conformance: "App",
    sentinel: "var body",
    stub: `    var body: some Scene {
        WindowGroup { ContentView() }
    }`,
  },
  {
    kind: "struct-inject",
    code: "AX740",
    description: "inject ContentState into ActivityAttributes",
    conformance: "ActivityAttributes",
    sentinel: "ContentState",
    stub: `    struct ContentState: Codable, Hashable {
        var progress: Double
    }`,
  },
];

export const ALL_FIX_RULES: readonly FixRule[] = [
  ...REGEX_FIX_RULES,
  ...STRUCT_INJECT_FIX_RULES,
];
