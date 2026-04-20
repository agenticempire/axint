/**
 * Tool manifest returned by ListToolsRequestSchema.
 *
 * Pure declarative data — no logic. Lives in its own file so server.ts
 * stays focused on transport wiring and dispatch.
 */

export const TOOL_MANIFEST = [
  {
    name: "axint.feature",
    description:
      "Generate a complete Apple-native feature package from a description. " +
      "Returns multiple files: validated Swift source, companion widget/view, " +
      "Info.plist fragments, entitlements, and XCTest scaffolds — all structured " +
      "file-by-file so an Xcode agent can write each file directly into the " +
      "project. Designed for composition with Xcode MCP tools: call " +
      "axint.feature to generate the package, then use XcodeWrite to place " +
      "each file. No files written, no network requests, no side effects.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description:
            "What the feature does, in natural language. E.g., " +
            "'Let users log water intake via Siri' or " +
            "'Add a Spotlight-searchable recipe entity'. The description " +
            "is used to infer the feature name, domain, and parameters.",
        },
        surfaces: {
          type: "array",
          items: {
            type: "string",
            enum: ["intent", "view", "widget"],
          },
          description:
            "Which Apple surfaces to generate. 'intent' produces an App Intent " +
            "struct for Siri/Shortcuts/Spotlight. 'widget' produces a WidgetKit " +
            "widget with timeline provider. 'view' produces a SwiftUI view. " +
            "Defaults to ['intent'] if omitted. Combine surfaces to generate " +
            "a complete feature: ['intent', 'widget'] for a Siri action + " +
            "home screen widget.",
        },
        name: {
          type: "string",
          description:
            "PascalCase feature name, e.g., 'LogWaterIntake'. If omitted, " +
            "inferred from the description. Used as the base name for all " +
            "generated Swift structs.",
        },
        appName: {
          type: "string",
          description:
            "The target app name, used in generated comments and test " +
            "references. E.g., 'HealthTracker'. Optional.",
        },
        domain: {
          type: "string",
          description:
            "Apple App Intent domain. One of: messaging, productivity, health, " +
            "finance, commerce, media, navigation, smart-home. If omitted, " +
            "inferred from the description. Determines default entitlements, " +
            "Info.plist keys, and parameter suggestions.",
        },
        params: {
          type: "object",
          description:
            "Explicit parameter definitions as { fieldName: typeString }. " +
            "E.g., { amount: 'double', unit: 'string' }. If omitted, " +
            "inferred from the domain and description. Types: string, int, " +
            "double, float, boolean, date, duration, url.",
          additionalProperties: {
            type: "string",
            description: "Swift type for this parameter",
          },
        },
      },
      required: ["description"],
    },
  },
  {
    name: "axint.suggest",
    description:
      "Suggest Apple-native features for an app based on its domain or " +
      "description. Returns a ranked list of features with recommended " +
      "surfaces (intent, widget, view), estimated complexity, and a " +
      "one-line description for each. Use this to discover what Axint " +
      "can generate for an app before calling axint.feature. No files " +
      "written, no network requests, no side effects.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        appDescription: {
          type: "string",
          description:
            "What the app does, in natural language. E.g., " +
            "'A fitness tracking app that logs workouts and counts steps' or " +
            "'A recipe app for discovering and saving meals'. Used to " +
            "suggest relevant Apple-native features.",
        },
        domain: {
          type: "string",
          description:
            "Primary app domain. One of: messaging, productivity, health, " +
            "finance, commerce, media, navigation, smart-home. If provided, " +
            "suggestions are tailored to this domain.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of suggestions to return. Defaults to 5. " +
            "Suggestions are ordered by estimated user impact.",
        },
      },
      required: ["appDescription"],
    },
  },
  {
    name: "axint.scaffold",
    description:
      "Generate a starter TypeScript intent file from a name and description. " +
      "Returns a complete defineIntent() source string ready to save as a .ts " +
      "file — no files are written, no network requests made. On invalid " +
      "domain values, returns an error string. The output compiles directly " +
      "with axint.compile. Use this when creating a new intent from scratch; " +
      "use axint.templates.get for a working reference example, or " +
      "axint.schema.compile to generate Swift without writing TypeScript.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description:
            "PascalCase intent name, e.g., 'SendMessage' or 'CreateEvent'. " +
            "Must start with an uppercase letter and contain no spaces.",
        },
        description: {
          type: "string",
          description:
            "Human-readable description of what the intent does, shown to " +
            "users in Shortcuts and Spotlight, e.g., 'Send a message to a contact'",
        },
        domain: {
          type: "string",
          description:
            "Apple App Intent domain. One of: messaging, productivity, health, " +
            "finance, commerce, media, navigation, smart-home. Omit if none apply.",
        },
        params: {
          type: "array",
          description:
            "Initial parameters for the intent. Each item needs name (camelCase), " +
            "type (string | int | double | float | boolean | date | duration | url), " +
            "and description. Example: { name: 'recipient', type: 'string', " +
            "description: 'Contact to message' }.",
          items: {
            type: "object",
            description: "Parameter definition with name, type, and description",
            properties: {
              name: {
                type: "string",
                description:
                  "camelCase parameter name, e.g., 'recipient' or 'messageBody'. " +
                  "Used as the Swift property name in the generated AppIntent struct.",
              },
              type: {
                type: "string",
                description:
                  "Parameter type. One of: string, int, double, float, boolean, " +
                  "date, duration, url. Maps to the corresponding Swift type.",
              },
              description: {
                type: "string",
                description:
                  "Human-readable description shown in Shortcuts and Spotlight " +
                  "when users configure the intent parameter.",
              },
            },
            required: ["name", "type", "description"],
          },
        },
      },
      required: ["name", "description"],
    },
  },
  {
    name: "axint.compile",
    description:
      "Compile TypeScript source (defineIntent() call) into native Swift " +
      "App Intent code. Returns { swift, infoPlist?, entitlements? } as a " +
      "string — no files written, no network requests. On validation " +
      "failure, returns diagnostics (severity, AX error code, position, " +
      "fix suggestion) instead of Swift. Use axint.validate for cheaper " +
      "pre-flight checks without compilation output; use " +
      "axint.schema.compile to compile from JSON without writing " +
      "TypeScript; use axint.scaffold to generate the TypeScript input.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description:
            "Full TypeScript source code containing a defineIntent() call. " +
            "Must be a complete file starting with an axint import, not a fragment.",
        },
        fileName: {
          type: "string",
          description:
            "Optional file name used in diagnostic messages, e.g., 'SendMessage.intent.ts'. " +
            "Defaults to 'input.ts' if omitted.",
        },
        emitInfoPlist: {
          type: "boolean",
          description:
            "When true, returns an Info.plist XML fragment declaring the intent's " +
            "infoPlistKeys. Only relevant for intents that use restricted APIs. " +
            "Defaults to false.",
        },
        emitEntitlements: {
          type: "boolean",
          description:
            "When true, returns an .entitlements XML fragment for the intent's " +
            "declared entitlements. Only relevant for intents requiring special " +
            "capabilities. Defaults to false.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.validate",
    description:
      "Validate a TypeScript intent definition without generating Swift. " +
      "Runs the full Axint validation pipeline (130 diagnostic rules) and " +
      "returns a JSON array of diagnostics: { severity: 'error'|'warning', " +
      "code: 'AXnnn', line: number, column: number, message: string, " +
      "suggestion?: string }. Returns an empty array [] when validation " +
      "passes. Checks intent names (PascalCase), parameter types, domain " +
      "values, entity queries, widget families, view props, and app scenes. " +
      "No files written, no network requests, no side effects. Use for " +
      "cheap pre-flight checks before calling axint.compile. Prefer " +
      "axint.compile directly when you need Swift output — it includes " +
      "inline diagnostics. For Swift source validation use axint.swift.validate.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description:
            "Full TypeScript source code containing a defineIntent() call. " +
            "Must be a complete file starting with an axint import, not a " +
            "code fragment. Same format accepted by axint.compile.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.fix-packet",
    description:
      "Read the latest Fix Packet that Axint emitted locally after a compile or watch run. " +
      "Returns the exact repair artifact that AI tools or Xcode helpers should consume next: " +
      "verdict, top findings, full diagnostics, next steps, and an AI-ready fix prompt. " +
      "Use this after axint compile or axint watch when you want the latest packet without " +
      "copy-paste or another compile pass.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Optional working directory to search from. Axint walks upward from this directory " +
            "until it finds .axint/fix/latest.json.",
        },
        packetDir: {
          type: "string",
          description:
            "Optional explicit packet directory override. Use this if the latest packet lives " +
            "somewhere other than .axint/fix.",
        },
        format: {
          type: "string",
          enum: ["json", "markdown", "prompt"],
          description:
            "Output format. json returns the full packet, markdown returns the human-readable " +
            "report, and prompt returns only the AI repair prompt.",
        },
      },
    },
  },
  {
    name: "axint.schema.compile",
    description:
      "Compile a minimal JSON schema directly to Swift, bypassing the " +
      "TypeScript DSL entirely. Supports intents, views, widgets, and " +
      "full apps via the 'type' parameter. Uses ~20 input tokens vs " +
      "hundreds for TypeScript — ideal for LLM agents optimizing token " +
      "budgets. Returns Swift source with token usage stats; no files " +
      "written, no network requests. On invalid input, returns an error " +
      "message describing the issue. Use this for quick Swift generation " +
      "without writing TypeScript; use axint.compile when you need the " +
      "full DSL for complex intents with custom perform() logic.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["intent", "view", "widget", "app"],
          description:
            "What to compile. Determines which other parameters are relevant: " +
            "intent uses params/domain/title; view uses props/state/body; " +
            "widget uses entry/families/body/displayName; app uses scenes.",
        },
        name: {
          type: "string",
          description:
            "PascalCase name, e.g., 'CreateEvent' for intents, 'EventListView' " +
            "for views, 'StepsWidget' for widgets. Used as the Swift struct name.",
        },
        title: {
          type: "string",
          description:
            "Human-readable title shown in Shortcuts/Spotlight. Intent only. " +
            "E.g., 'Create Event'. Defaults to a space-separated version of name.",
        },
        description: {
          type: "string",
          description:
            "Description of what this intent/view/widget does. Shown to users " +
            "in system UI for intents. Optional but recommended.",
        },
        domain: {
          type: "string",
          description:
            "Apple App Intent domain. Intent only. One of: messaging, " +
            "productivity, health, finance, commerce, media, navigation, " +
            "smart-home. Omit if no standard domain applies.",
        },
        params: {
          type: "object",
          description:
            "Intent only. Parameter definitions as { fieldName: typeString }. " +
            "E.g., { recipient: 'string', amount: 'double' }. Supported types: " +
            "string, int, double, float, boolean, date, duration, url.",
          additionalProperties: {
            type: "string",
            description:
              "Swift type for this parameter: string, int, double, float, boolean, date, duration, or url",
          },
        },
        props: {
          type: "object",
          description:
            "View only. Prop definitions as { fieldName: typeString }. " +
            "E.g., { title: 'string', count: 'int' }. Same type set as params.",
          additionalProperties: {
            type: "string",
            description:
              "Swift type for this prop: string, int, double, float, boolean, date, duration, or url",
          },
        },
        state: {
          type: "object",
          description:
            "View only. State variable definitions as " +
            "{ fieldName: { type: 'string', default?: value } }. " +
            "Generates @State properties in the SwiftUI view.",
          additionalProperties: {
            type: "object",
            description: "State variable config with type and optional default value",
            properties: {
              type: {
                type: "string",
                description:
                  "Swift type: string, int, double, float, boolean, date, duration, or url",
              },
              default: {
                type: "string",
                description: "Optional default value for the @State property",
              },
            },
            required: ["type"],
          },
        },
        body: {
          type: "string",
          description:
            "View/widget only. Raw SwiftUI code for the body, e.g., " +
            "'VStack { Text(\"Hello\") }'. Wrapped in the struct automatically. " +
            "Can reference props, state, and entry fields by name.",
        },
        displayName: {
          type: "string",
          description:
            "Widget only. Human-readable name shown in the widget gallery. " +
            "E.g., 'Daily Steps'. Defaults to a spaced version of name.",
        },
        families: {
          type: "array",
          items: {
            type: "string",
            description:
              "Widget family: systemSmall, systemMedium, systemLarge, systemExtraLarge, accessoryCircular, accessoryRectangular, or accessoryInline",
          },
          description:
            "Widget only. Supported widget sizes: systemSmall, systemMedium, " +
            "systemLarge, systemExtraLarge, accessoryCircular, " +
            "accessoryRectangular, accessoryInline. Defaults to [systemSmall].",
        },
        entry: {
          type: "object",
          description:
            "Widget only. Timeline entry fields as { fieldName: typeString }. " +
            "E.g., { steps: 'int', date: 'date' }. Available in the body template.",
          additionalProperties: {
            type: "string",
            description:
              "Swift type for this entry field: string, int, double, float, boolean, date, duration, or url",
          },
        },
        refreshInterval: {
          type: "number",
          description:
            "Widget only. Timeline refresh interval in minutes. " +
            "E.g., 30 for half-hourly updates. Defaults to 60.",
        },
        scenes: {
          type: "array",
          items: {
            type: "object",
            description: "Scene definition with kind, view, and optional title/platform",
            properties: {
              kind: {
                type: "string",
                enum: ["windowGroup", "window", "documentGroup", "settings"],
                description:
                  "Scene type. windowGroup is most common for single-window apps.",
              },
              view: {
                type: "string",
                description:
                  "Root SwiftUI view name, e.g., 'ContentView'. Must be defined elsewhere.",
              },
              title: {
                type: "string",
                description: "Window title shown in the title bar",
              },
              name: {
                type: "string",
                description: "Unique scene identifier for programmatic access",
              },
              platform: {
                type: "string",
                enum: ["macOS", "iOS", "visionOS"],
                description:
                  "Platform guard — wraps scene in #if os(...). Omit for cross-platform.",
              },
            },
            required: ["kind", "view"],
          },
          description:
            "App only. Scene definitions for the @main App struct. " +
            "At least one scene with kind 'windowGroup' is typically required.",
        },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "axint.swift.validate",
    description:
      "Validate existing Swift source against 150 build-time rules " +
      "(AX700–AX749) including Swift 6 concurrency and Live Activities. " +
      "Catches bugs Xcode buries behind generic 'type does not conform' " +
      "errors: missing perform() on AppIntent, missing var body on Widget, " +
      "@State let instead of var, Sendable violations, @MainActor misuse on " +
      "actors, missing ActivityAttributes ContentState, and 140+ more. " +
      "Returns JSON array of { code, severity, message, line, suggestion }. " +
      "Empty array means the source is clean. Read-only, no files written, " +
      "no network requests, no side effects. Call this on any Swift source " +
      "before building — especially LLM-generated code. Pair with " +
      "axint.swift.fix to auto-repair mechanical issues.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Full Swift source code to validate.",
        },
        file: {
          type: "string",
          description:
            "Optional file name to attach to diagnostics for editor integration.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.swift.fix",
    description:
      "Auto-fix mechanical Swift errors detected by axint.swift.validate. " +
      "Handles 20+ fix rules: rewrites @State let → @State var, injects " +
      "perform() into AppIntents, drops var body stubs into Widgets and " +
      "Apps, adds let date: Date to TimelineEntry, fixes DispatchQueue.main " +
      "→ Task { @MainActor in }, converts nonisolated var → let, strips " +
      "redundant @MainActor from actors, adds Codable+Hashable to " +
      "ActivityAttributes ContentState, and more. Returns JSON with " +
      "{ source: fixedSwift, fixes: [...applied], remaining: [...unfixed] }. " +
      "Non-mechanical issues (empty descriptions, missing copy) are left " +
      "for the developer. Read-only output, no files written, no network " +
      "requests, no side effects. Call axint.swift.validate first to " +
      "preview diagnostics, then axint.swift.fix to apply repairs.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Full Swift source code to fix.",
        },
        file: {
          type: "string",
          description: "Optional file name to attach to diagnostics.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.templates.list",
    description:
      "List all 25 bundled reference templates in the Axint SDK. Returns " +
      "a JSON array of { id, name, description } objects — one per template. " +
      "Templates cover messaging, productivity, health, finance, commerce, " +
      "media, navigation, smart-home, and entity/query patterns. No input " +
      "parameters required, no files written, no network requests, no side " +
      "effects. Call this to discover template ids, then call " +
      "axint.templates.get with a specific id to retrieve the full source. " +
      "Unlike axint.scaffold (which generates a skeleton from parameters), " +
      "templates are complete working examples with perform() logic, " +
      "entity queries, and best-practice patterns included.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
    },
  },
  {
    name: "axint.templates.get",
    description:
      "Retrieve the full TypeScript source code of a specific bundled " +
      "template by id. Returns a complete, compilable defineIntent() file " +
      "as a string — ready to save as .ts and compile with axint.compile. " +
      "Includes perform() logic, parameter definitions, and domain-specific " +
      "patterns. Returns an error message if the id is not found (call " +
      "axint.templates.list first to discover valid ids). No files written, " +
      "no network requests, no side effects. Use templates as starting " +
      "points — edit the returned source to match your app, then compile.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description:
            "Template id from axint.templates.list, e.g., 'send-message' " +
            "or 'create-event'. Case-sensitive, kebab-case format.",
        },
      },
      required: ["id"],
    },
  },
] as const;
