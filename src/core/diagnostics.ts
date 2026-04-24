/**
 * Axint Diagnostic Code Registry
 *
 * Central source of truth for all diagnostic codes in the compiler.
 * Range assignments:
 *   AX000–AX099: Intent parser + general
 *   AX100–AX199: Intent validator
 *   AX200–AX299: Intent generator
 *   AX300–AX399: View parser + validator
 *   AX400–AX499: Widget parser + validator
 *   AX500–AX599: App parser + validator
 *   AX600–AX699: Registry / auth
 *   AX700–AX799: Swift source validator (build-time)
 *   AX800–AX899: MCP server
 *   AX900–AX999: CLI
 */

export interface DiagnosticInfo {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  category: string;
}

export const DIAGNOSTIC_CODES: Record<string, DiagnosticInfo> = {
  // ─── Intent Parser (AX000–AX099) ─────────────────────────
  AX001: {
    code: "AX001",
    severity: "error",
    message: "No defineIntent() call found",
    category: "intent-parser",
  },
  AX002: {
    code: "AX002",
    severity: "error",
    message: "Missing required field: name",
    category: "intent-parser",
  },
  AX003: {
    code: "AX003",
    severity: "error",
    message: "Missing required field: title",
    category: "intent-parser",
  },
  AX004: {
    code: "AX004",
    severity: "error",
    message: "Missing required field: description",
    category: "intent-parser",
  },
  AX005: {
    code: "AX005",
    severity: "error",
    message: "Unknown param type",
    category: "intent-parser",
  },
  AX006: {
    code: "AX006",
    severity: "error",
    message: "params must be an object literal",
    category: "intent-parser",
  },
  AX007: {
    code: "AX007",
    severity: "error",
    message: "Parameter must use param.* helper",
    category: "intent-parser",
  },
  AX008: {
    code: "AX008",
    severity: "error",
    message: "param.* requires string description",
    category: "intent-parser",
  },
  AX015: {
    code: "AX015",
    severity: "error",
    message: "defineEntity() requires object literal",
    category: "entity-parser",
  },
  AX016: {
    code: "AX016",
    severity: "error",
    message: "Entity missing required field: name",
    category: "entity-parser",
  },
  AX017: {
    code: "AX017",
    severity: "error",
    message: "Entity missing required field: display",
    category: "entity-parser",
  },
  AX018: {
    code: "AX018",
    severity: "error",
    message: "Entity missing required field: query",
    category: "entity-parser",
  },
  AX019: {
    code: "AX019",
    severity: "error",
    message: "Invalid entity query type",
    category: "entity-parser",
  },
  AX020: {
    code: "AX020",
    severity: "error",
    message: "param.entity() requires entity name",
    category: "intent-parser",
  },
  AX021: {
    code: "AX021",
    severity: "error",
    message: "param.entity() name must be string",
    category: "intent-parser",
  },
  AX022: {
    code: "AX022",
    severity: "error",
    message: "param.dynamicOptions() requires args",
    category: "intent-parser",
  },
  AX023: {
    code: "AX023",
    severity: "error",
    message: "param.dynamicOptions() provider must be string",
    category: "intent-parser",
  },

  // ─── Intent Validator (AX100–AX199) ──────────────────────
  AX100: {
    code: "AX100",
    severity: "error",
    message: "Intent name must be PascalCase",
    category: "intent-validator",
  },
  AX101: {
    code: "AX101",
    severity: "error",
    message: "Intent title must not be empty",
    category: "intent-validator",
  },
  AX102: {
    code: "AX102",
    severity: "error",
    message: "Intent description must not be empty",
    category: "intent-validator",
  },
  AX103: {
    code: "AX103",
    severity: "error",
    message: "Parameter name is not a valid Swift identifier",
    category: "intent-validator",
  },
  AX104: {
    code: "AX104",
    severity: "warning",
    message: "Parameter has no description",
    category: "intent-validator",
  },
  AX105: {
    code: "AX105",
    severity: "warning",
    message: "Too many parameters",
    category: "intent-validator",
  },
  AX106: {
    code: "AX106",
    severity: "warning",
    message: "Title exceeds recommended length",
    category: "intent-validator",
  },
  AX107: {
    code: "AX107",
    severity: "error",
    message: "Duplicate parameter name",
    category: "intent-validator",
  },
  AX108: {
    code: "AX108",
    severity: "warning",
    message: "Entitlement does not look like a valid reverse-DNS identifier",
    category: "intent-validator",
  },
  AX109: {
    code: "AX109",
    severity: "warning",
    message: "Info.plist key does not match Apple's naming conventions",
    category: "intent-validator",
  },
  AX110: {
    code: "AX110",
    severity: "error",
    message: "Entity name must be PascalCase",
    category: "entity-validator",
  },
  AX111: {
    code: "AX111",
    severity: "error",
    message: "Entity must have at least one property",
    category: "entity-validator",
  },
  AX112: {
    code: "AX112",
    severity: "warning",
    message: "Display title does not reference an existing property",
    category: "entity-validator",
  },
  AX113: {
    code: "AX113",
    severity: "error",
    message: "Invalid entity query type",
    category: "entity-validator",
  },
  AX114: {
    code: "AX114",
    severity: "warning",
    message:
      "HealthKit entitlements were declared without matching privacy usage descriptions",
    category: "intent-validator",
  },
  AX115: {
    code: "AX115",
    severity: "warning",
    message:
      "HealthKit privacy usage descriptions were declared without the HealthKit entitlement",
    category: "intent-validator",
  },
  AX116: {
    code: "AX116",
    severity: "warning",
    message: "Privacy usage description is empty or still placeholder copy",
    category: "intent-validator",
  },
  AX117: {
    code: "AX117",
    severity: "warning",
    message:
      "HealthKit entitlement uses shorthand instead of the real Apple entitlement key",
    category: "intent-validator",
  },
  AX118: {
    code: "AX118",
    severity: "warning",
    message:
      "HealthKit Info.plist usage-description key uses shorthand instead of Apple's real key",
    category: "intent-validator",
  },

  // ─── Intent Generator (AX200–AX299) ──────────────────────
  AX200: {
    code: "AX200",
    severity: "error",
    message: "Generated Swift is missing import AppIntents",
    category: "intent-generator",
  },
  AX201: {
    code: "AX201",
    severity: "error",
    message: "Generated struct does not conform to AppIntent protocol",
    category: "intent-generator",
  },
  AX202: {
    code: "AX202",
    severity: "error",
    message: "Generated struct is missing the perform() function",
    category: "intent-generator",
  },

  // ─── View Parser (AX300–AX349) ──────────────────────────
  AX301: {
    code: "AX301",
    severity: "error",
    message: "No defineView() call found",
    category: "view-parser",
  },
  AX302: {
    code: "AX302",
    severity: "error",
    message: "Missing required field: name",
    category: "view-parser",
  },
  AX303: {
    code: "AX303",
    severity: "error",
    message: "props must be an object literal",
    category: "view-parser",
  },
  AX304: {
    code: "AX304",
    severity: "error",
    message: "View prop must use a prop.* helper",
    category: "view-parser",
  },
  AX305: {
    code: "AX305",
    severity: "error",
    message: "state must be an object literal",
    category: "view-parser",
  },
  AX306: {
    code: "AX306",
    severity: "error",
    message: "View state must use a state.* helper",
    category: "view-parser",
  },
  AX307: {
    code: "AX307",
    severity: "error",
    message: "Missing required field: body or body must be an array literal",
    category: "view-parser",
  },
  AX308: {
    code: "AX308",
    severity: "error",
    message: "View body element must be a view.* helper call",
    category: "view-parser",
  },
  AX309: {
    code: "AX309",
    severity: "error",
    message: "Unknown view element",
    category: "view-parser",
  },

  // ─── View Validator (AX310–AX399) ───────────────────────
  AX310: {
    code: "AX310",
    severity: "error",
    message: "View name must be PascalCase",
    category: "view-validator",
  },
  AX311: {
    code: "AX311",
    severity: "error",
    message: "View must have at least one body element",
    category: "view-validator",
  },
  AX312: {
    code: "AX312",
    severity: "error",
    message: "Prop name is not a valid Swift identifier",
    category: "view-validator",
  },
  AX313: {
    code: "AX313",
    severity: "error",
    message: "Duplicate prop name",
    category: "view-validator",
  },
  AX314: {
    code: "AX314",
    severity: "error",
    message: "State name is not a valid Swift identifier",
    category: "view-validator",
  },
  AX315: {
    code: "AX315",
    severity: "error",
    message: "State name conflicts with a prop of the same name",
    category: "view-validator",
  },
  AX316: {
    code: "AX316",
    severity: "warning",
    message: "Environment state has no environmentKey",
    category: "view-validator",
  },
  AX317: {
    code: "AX317",
    severity: "warning",
    message: "@State property has no default value",
    category: "view-validator",
  },
  AX318: {
    code: "AX318",
    severity: "error",
    message: "ForEach requires a collection expression",
    category: "view-validator",
  },
  AX319: {
    code: "AX319",
    severity: "error",
    message: "Conditional requires a condition expression",
    category: "view-validator",
  },
  AX320: {
    code: "AX320",
    severity: "error",
    message: "Generated Swift is missing import SwiftUI",
    category: "view-generator",
  },
  AX321: {
    code: "AX321",
    severity: "error",
    message: "Generated struct does not conform to View protocol",
    category: "view-generator",
  },
  AX322: {
    code: "AX322",
    severity: "error",
    message: "Generated struct is missing the body computed property",
    category: "view-generator",
  },

  // ─── Widget Parser (AX400–AX449) ─────────────────────────
  AX401: {
    code: "AX401",
    severity: "error",
    message: "No defineWidget() call found",
    category: "widget-parser",
  },
  AX402: {
    code: "AX402",
    severity: "error",
    message: "Missing required field: name",
    category: "widget-parser",
  },
  AX403: {
    code: "AX403",
    severity: "error",
    message: "Missing required field: displayName",
    category: "widget-parser",
  },
  AX404: {
    code: "AX404",
    severity: "error",
    message: "families must be array literal",
    category: "widget-parser",
  },
  AX405: {
    code: "AX405",
    severity: "error",
    message: "entry must be object literal",
    category: "widget-parser",
  },
  AX406: {
    code: "AX406",
    severity: "error",
    message: "Entry field must use entry.* helper",
    category: "widget-parser",
  },
  AX407: {
    code: "AX407",
    severity: "error",
    message: "body must be array literal",
    category: "widget-parser",
  },
  AX408: {
    code: "AX408",
    severity: "error",
    message: "Body element must use view.* helper",
    category: "widget-parser",
  },
  AX409: {
    code: "AX409",
    severity: "error",
    message: "Unknown view element in widget",
    category: "widget-parser",
  },
  AX411: {
    code: "AX411",
    severity: "error",
    message: "Invalid widget family",
    category: "widget-parser",
  },
  AX412: {
    code: "AX412",
    severity: "error",
    message: "body must be array literal",
    category: "widget-parser",
  },
  AX414: {
    code: "AX414",
    severity: "error",
    message: "Duplicate entry field",
    category: "widget-parser",
  },

  // ─── Widget Validator (AX410–AX499) ──────────────────────
  AX410: {
    code: "AX410",
    severity: "error",
    message: "Widget name must be PascalCase",
    category: "widget-validator",
  },
  AX411V: {
    code: "AX411",
    severity: "error",
    message: "Widget must have at least one supported family",
    category: "widget-validator",
  },
  AX412V: {
    code: "AX412",
    severity: "error",
    message: "Widget must have a non-empty body",
    category: "widget-validator",
  },
  AX413: {
    code: "AX413",
    severity: "error",
    message: "Invalid entry field name",
    category: "widget-validator",
  },
  AX415: {
    code: "AX415",
    severity: "error",
    message: "displayName must not be empty",
    category: "widget-validator",
  },
  AX420: {
    code: "AX420",
    severity: "error",
    message: "Generated widget code must import WidgetKit",
    category: "widget-generator",
  },
  AX421: {
    code: "AX421",
    severity: "error",
    message: "Generated widget struct must conform to Widget protocol",
    category: "widget-generator",
  },
  AX422: {
    code: "AX422",
    severity: "error",
    message: "Generated provider struct must conform to TimelineProvider protocol",
    category: "widget-generator",
  },

  // ─── App Parser (AX500–AX549) ────────────────────────────
  AX501: {
    code: "AX501",
    severity: "error",
    message: "No defineApp() call found",
    category: "app-parser",
  },
  AX502: {
    code: "AX502",
    severity: "error",
    message: "defineApp() requires name",
    category: "app-parser",
  },
  AX503: {
    code: "AX503",
    severity: "error",
    message: "defineApp() requires scenes array",
    category: "app-parser",
  },
  AX504: {
    code: "AX504",
    severity: "error",
    message: "Scene must be object literal",
    category: "app-parser",
  },
  AX505: {
    code: "AX505",
    severity: "error",
    message: "Invalid scene kind",
    category: "app-parser",
  },
  AX506: {
    code: "AX506",
    severity: "error",
    message: "Scene requires view property",
    category: "app-parser",
  },

  // ─── App Validator (AX510–AX599) ────────────────────────
  AX510: {
    code: "AX510",
    severity: "error",
    message: "App name must be PascalCase",
    category: "app-validator",
  },
  AX511: {
    code: "AX511",
    severity: "error",
    message: "App must have at least one scene",
    category: "app-validator",
  },
  AX512: {
    code: "AX512",
    severity: "error",
    message: "Duplicate scene name",
    category: "app-validator",
  },
  AX513: {
    code: "AX513",
    severity: "warning",
    message: "Scene view should be PascalCase",
    category: "app-validator",
  },
  AX514: {
    code: "AX514",
    severity: "info",
    message: "Settings scene is macOS-only, consider adding platform guard",
    category: "app-validator",
  },
  AX515: {
    code: "AX515",
    severity: "warning",
    message: "Multiple unnamed WindowGroup scenes may be ambiguous",
    category: "app-validator",
  },
  AX520: {
    code: "AX520",
    severity: "error",
    message: "Generated Swift is missing @main attribute",
    category: "app-generator",
  },
  AX521: {
    code: "AX521",
    severity: "error",
    message: "Generated struct does not conform to App protocol",
    category: "app-generator",
  },
  AX522: {
    code: "AX522",
    severity: "error",
    message: "Generated App is missing var body: some Scene",
    category: "app-generator",
  },

  // ─── Swift Source Validator (AX700–AX799) ────────────────
  AX701: {
    code: "AX701",
    severity: "error",
    message: "AppIntent is missing perform() function",
    category: "swift-validator",
  },
  AX702: {
    code: "AX702",
    severity: "error",
    message: "Widget is missing var body: some WidgetConfiguration",
    category: "swift-validator",
  },
  AX703: {
    code: "AX703",
    severity: "error",
    message: "@State property must be declared with 'var', not 'let'",
    category: "swift-validator",
  },
  AX704: {
    code: "AX704",
    severity: "error",
    message:
      "AppIntent title must be declared as static var title: LocalizedStringResource",
    category: "swift-validator",
  },
  AX705: {
    code: "AX705",
    severity: "error",
    message: "TimelineProvider is missing placeholder(in:)",
    category: "swift-validator",
  },
  AX706: {
    code: "AX706",
    severity: "error",
    message: "TimelineProvider is missing getSnapshot(in:completion:)",
    category: "swift-validator",
  },
  AX707: {
    code: "AX707",
    severity: "error",
    message: "TimelineProvider is missing getTimeline(in:completion:)",
    category: "swift-validator",
  },
  AX708: {
    code: "AX708",
    severity: "error",
    message: "@Binding property must be declared with 'var', not 'let'",
    category: "swift-validator",
  },
  AX709: {
    code: "AX709",
    severity: "error",
    message: "@ObservedObject property must be declared with 'var', not 'let'",
    category: "swift-validator",
  },
  AX710: {
    code: "AX710",
    severity: "error",
    message: "@StateObject property must be declared with 'var', not 'let'",
    category: "swift-validator",
  },
  AX711: {
    code: "AX711",
    severity: "error",
    message: "@EnvironmentObject property must be declared with 'var', not 'let'",
    category: "swift-validator",
  },
  AX712: {
    code: "AX712",
    severity: "error",
    message: "AppShortcutsProvider is missing static var appShortcuts: [AppShortcut]",
    category: "swift-validator",
  },
  AX713: {
    code: "AX713",
    severity: "error",
    message: "TimelineEntry is missing 'let date: Date'",
    category: "swift-validator",
  },
  AX750: {
    code: "AX750",
    severity: "error",
    message: "TimelineEntry declares duplicate 'let date: Date' properties",
    category: "swift-validator",
  },
  AX714: {
    code: "AX714",
    severity: "error",
    message: "@main App struct is missing 'var body: some Scene'",
    category: "swift-validator",
  },
  AX715: {
    code: "AX715",
    severity: "warning",
    message: "AppIntent description is missing or empty",
    category: "swift-validator",
  },
  AX716: {
    code: "AX716",
    severity: "error",
    message: "Missing import AppIntents for AppIntent or AppShortcutsProvider types",
    category: "swift-validator",
  },
  AX717: {
    code: "AX717",
    severity: "error",
    message:
      "Missing import WidgetKit for Widget, TimelineProvider, or TimelineEntry types",
    category: "swift-validator",
  },
  AX718: {
    code: "AX718",
    severity: "error",
    message: "Missing import SwiftUI for View or App types",
    category: "swift-validator",
  },
  AX719: {
    code: "AX719",
    severity: "error",
    message: "AppIntent input properties should use @Parameter",
    category: "swift-validator",
  },

  // ─── Swift 6 Concurrency (AX720–AX734) ──────────────────
  AX720: {
    code: "AX720",
    severity: "error",
    message: "DispatchQueue.main.async should be Task { @MainActor in } under Swift 6",
    category: "swift-concurrency",
  },
  AX721: {
    code: "AX721",
    severity: "error",
    message: "ObservableObject class should be annotated @MainActor",
    category: "swift-concurrency",
  },
  AX722: {
    code: "AX722",
    severity: "warning",
    message: "@Observable class with UI state should be annotated @MainActor",
    category: "swift-concurrency",
  },
  AX723: {
    code: "AX723",
    severity: "warning",
    message: "@unchecked Sendable bypasses the compiler's safety checks",
    category: "swift-concurrency",
  },
  AX724: {
    code: "AX724",
    severity: "error",
    message: "@MainActor is redundant inside an actor declaration",
    category: "swift-concurrency",
  },
  AX725: {
    code: "AX725",
    severity: "error",
    message: "'lazy var' is not allowed inside an actor",
    category: "swift-concurrency",
  },
  AX726: {
    code: "AX726",
    severity: "warning",
    message: "Task.detached without explicit isolation loses the current context",
    category: "swift-concurrency",
  },
  AX727: {
    code: "AX727",
    severity: "error",
    message: "'nonisolated var' must be 'let' for Sendable conformance",
    category: "swift-concurrency",
  },
  AX728: {
    code: "AX728",
    severity: "error",
    message: "Sendable class must be 'final'",
    category: "swift-concurrency",
  },
  AX729: {
    code: "AX729",
    severity: "warning",
    message: "async function inside a View struct can't be called from body",
    category: "swift-concurrency",
  },
  AX730: {
    code: "AX730",
    severity: "warning",
    message: "Redundant 'await MainActor.run' inside a @MainActor context",
    category: "swift-concurrency",
  },
  AX731: {
    code: "AX731",
    severity: "warning",
    message: "Task capturing self should use [weak self] to avoid retain cycles",
    category: "swift-concurrency",
  },
  AX732: {
    code: "AX732",
    severity: "warning",
    message: "actor deinit cannot touch actor-isolated state",
    category: "swift-concurrency",
  },
  AX733: {
    code: "AX733",
    severity: "info",
    message:
      "@MainActor on a View struct is redundant — SwiftUI views are main-actor isolated",
    category: "swift-concurrency",
  },
  AX734: {
    code: "AX734",
    severity: "error",
    message: "DispatchQueue.global().async should be Task.detached { } under Swift 6",
    category: "swift-concurrency",
  },

  // ─── Live Activities / ActivityKit (AX740–AX749) ────────
  AX740: {
    code: "AX740",
    severity: "error",
    message: "ActivityAttributes is missing nested ContentState type",
    category: "swift-live-activities",
  },
  AX741: {
    code: "AX741",
    severity: "error",
    message: "ActivityAttributes.ContentState must conform to Codable",
    category: "swift-live-activities",
  },
  AX742: {
    code: "AX742",
    severity: "error",
    message: "ActivityAttributes.ContentState must conform to Hashable",
    category: "swift-live-activities",
  },
  AX743: {
    code: "AX743",
    severity: "error",
    message: "ActivityConfiguration is missing dynamicIsland { } closure",
    category: "swift-live-activities",
  },
  AX744: {
    code: "AX744",
    severity: "warning",
    message: "DynamicIsland expanded region is empty",
    category: "swift-live-activities",
  },
  AX745: {
    code: "AX745",
    severity: "error",
    message: "DynamicIsland is missing compactLeading region",
    category: "swift-live-activities",
  },
  AX746: {
    code: "AX746",
    severity: "error",
    message: "DynamicIsland is missing compactTrailing region",
    category: "swift-live-activities",
  },
  AX747: {
    code: "AX747",
    severity: "error",
    message: "DynamicIsland is missing minimal region",
    category: "swift-live-activities",
  },
  AX748: {
    code: "AX748",
    severity: "error",
    message: "File uses ActivityAttributes but is missing 'import ActivityKit'",
    category: "swift-live-activities",
  },
  AX749: {
    code: "AX749",
    severity: "warning",
    message: "Activity<>.request must be called from a @MainActor context",
    category: "swift-live-activities",
  },
};

export const DIAGNOSTIC_COUNT = Object.keys(DIAGNOSTIC_CODES).length;

export function getDiagnostic(code: string): DiagnosticInfo | undefined {
  return DIAGNOSTIC_CODES[code];
}

export function getCodesByCategory(category: string): DiagnosticInfo[] {
  return Object.values(DIAGNOSTIC_CODES).filter((d) => d.category === category);
}
