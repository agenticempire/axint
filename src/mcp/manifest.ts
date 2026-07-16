/**
 * Tool manifest returned by ListToolsRequestSchema.
 *
 * Pure declarative data — no logic. Lives in its own file so server.ts
 * stays focused on transport wiring and dispatch.
 */

export const TOOL_MANIFEST = [
  {
    name: "axint.status",
    description:
      "Report the exact running Axint MCP server version, package path, uptime, " +
      "registered tool count, and same-thread MCP reload/update instructions. Use this " +
      "as the first tool in a new AI-agent or Xcode chat to prove which Axint process " +
      "the agent is actually connected to. This answers the running MCP server, " +
      "not a guessed npm, PyPI, or docs version.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description:
            "Output format. markdown is human-readable, json is structured, " +
            "and prompt is a short instruction an agent can repeat back before editing.",
        },
      },
    },
  },
  {
    name: "axint.activate",
    description:
      "Run a source-free compiler smoke test through the real Axint pipeline. " +
      "Use immediately after installing or connecting Axint so the current agent proves " +
      "it did more than start the MCP server.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description:
            "Output format. markdown is human-readable, json is structured for automation.",
        },
      },
    },
  },
  {
    name: "axint.upgrade",
    description:
      "Check the latest Axint package and optionally apply the upgrade while preserving " +
      "the current agent thread. Returns exact install commands, optional Xcode MCP " +
      "wiring refresh, .axint/upgrade/latest.* artifacts, and a same-thread resume " +
      "prompt so an AI-agent or Xcode host can reload the MCP process without starting " +
      "from scratch.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Project directory where .axint/upgrade/latest.* should be written. Defaults to the MCP process cwd.",
        },
        targetVersion: {
          type: "string",
          description:
            "Specific Axint version to install. Defaults to the latest published npm version.",
        },
        latestVersion: {
          type: "string",
          description:
            "Known latest version to compare against. Useful for deterministic agent tests or offline planning.",
        },
        apply: {
          type: "boolean",
          description:
            "Whether to install the target package. Defaults to false, which only returns the plan.",
        },
        reinstallXcode: {
          type: "boolean",
          description:
            "Whether apply mode should also refresh optional Xcode MCP wiring. Defaults to false.",
        },
        writeReport: {
          type: "boolean",
          description:
            "Whether to write .axint/upgrade/latest.json and latest.md. Defaults to true when apply is true.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description:
            "Output format. markdown is human-readable, json is structured, and prompt is the continuation block.",
        },
      },
    },
  },
  {
    name: "axint.doctor",
    description:
      "Audit the current Axint runtime and project wiring: running MCP version, " +
      "expected version, Node/npm/npx paths, project .mcp.json, AGENTS.md, " +
      "CLAUDE.md, .axint/project.json, and Xcode Claude Agent registration. " +
      "Use this when an agent might be connected to a stale Axint process or " +
      "when a new project needs first-try MCP setup proof.",
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
          description: "Project directory to inspect. Defaults to the MCP process cwd.",
        },
        expectedVersion: {
          type: "string",
          description:
            "Expected Axint version. If provided and the running MCP version differs, doctor returns a blocker.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.xcode.guard",
    description:
      "Guard an Xcode agent session against context compaction and Axint drift. " +
      "Checks project memory files, active Axint session, latest Axint Run or guard proof, " +
      "and long-task freshness. Writes .axint/guard/latest.json and latest.md so the " +
      "user can audit whether Axint was actually used during a long Xcode task. " +
      "Use this before long Xcode tasks, after context recovery, before broad Swift edits, " +
      "and before claiming a build/runtime fix is done.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory to guard. Defaults to the MCP process cwd.",
        },
        projectName: {
          type: "string",
          description: "Project name for the guard report.",
        },
        expectedVersion: {
          type: "string",
          description: "Expected Axint version for the active project.",
        },
        platform: {
          type: "string",
          description: "Target Apple platform, such as macOS, iOS, visionOS, or all.",
        },
        stage: {
          type: "string",
          enum: [
            "context-recovery",
            "planning",
            "before-write",
            "after-write",
            "pre-build",
            "runtime",
            "finish",
          ],
          description: "Current Xcode workflow stage. Defaults to context-recovery.",
        },
        sessionToken: {
          type: "string",
          description: "Current axint.session.start token, if already known.",
        },
        modifiedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Files in scope for this task.",
        },
        notes: {
          type: "string",
          description:
            "Agent/user notes to scan for compaction, drift, forgotten Axint usage, or long-task risk.",
        },
        lastAxintTool: {
          type: "string",
          description:
            "Last Axint tool the agent used, e.g. axint.suggest or axint.feature.",
        },
        lastAxintResult: {
          type: "string",
          description: "Short result from the last Axint tool call.",
        },
        maxMinutesSinceAxint: {
          type: "number",
          description:
            "Maximum allowed minutes since latest Axint evidence. Defaults to 10.",
        },
        autoStartSession: {
          type: "boolean",
          description:
            "Whether to start axint.session.start automatically if no active session exists. Defaults to true.",
        },
        writeReport: {
          type: "boolean",
          description:
            "Whether to write .axint/guard/latest.json and latest.md. Defaults to true.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.xcode.write",
    description:
      "Write a file inside the Xcode project through the Axint guard path. " +
      "For Swift files, runs axint.swift.validate and axint.cloud.check immediately, " +
      "then records .axint/guard/latest.* proof. Use this instead of raw XcodeWrite " +
      "when an agent is editing Apple-native files during a long task.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      required: ["path", "content"],
      properties: {
        cwd: {
          type: "string",
          description: "Project root. Defaults to the MCP process cwd.",
        },
        path: {
          type: "string",
          description:
            "File path to write. Relative paths are resolved inside cwd; absolute paths must still be inside cwd.",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
        projectName: {
          type: "string",
          description: "Project name for guard/session reports.",
        },
        expectedVersion: {
          type: "string",
          description: "Expected Axint version for this project.",
        },
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "watchOS", "visionOS", "all"],
          description: "Target Apple platform for Cloud Check.",
        },
        sessionToken: {
          type: "string",
          description: "Current axint.session.start token, if already known.",
        },
        createDirs: {
          type: "boolean",
          description:
            "Whether to create parent directories before writing. Defaults to true.",
        },
        validateSwift: {
          type: "boolean",
          description:
            "Whether to run Swift validation for .swift files. Defaults to true.",
        },
        cloudCheck: {
          type: "boolean",
          description: "Whether to run Cloud Check for .swift files. Defaults to true.",
        },
        notes: {
          type: "string",
          description: "Agent notes or user feedback to scan for drift while writing.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.session.start",
    description:
      "Start an enforced Axint agent session. Writes " +
      ".axint/session/current.json plus token-scoped session history, refreshes .axint/AXINT_REHYDRATE.md, " +
      "returns compact operating memory, docs context, a session token, and " +
      "the exact axint.workflow.check args. Use " +
      "this as the first Axint tool in an AI-agent or Xcode host after a new chat, MCP reload, or " +
      "context compaction so the agent cannot silently drift away from Axint.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        targetDir: {
          type: "string",
          description:
            "Project directory where .axint/session/current.json and token-scoped session history should be written. Defaults to the MCP process cwd.",
        },
        projectName: {
          type: "string",
          description: "Project name to embed in the session and returned context.",
        },
        expectedVersion: {
          type: "string",
          description:
            "Expected Axint package version. Defaults to the running MCP version.",
        },
        platform: {
          type: "string",
          description: "Target Apple platform, such as macOS, iOS, visionOS, or all.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Agent target for the session. Defaults to all.",
        },
        ttlMinutes: {
          type: "number",
          description:
            "How long the session token remains valid. Defaults to 720 minutes.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.feature",
    description:
      "Generate a scaffolded Apple-native feature package from a description. " +
      "Returns multiple files: compile-aware Swift source, companion widget/view, " +
      "Info.plist fragments, entitlements, and XCTest scaffolds — all structured " +
      "file-by-file so an Xcode agent can write each file directly into the " +
      "project. Designed for composition with Xcode MCP tools: call " +
      "axint.feature to generate the package, then use XcodeWrite to place " +
      "each file. App-specific perform() bodies and UI behavior remain starter " +
      "scaffolds. No files written, no network requests, no side effects.",
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
            enum: [
              "intent",
              "view",
              "widget",
              "component",
              "app",
              "store",
              "model",
              "models",
              "state",
              "data",
            ],
          },
          description:
            "Which Apple surfaces to generate. 'intent' produces an App Intent " +
            "struct for Siri/Shortcuts/Spotlight. 'widget' produces a WidgetKit " +
            "widget with timeline provider. 'view' produces a SwiftUI view. " +
            "'component' produces a reusable SwiftUI component under Sources/Components. " +
            "'store' produces a shared Observable data store. 'model', 'models', 'state', and 'data' are accepted aliases for 'store'. 'app' produces a SwiftUI @main app shell. " +
            "Defaults to ['intent'] if omitted. Combine surfaces to scaffold " +
            "a multi-surface feature: ['store', 'view', 'intent', 'widget'] for an integrated Apple-native loop.",
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
            "social, community, collaboration, developer-tools, food, creative, " +
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
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "visionOS", "all"],
          description:
            "Target Apple platform for generated starter UI. Use 'macOS' to avoid " +
            "iOS-only SwiftUI affordances in generated views. Defaults to 'all'.",
        },
        tokenNamespace: {
          type: "string",
          description:
            "Optional Swift token enum generated by axint.tokens.ingest, e.g., " +
            "'SwarmTokens'. When provided, generated SwiftUI references " +
            "namespace colors, radii, and layout values instead of raw literals.",
        },
        componentKind: {
          type: "string",
          description:
            "Optional component blueprint for the component surface, such as feedCard, mediaCard, utilityRow, avatar, statusRing, missionCard, contextPanel, decisionLog, approvalCard, agentRow, roleCard, signalCard, channelRow, sidebarRail, profileCard, settingsView, semanticCard, semanticRow, semanticPill, semanticPanel, semanticBar, semanticList, or cardArchetypes for a multi-component kit. Omit to let Axint infer from the description.",
        },
        context: {
          type: "string",
          description:
            "Optional nearby SwiftUI/design context. Axint uses this as a weak hint for layout primitives, platform patterns, and token usage; it does not copy proprietary code.",
        },
        format: {
          type: "boolean",
          description:
            "When true (default), pipes every generated Swift file through " +
            "swift-format with Axint's house style. Falls back to raw output " +
            "when swift-format is not on $PATH. Set false to receive raw " +
            "generator output.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "axint.project.pack",
    description:
      "Generate the Axint project-start pack for a new Apple app without writing files. " +
      "Returns .mcp.json, AGENTS.md, CLAUDE.md, .axint/AXINT_MEMORY.md, .axint/project.json, and .axint/README.md " +
      "so an Xcode or AI-agent host can install the exact first-try workflow: read docs, " +
      "call axint.status, call axint.activate, run workflow gates, validate Swift, run Cloud Check with evidence, " +
      "and avoid static-only bug claims.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Project name to embed in the generated instructions.",
        },
        targetDir: {
          type: "string",
          description: "Project directory label to embed in the report.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Agent target. Defaults to all.",
        },
        mode: {
          type: "string",
          enum: ["local", "remote"],
          description: "MCP mode. local uses npx stdio; remote uses mcp.axint.ai.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.project.index",
    description:
      "Scan the local Apple project and write a compact .axint/context pack so Axint can reason over changed files, nearby SwiftUI surfaces, and interaction-risk files instead of only one source file at a time.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        targetDir: {
          type: "string",
          description:
            "Project directory to index. Defaults to the current working directory.",
        },
        projectName: {
          type: "string",
          description: "Optional project name override for the context pack.",
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional changed files to pin into the context pack.",
        },
        includeGit: {
          type: "boolean",
          description: "Whether to include git changed-file discovery. Defaults to true.",
        },
        dryRun: {
          type: "boolean",
          description:
            "When true, returns the index without writing .axint/context files.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.project.syncVersion",
    description:
      "Update Axint-owned project-pack version hints after an upgrade. " +
      "Use this after axint.upgrade or npm/pip upgrades so .axint/project.json, " +
      "AGENTS.md, CLAUDE.md, and Axint rehydration docs stop pointing agents at an older package version.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        targetDir: {
          type: "string",
          description:
            "Project directory to update. Defaults to the current working directory.",
        },
        version: {
          type: "string",
          description:
            "Axint version to write. Defaults to the running MCP server version.",
        },
        dryRun: {
          type: "boolean",
          description:
            "When true, reports the files that would change without writing them.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.context.memory",
    description:
      "Return the compact Axint operating memory that agents should reload " +
      "at new chat start, after context compaction, or after long coding drift. " +
      "Use this to keep Axint top-of-mind without rereading the full docs.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Project name to include in the memory.",
        },
        expectedVersion: {
          type: "string",
          description: "Expected Axint version to compare against axint.status.",
        },
        platform: {
          type: "string",
          description: "Target Apple platform, such as macOS, iOS, visionOS, or all.",
        },
      },
    },
  },
  {
    name: "axint.context.docs",
    description:
      "Return the project-local Axint docs context that agents should reload " +
      "after new chats or context compaction. This is the durable docs memory " +
      "that keeps the agent using Axint instead of forgetting the workflow.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        projectName: {
          type: "string",
          description: "Project name to include in the docs context.",
        },
        expectedVersion: {
          type: "string",
          description: "Expected Axint version to compare against axint.status.",
        },
        platform: {
          type: "string",
          description: "Target Apple platform, such as macOS, iOS, visionOS, or all.",
        },
      },
    },
  },
  {
    name: "axint.suggest",
    description:
      "Suggest Apple-native features for an app based on its description. " +
      "The domain is only a weak hint; the app description wins. Returns a " +
      "ranked list of features with recommended " +
      "surfaces (intent, widget, view, component, store, app), estimated complexity, and a " +
      "one-line description for each. Use this to discover what Axint " +
      "can generate for an app before calling axint.feature. Local mode " +
      "does not use the network. Optional Pro mode calls the authenticated " +
      "Axint Pro intelligence endpoint and falls back to local suggestions.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
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
            "social, community, collaboration, developer-tools, food, " +
            "education, creative, finance, commerce, media, navigation, " +
            "smart-home. Treated as a weak hint, not an override.",
        },
        mode: {
          type: "string",
          enum: ["local", "auto", "ai", "pro"],
          description:
            "Suggestion strategy. local is deterministic and offline. pro/ai " +
            "uses the authenticated Axint Pro intelligence endpoint. auto uses " +
            "Pro only when AXINT_PRO_INSIGHTS=1.",
        },
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "watchOS", "visionOS", "multi"],
          description:
            "Optional Apple platform target used by AI mode to tailor suggestions.",
        },
        audience: {
          type: "string",
          description:
            "Optional audience context, such as consumers, teams, operators, " +
            "developers, clinicians, creators, or enterprise buyers.",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description: "Optional concepts to avoid, for example ['dating', 'fitness'].",
        },
        goals: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional product goals for Pro mode, such as activation, retention, conversion, speed, accessibility, or production readiness.",
        },
        stage: {
          type: "string",
          enum: ["idea", "prototype", "mvp", "growth", "enterprise", "unknown"],
          description:
            "Optional product stage used by Pro mode to tune suggestions without embedding private strategy logic in the compiler.",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional constraints for Pro mode, such as must be macOS-native, no server, no payments, or build in one session.",
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
    name: "axint.registry.search",
    description:
      "Search the Axint Registry for already-published packages that match a " +
      "natural-language query. Use this BEFORE calling axint.feature or " +
      "axint.compile so the agent can install an existing package instead " +
      "of regenerating Swift the community has already shipped. Returns " +
      "ranked hits with name, version, description, surface areas, and the " +
      "install command. Local mode walks the sibling axint-registry " +
      "checkout (configurable via AXINT_REGISTRY_PATH).",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Free-form description of what the agent is about to build. " +
            "E.g., 'log a workout', 'capture a voice note', 'show timer'. " +
            "Tokenized and matched against package name, tags, surface areas, " +
            "siri phrases, and description.",
        },
        kind: {
          type: "string",
          description:
            "Optional surface filter. One of: app-intent, view, widget, " +
            "store, app, component. Loose match; 'intent' matches 'app-intent'.",
        },
        platform: {
          type: "string",
          description:
            "Optional platform filter. One of: iOS, macOS, watchOS, tvOS, " +
            "visionOS. Filters by the manifest's min-platform version field.",
        },
        limit: {
          type: "number",
          description: "Hard cap on returned hits. Defaults to 10.",
        },
        minScore: {
          type: "number",
          description:
            "Minimum normalized match score (0..1) below which results are " +
            "dropped. Defaults to 0.1.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "axint.workflow.check",
    description:
      "Agent workflow gate that records a local freshness stamp. Requires the current Axint session token " +
      "from axint.session.start unless requireSession=false is explicitly set. " +
      "Use this at session start, after context compaction, before planning, writing, " +
      "building, or committing to make sure the agent has actually used the " +
      "right Axint tools: suggest for planning, feature for new surfaces, " +
      "swift.validate for modified Swift, cloud.check for coverage-aware " +
      "repair feedback, and Xcode build/test evidence for runtime proof. " +
      "For existing dirty SwiftUI files or patch-first edits, it points " +
      "agents toward surgical patching plus validation instead of full-file writes. " +
      "A ready result is not a completion stamp: the response includes the next " +
      "Axint action the agent should call before returning to broad Apple-native work.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description:
            "Project directory containing .axint/session/current.json. Defaults to the MCP process cwd.",
        },
        sessionStarted: {
          type: "boolean",
          description:
            "Whether axint.session.start was called in this chat/recovery pass.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description:
            "Agent host/tool lane for this gate. Patch-first lanes should use native edits; Xcode may use Xcode guard/write.",
        },
        sessionToken: {
          type: "string",
          description:
            "Token returned by axint.session.start. Required by default so compaction cannot erase the Axint workflow silently.",
        },
        requireSession: {
          type: "boolean",
          description: "Set false only for legacy/manual checks. Defaults to true.",
        },
        stage: {
          type: "string",
          enum: [
            "session-start",
            "context-recovery",
            "planning",
            "before-write",
            "pre-build",
            "pre-commit",
          ],
          description: "Workflow stage being checked. Defaults to pre-build.",
        },
        surfaces: {
          type: "array",
          items: {
            type: "string",
            enum: ["intent", "view", "widget", "component", "app", "store"],
          },
          description:
            "Apple surfaces touched by this task. If omitted, inferred from modifiedFiles.",
        },
        modifiedFiles: {
          type: "array",
          items: { type: "string" },
          description:
            "Files changed in this agent pass, used to infer whether Swift validation is required.",
        },
        ranSuggest: {
          type: "boolean",
          description: "Whether axint.suggest was used during planning.",
        },
        ranStatus: {
          type: "boolean",
          description:
            "Whether axint.status was called to confirm the running MCP version.",
        },
        readRehydrationContext: {
          type: "boolean",
          description:
            "Whether .axint/AXINT_REHYDRATE.md was read after a new chat, context compaction, MCP restart, or drift.",
        },
        readAgentInstructions: {
          type: "boolean",
          description:
            "Whether AGENTS.md, CLAUDE.md, or .axint/project.json was read after a new chat or context compaction.",
        },
        readDocsContext: {
          type: "boolean",
          description:
            "Whether .axint/AXINT_DOCS_CONTEXT.md was read or axint.context.docs was called after a new chat or context compaction.",
        },
        ranFeature: {
          type: "boolean",
          description: "Whether axint.feature was used for a new surface scaffold.",
        },
        ranRepair: {
          type: "boolean",
          description:
            "Whether axint.repair was used for an existing-code repair plan. This satisfies planning for patch-first SwiftUI/store repairs when axint.suggest is unavailable or generation is not useful.",
        },
        featureBypassReason: {
          type: "string",
          description:
            "Concrete reason axint.feature was intentionally bypassed. Use for existing-code edits, patch-first repairs, or cases where generation is not useful.",
        },
        ranSwiftValidate: {
          type: "boolean",
          description: "Whether axint.swift.validate was run on modified Swift.",
        },
        ranCloudCheck: {
          type: "boolean",
          description: "Whether axint.cloud.check was run with source/evidence.",
        },
        xcodeBuildPassed: {
          type: "boolean",
          description: "Whether Xcode build evidence passed.",
        },
        xcodeTestsPassed: {
          type: "boolean",
          description: "Whether focused unit/UI tests passed.",
        },
        notes: {
          type: "string",
          description: "Optional human/agent context for why a step was skipped.",
        },
        availableTools: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of Axint MCP tools visible in this host session. When supplied, workflow.check will not recommend a missing tool and will return the best available fallback.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
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
            "social, finance, commerce, media, navigation, smart-home. Omit if none apply.",
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
        format: {
          type: "boolean",
          description:
            "When true (default), pipes generated Swift through swift-format " +
            "with Axint's house style. Falls back to raw output when " +
            "swift-format is not on $PATH. Set false to receive raw generator " +
            "output.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.validate",
    description:
      "Validate a TypeScript intent definition without generating Swift. " +
      "Runs the full Axint validation pipeline (134 diagnostic rules) and " +
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
    name: "axint.cloud.check",
    description:
      "Run an agent-callable Cloud Check against Swift or Axint TypeScript source. " +
      "Accepts inline source or a sourcePath, then returns a Cloud-style verdict, " +
      "Apple-specific findings, next steps, an AI repair prompt, and a redacted " +
      "compiler feedback signal when the check finds a bug. This closes " +
      "the browser-only gap for Xcode and MCP agents: they can run the check " +
      "programmatically during the build loop. No files are written.",
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
            "Inline Swift or Axint TypeScript source to check. Prefer sourcePath when possible; inline source should be reserved for short snippets already in the agent context.",
        },
        sourcePath: {
          type: "string",
          description:
            "Optional file path to read and check. Use this from Xcode agents after writing a generated Swift file.",
        },
        fileName: {
          type: "string",
          description:
            "Optional display name for diagnostics when passing inline source. Defaults to sourcePath or <cloud-check>.",
        },
        language: {
          type: "string",
          enum: ["swift", "typescript", "unknown"],
          description:
            "Optional language override. Omit to infer from file extension and source contents.",
        },
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "watchOS", "visionOS", "all"],
          description:
            "Optional target platform hint. Use macOS to catch common iOS-only SwiftUI modifiers in Mac app work.",
        },
        expectedVersion: {
          type: "string",
          description:
            "Optional expected Axint version for this project/session. Cloud Check also reads .axint/project.json when sourcePath is inside a project.",
        },
        localPackageVersion: {
          type: "string",
          description:
            "Optional local CLI/package version when the caller knows it. Used only for version-truth reporting.",
        },
        cloudRulesetVersion: {
          type: "string",
          description:
            "Optional hosted/cloud ruleset version when different from the local compiler package.",
        },
        xcodeBuildLog: {
          type: "string",
          description:
            "Optional short Xcode build excerpt. Pass only the failing lines or focused proof summary; full logs should stay in .axint artifacts or local files.",
        },
        testFailure: {
          type: "string",
          description:
            "Optional short failing unit/UI-test excerpt. Use this when static checks pass but Xcode tests still fail; include the assertion, selector, file/line, and not the full transcript.",
        },
        runtimeFailure: {
          type: "string",
          description:
            "Optional crash, freeze, hang, launch timeout, console, preview, or runtime failure text. Include the shortest useful stack/error when the app opens but freezes or behavior breaks.",
        },
        expectedBehavior: {
          type: "string",
          description:
            "Optional expected behavior for behavior-gap checks. Pair with actualBehavior when the bug is semantic rather than a compiler error.",
        },
        actualBehavior: {
          type: "string",
          description:
            "Optional observed behavior for behavior-gap checks. Pair with expectedBehavior so Cloud Check can return a repair-oriented mismatch finding.",
        },
        projectContextPath: {
          type: "string",
          description:
            "Optional path to a local .axint/context/latest.json pack written by axint.project.index. Omit when sourcePath lives inside the same project and Cloud Check can auto-discover the context file.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt", "feedback"],
          description:
            "Output format. markdown returns the report, json returns structured data, prompt returns only the repair prompt, and feedback returns only the privacy-preserving learning signal.",
        },
      },
    },
  },
  {
    name: "axint.repair",
    description:
      "Plan a project-aware Apple repair for existing apps. Indexes the local project, " +
      "classifies build/UI/runtime evidence, runs Cloud Check when source is provided, " +
      "ranks likely SwiftUI/App files, returns a host-aware patch/proof plan, and writes " +
      ".axint/repair plus a privacy-safe .axint/feedback packet. Use this when the user " +
      "reports a real app bug such as a visible composer that cannot be tapped, a failed " +
      "macOS UI test, a runtime freeze, or a Swift build error.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        issue: {
          type: "string",
          description:
            "The broken behavior or repair goal, e.g. 'comment box is visible but cannot be tapped'.",
        },
        source: {
          type: "string",
          description:
            "Optional inline Swift source for the suspected file. Source is not included in the feedback packet.",
        },
        sourcePath: {
          type: "string",
          description:
            "Optional suspected Swift file path. Axint reads it locally for Cloud Check and project anchoring.",
        },
        fileName: {
          type: "string",
          description: "Display file name when passing inline source.",
        },
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "watchOS", "visionOS", "all"],
          description: "Target Apple platform hint.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description:
            "Active host/tool lane. Axint adapts the repair plan so patch-first agents avoid Xcode-only write tools.",
        },
        expectedBehavior: {
          type: "string",
          description: "Optional expected behavior for the failing feature.",
        },
        actualBehavior: {
          type: "string",
          description: "Optional observed behavior from the failing run.",
        },
        xcodeBuildLog: {
          type: "string",
          description: "Optional Xcode build/test log evidence.",
        },
        testFailure: {
          type: "string",
          description: "Optional focused unit/UI-test failure text.",
        },
        runtimeFailure: {
          type: "string",
          description: "Optional crash, freeze, hang, or runtime failure text.",
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Changed files to pin into the project context pack.",
        },
        projectContextPath: {
          type: "string",
          description: "Optional .axint/context/latest.json path.",
        },
        writeReport: {
          type: "boolean",
          description:
            "Whether to write .axint/repair/latest.json and latest.md. Defaults to true.",
        },
        writeFeedback: {
          type: "boolean",
          description:
            "Whether to write a privacy-safe .axint/feedback packet. Defaults to true.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description:
            "Output format. markdown returns the report, json returns structured data, and prompt returns the agent repair prompt.",
        },
      },
      required: ["issue"],
    },
  },
  {
    name: "axint.feedback.create",
    description:
      "Create or read a privacy-safe learning packet for Axint repair intelligence. " +
      "Packets include project shape, diagnostic codes, issue class, redacted evidence, " +
      "and likely product owner, but never include source code. Users can inspect the JSON " +
      "before sending it to Axint Cloud.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        latest: {
          type: "boolean",
          description:
            "When true, return the latest local feedback packet instead of creating a new one.",
        },
        issue: {
          type: "string",
          description: "Bug, weak Axint output, or failed repair behavior.",
        },
        source: {
          type: "string",
          description: "Optional inline Swift source used locally only.",
        },
        sourcePath: {
          type: "string",
          description: "Optional suspected Swift file path used locally only.",
        },
        fileName: {
          type: "string",
          description: "Display file name when passing inline source.",
        },
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "watchOS", "visionOS", "all"],
          description: "Target Apple platform hint.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Active host/tool lane.",
        },
        expectedBehavior: {
          type: "string",
          description: "Optional expected behavior.",
        },
        actualBehavior: {
          type: "string",
          description: "Optional actual behavior.",
        },
        xcodeBuildLog: {
          type: "string",
          description: "Optional Xcode build/test log evidence.",
        },
        testFailure: {
          type: "string",
          description: "Optional focused unit/UI-test failure text.",
        },
        runtimeFailure: {
          type: "string",
          description: "Optional crash, freeze, hang, or runtime failure text.",
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Changed files to pin into the context pack.",
        },
        projectContextPath: {
          type: "string",
          description: "Optional .axint/context/latest.json path.",
        },
        format: {
          type: "string",
          enum: ["json", "markdown"],
          description: "Output format. Defaults to json.",
        },
      },
    },
  },
  {
    name: "axint.agent.install",
    description:
      "Install the local Axint multi-agent project brain. Writes .axint/agent.json, " +
      ".axint/context/latest.*, and .axint/coordination files so AI agents, Xcode, " +
      "and humans coordinate through the same local truth layer.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        projectName: {
          type: "string",
          description: "Optional project name override.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Active host/tool lane. Defaults to all.",
        },
        privacyMode: {
          type: "string",
          enum: ["local_only", "redacted_cloud", "source_opt_in"],
          description:
            "Privacy posture for this project. Defaults to local_only; source sharing is never enabled by default.",
        },
        providerMode: {
          type: "string",
          enum: ["none", "bring_your_own_key", "axint_cloud"],
          description:
            "Optional model-provider posture for future AI-enhanced advice. Defaults to none.",
        },
        force: {
          type: "boolean",
          description: "Rewrite the existing local agent config if present.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.agent.advice",
    description:
      "Ask the local Axint project brain what this agent should do next. Reads project " +
      "context, latest run proof, latest repair plan, and active file claims, then returns " +
      "host-specific guidance for Xcode, patch-first editors, or another agent lane.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        issue: {
          type: "string",
          description:
            "Optional bug, feature, or repair goal to turn into project-aware next moves.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description:
            "Active host/tool lane. Axint adapts advice to the tools this agent can actually use.",
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description:
            "Files in scope. Axint uses these to detect claim conflicts and recommend proof.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.agent.claim",
    description:
      "Claim files before an agent edits them so other agents do not patch the same " +
      "SwiftUI/App files concurrently. Claims are local, short-lived, and stored in " +
      ".axint/coordination/claims.json.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      required: ["files"],
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Agent lane creating the claim.",
        },
        task: {
          type: "string",
          description: "Task, bug, or repair pass this claim covers.",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to claim before editing.",
        },
        ttlMinutes: {
          type: "number",
          description: "Claim TTL in minutes. Defaults to 30.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.agent.release",
    description:
      "Release active local Axint file claims for this agent after finishing or abandoning " +
      "a task. This keeps parallel agents and Xcode from blocking each other on stale claims.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description: "Agent lane releasing claims.",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional files to release. Omit to release this agent's claims.",
        },
        all: {
          type: "boolean",
          description: "Release all matching active claims.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.run",
    description:
      "Run the enforced Axint Apple build loop outside the Xcode UI. Starts or refreshes " +
      "the Axint session, validates Swift, runs Cloud Check, executes xcodebuild build/test " +
      "when a project or workspace is present, optionally launches a macOS app for runtime " +
      "evidence, writes .axint/run/latest artifacts, and returns an agent-ready repair prompt. " +
      "Use integration=minimal for a local-only, non-mutating brownfield proof that writes " +
      "nothing unless outputDir is supplied. Use full when one tool call should own the project gate.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory to run. Defaults to the MCP process cwd.",
        },
        projectName: {
          type: "string",
          description: "Project name for Axint session and report labels.",
        },
        expectedVersion: {
          type: "string",
          description: "Expected Axint package version for the run session.",
        },
        platform: {
          type: "string",
          enum: ["macOS", "iOS", "watchOS", "visionOS", "all"],
          description:
            "Target Apple platform. Defaults to macOS unless inferred from destination.",
        },
        agent: {
          type: "string",
          enum: ["all", "claude", "codex", "cowork", "cursor", "xcode"],
          description:
            "Current agent host lane. Axint uses this to start the right session profile and return host-safe repair guidance.",
        },
        scheme: {
          type: "string",
          description: "Xcode scheme. If omitted, Axint tries to infer one.",
        },
        workspace: {
          type: "string",
          description: "Path to .xcworkspace, relative to cwd or absolute.",
        },
        project: {
          type: "string",
          description: "Path to .xcodeproj, relative to cwd or absolute.",
        },
        destination: {
          type: "string",
          description:
            "xcodebuild destination, e.g. platform=macOS or platform=iOS Simulator,name=iPhone 16.",
        },
        configuration: {
          type: "string",
          description: "Xcode build configuration, e.g. Debug or Release.",
        },
        derivedDataPath: {
          type: "string",
          description: "Optional xcodebuild -derivedDataPath.",
        },
        testPlan: {
          type: "string",
          description: "Optional xcodebuild -testPlan for test runs.",
        },
        onlyTesting: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional focused xcodebuild -only-testing selectors, e.g. SwarmUITests/SwarmUITests/testProjectCommandCenterPrimaryActionsRouteToCoreTabs.",
        },
        modifiedFiles: {
          type: "array",
          items: { type: "string" },
          description:
            "Changed Swift files to validate and Cloud Check. Pass this whenever possible; if omitted, Axint validates the project but Cloud Checks only a compact highest-risk subset.",
        },
        skipBuild: {
          type: "boolean",
          description: "Skip xcodebuild build and only run Axint static gates.",
        },
        skipTests: {
          type: "boolean",
          description: "Skip xcodebuild test.",
        },
        runtime: {
          type: "boolean",
          description:
            "After build, launch the built macOS .app and capture runtime/timeout evidence.",
        },
        runtimeTimeoutSeconds: {
          type: "number",
          description: "Runtime launch timeout in seconds.",
        },
        timeoutSeconds: {
          type: "number",
          description: "Build/test timeout in seconds.",
        },
        expectedBehavior: {
          type: "string",
          description: "Expected runtime behavior for semantic bug checks.",
        },
        actualBehavior: {
          type: "string",
          description: "Actual runtime behavior for semantic bug checks.",
        },
        runtimeFailure: {
          type: "string",
          description: "Crash, freeze, hang, launch timeout, or UI failure evidence.",
        },
        integration: {
          type: "string",
          enum: ["full", "minimal"],
          description:
            "Execution profile. minimal denies network/project mutation, disables automatic fixes, treats unconfirmed static findings as advisory, and writes no durable artifacts unless outputDir is supplied.",
        },
        localOnly: {
          type: "boolean",
          description: "Deny hosted/network checks for this run.",
        },
        advisory: {
          type: "boolean",
          description:
            "Keep unconfirmed static findings non-blocking while preserving them in the receipt.",
        },
        fix: {
          type: "boolean",
          description: "Allow automatic fix behavior. Forced false by minimal mode.",
        },
        outputDir: {
          type: "string",
          description:
            "Explicit artifact directory. Minimal mode otherwise writes no durable run artifacts.",
        },
        dryRun: {
          type: "boolean",
          description: "Plan xcodebuild commands without executing them.",
        },
        writeReport: {
          type: "boolean",
          description:
            "Whether to write .axint/run/latest.json and latest.md. Defaults to true.",
        },
        background: {
          type: "boolean",
          description:
            "Start the run and immediately return a resumable job id instead of waiting for long Xcode build, test, or runtime proof. Use this from MCP clients when xcodebuild might outlive the tool transport timeout.",
        },
        includeSource: {
          type: "boolean",
          description:
            "Include full Swift source and full command output in json output. Defaults to false so long agent threads receive compact verdict/evidence JSON.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "prompt"],
          description:
            "Output format. markdown returns the run report, json returns structured data, prompt returns only the repair prompt.",
        },
      },
    },
  },
  {
    name: "axint.run.status",
    description:
      "Read the latest or selected Axint run job record, including active child process IDs. " +
      "Use this when a long xcodebuild run may still be active after an MCP timeout or client disconnect.",
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
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        id: {
          type: "string",
          description: "Optional Axint run id. Defaults to latest active run.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.run.cancel",
    description:
      "Cancel the latest or selected Axint run by killing active child process groups. " +
      "Use this when xcodebuild or a UI-test runner survived an MCP timeout or transport close.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory. Defaults to the MCP process cwd.",
        },
        id: {
          type: "string",
          description: "Optional Axint run id. Defaults to latest active run.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "Output format. Defaults to markdown.",
        },
      },
    },
  },
  {
    name: "axint.tokens.ingest",
    description:
      "Ingest design tokens from JSON, JS/TS object exports, or CSS variables " +
      "and return a SwiftUI token enum. Use this before generating Swarm-style " +
      "views/components so agents can preserve exact brand colors, dimensions, " +
      "radii, spacing, and typography. No files are written.",
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
            "Inline token source. Supports JSON objects, JS/TS object exports, and CSS custom properties.",
        },
        sourcePath: {
          type: "string",
          description:
            "Path to a token file such as swarm-tokens.js, tokens.json, or tokens.css.",
        },
        namespace: {
          type: "string",
          description:
            "Swift enum namespace to generate. Example: SwarmTokens. Defaults to AxintDesignTokens.",
        },
        format: {
          type: "string",
          enum: ["swift", "json", "markdown"],
          description:
            "Output format. swift returns the SwiftUI token enum, json returns normalized tokens, markdown returns an audit report.",
        },
      },
    },
  },
  {
    name: "axint.schema.compile",
    description:
      "Compile a minimal JSON schema directly to Swift, bypassing the " +
      "TypeScript DSL entirely. Supports intents, views, components, widgets, and " +
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
          enum: ["intent", "view", "component", "widget", "app"],
          description:
            "What to compile. Determines which other parameters are relevant: " +
            "intent uses params/domain/title; view uses props/state/body; " +
            "component generates reusable SwiftUI building blocks; widget uses " +
            "entry/families/body/displayName; app uses scenes.",
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
        componentKind: {
          type: "string",
          enum: [
            "feedCard",
            "mediaCard",
            "utilityRow",
            "cardArchetypes",
            "avatar",
            "statusRing",
            "missionCard",
            "contextPanel",
            "contextUpdateCard",
            "decisionLog",
            "approvalCard",
            "agentRow",
            "roleCard",
            "signalCard",
            "channelRow",
            "sidebarRail",
            "profileCard",
            "settingsView",
            "semanticCard",
            "semanticRow",
            "semanticPill",
            "semanticPanel",
            "semanticBar",
            "semanticList",
            "custom",
          ],
          description:
            "Component only. Optional known component shape. Use cardArchetypes for a multi-component card kit, or omit to infer from name and description.",
        },
        tokenNamespace: {
          type: "string",
          description:
            "Optional Swift token enum generated by axint.tokens.ingest, e.g., " +
            "'SwarmTokens'. Generated views/components reference this namespace " +
            "for colors, radii, and layout dimensions.",
        },
        domain: {
          type: "string",
          description:
            "Apple App Intent domain. Intent only. One of: messaging, " +
            "productivity, health, social, finance, commerce, media, navigation, " +
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
            "E.g., { steps: 'int' }. Do not include date; Axint always generates " +
            "the TimelineEntry date property automatically. Available in the body template.",
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
        platform: {
          type: "string",
          enum: ["iOS", "macOS", "visionOS", "all"],
          description:
            "Optional target Apple platform hint for view/widget generation. " +
            "Use macOS when the host project is a Mac app. Defaults to all.",
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
        format: {
          type: "boolean",
          description:
            "When true (default), pipes generated Swift through swift-format " +
            "with Axint's house style. Falls back to raw output when " +
            "swift-format is not on $PATH. Set false to receive raw generator " +
            "output.",
        },
      },
      required: ["type", "name"],
    },
  },
  {
    name: "axint.swift.validate",
    description:
      "Validate existing Swift source against Axint's Apple-specific build-time rules " +
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
        format: {
          type: "boolean",
          description:
            "When true (default), pipes the repaired Swift through " +
            "swift-format with Axint's house style. Falls back to raw " +
            "output when swift-format is not on $PATH. Set false to " +
            "receive raw fixer output.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "axint.templates.list",
    description:
      "List all bundled reference templates in the Axint SDK. Returns " +
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

export const TOOL_TEXT_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    text: {
      type: "string" as const,
      description:
        "Primary Axint tool response text, matching the first text content block.",
    },
    isError: {
      type: "boolean" as const,
      description: "Whether Axint marked the tool response as an error.",
    },
  },
  required: ["text"],
  additionalProperties: false,
};

type RuntimeManifestEnv = {
  AXINT_MCP_FULL_MANIFEST?: string;
  AXINT_MCP_MANIFEST_MODE?: string;
  AXINT_MCP_TOOL_DESCRIPTION_CHARS?: string;
  AXINT_MCP_SCHEMA_DESCRIPTION_CHARS?: string;
  AXINT_MCP_NESTED_DESCRIPTION_CHARS?: string;
};

type CompactManifestOptions = {
  toolDescriptionChars: number;
  schemaDescriptionChars: number;
  nestedDescriptionChars: number;
};

const DEFAULT_RUNTIME_TOOL_DESCRIPTION_CHARS = 640;
const DEFAULT_RUNTIME_SCHEMA_DESCRIPTION_CHARS = 160;
const DEFAULT_RUNTIME_NESTED_DESCRIPTION_CHARS = 80;

/** Optional params keep a short hint; the full prose stays in full mode. */
const OPTIONAL_PROPERTY_DESCRIPTION_CHARS = 80;

/** Compact mode ships the output contract without the prose around it. */
const MINIMAL_TEXT_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    text: { type: "string" as const },
    isError: { type: "boolean" as const },
  },
  required: ["text"],
  additionalProperties: false,
};

// Hero tools lead the listing so a first-time agent sees the compile and
// validation loop before the long tail of session/agent plumbing.
const HERO_TOOL_ORDER = [
  "axint.compile",
  "axint.validate",
  "axint.swift.validate",
  "axint.swift.fix",
  "axint.scaffold",
  "axint.templates.list",
  "axint.templates.get",
  "axint.repair",
] as const;

function heroFirst<T extends { name: string }>(tools: readonly T[]): T[] {
  const rank = new Map<string, number>(
    HERO_TOOL_ORDER.map((name, index) => [name, index])
  );
  const heroes = [...tools]
    .filter((tool) => rank.has(tool.name))
    .sort((a, b) => rank.get(a.name)! - rank.get(b.name)!);
  return [...heroes, ...tools.filter((tool) => !rank.has(tool.name))];
}

export function getRuntimeToolManifest(env: RuntimeManifestEnv = {}) {
  const mode = env.AXINT_MCP_MANIFEST_MODE?.trim().toLowerCase();
  if (env.AXINT_MCP_FULL_MANIFEST === "1" || mode === "full" || mode === "verbose") {
    return heroFirst(withOutputSchemas(TOOL_MANIFEST));
  }

  return heroFirst(
    compactToolManifest({
      toolDescriptionChars: positiveEnvInt(
        env.AXINT_MCP_TOOL_DESCRIPTION_CHARS,
        DEFAULT_RUNTIME_TOOL_DESCRIPTION_CHARS
      ),
      schemaDescriptionChars: positiveEnvInt(
        env.AXINT_MCP_SCHEMA_DESCRIPTION_CHARS,
        DEFAULT_RUNTIME_SCHEMA_DESCRIPTION_CHARS
      ),
      nestedDescriptionChars: positiveEnvInt(
        env.AXINT_MCP_NESTED_DESCRIPTION_CHARS,
        DEFAULT_RUNTIME_NESTED_DESCRIPTION_CHARS
      ),
    })
  );
}

export function compactToolManifest(options: CompactManifestOptions) {
  return TOOL_MANIFEST.map((tool) => ({
    ...tool,
    description: compactToolDescription(tool, options.toolDescriptionChars),
    inputSchema: compactSchemaValue(tool.inputSchema, options, 0),
    outputSchema: MINIMAL_TEXT_OUTPUT_SCHEMA,
  })) as unknown as typeof TOOL_MANIFEST;
}

function compactToolDescription(
  tool: (typeof TOOL_MANIFEST)[number],
  maxChars: number
): string {
  // Each segment is compacted on its own so the Use/Inputs/Effects markers
  // survive however small the budget gets.
  const effects = RUNTIME_TOOL_EFFECTS[tool.name] ?? defaultEffectSummary(tool);
  const guidance = RUNTIME_TOOL_GUIDANCE[tool.name];
  const inputs = RUNTIME_TOOL_INPUTS[tool.name];
  const footerChars =
    ` Effects: ${effects}`.length +
    (guidance ? ` Use: ${guidance}`.length : 0) +
    (inputs ? ` Inputs: ${inputs}`.length : 0);
  const summaryChars = Math.max(120, maxChars - footerChars - 2);
  const detailChars = Math.max(48, Math.floor(Math.min(maxChars, 360) / 3));

  const parts = [compactDescription(tool.description, summaryChars)];
  if (guidance) parts.push(`Use: ${compactDescription(guidance, detailChars)}`);
  if (inputs) parts.push(`Inputs: ${compactDescription(inputs, detailChars)}`);
  parts.push(`Effects: ${compactDescription(effects, detailChars)}`);
  return parts.join(" ");
}

function defaultEffectSummary(tool: (typeof TOOL_MANIFEST)[number]): string {
  const annotations = tool.annotations;
  if (annotations.destructiveHint) {
    return annotations.openWorldHint
      ? "can modify local state and may use network; no source is sent unless an explicit argument says so."
      : "can modify local state; no network by default.";
  }
  if (annotations.readOnlyHint) {
    return annotations.openWorldHint
      ? "read-only result; may use network only for the documented remote mode."
      : "read-only result; writes no files and uses no network.";
  }
  return annotations.openWorldHint
    ? "may write local Axint artifacts and may use network for documented checks."
    : "may write local Axint artifacts; no network by default.";
}

const RUNTIME_TOOL_GUIDANCE: Record<string, string> = {
  "axint.status":
    "call first or after an MCP reload to prove the connected server version; do not use as an npm/PyPI lookup.",
  "axint.activate":
    "call immediately after install or first MCP connection; use validate or run for project checks.",
  "axint.upgrade":
    "call when axint.status shows a stale server; not for app dependency upgrades.",
  "axint.doctor":
    "call when MCP wiring, package paths, Xcode setup, or project memory may be stale; use run for build proof.",
  "axint.xcode.guard":
    "call around long Xcode tasks, context recovery, broad Swift edits, or before claiming runtime proof; use workflow.check outside Xcode.",
  "axint.xcode.write":
    "use only for guarded Xcode-project file writes; outside Xcode, patch normally and validate after.",
  "axint.session.start":
    "call at the start of a tool-enabled agent session or after context compaction.",
  "axint.feature":
    "use for new Apple-native surfaces; not for repairing existing app bugs.",
  "axint.project.pack":
    "use to bootstrap a new Apple project with Axint instructions; use project.index to inspect an existing project.",
  "axint.project.index":
    "use before project-aware repair, multi-file SwiftUI work, or interaction-risk analysis.",
  "axint.project.syncVersion":
    "use after package upgrades so local project-pack hints stop naming old Axint versions.",
  "axint.context.memory":
    "use after compaction or session restart for compact operating rules; use context.docs for longer workflow docs.",
  "axint.context.docs":
    "use after compaction when the agent needs workflow docs without rereading the whole site.",
  "axint.suggest":
    "use before generation to choose Apple surfaces; not a substitute for registry search or validation.",
  "axint.registry.search":
    "use before generating code to find reusable packages; not for validating local Swift.",
  "axint.workflow.check":
    "use at stage gates to prove workflow coverage; use status for version checks and run for build/test proof.",
  "axint.scaffold":
    "use to create a small TypeScript intent starter; use templates.get for richer examples and compile for Swift output.",
  "axint.compile":
    "use when TypeScript DSL source should become Swift; use validate for cheaper preflight only.",
  "axint.validate":
    "use for TypeScript DSL diagnostics before Swift output; use swift.validate for existing Swift.",
  "axint.fix-packet":
    "use after a local compile/watch/check emitted a packet; not a new analysis pass.",
  "axint.cloud.check":
    "use for Apple-aware source review and repair prompts; provide evidence for UI/runtime claims.",
  "axint.repair":
    "use for existing app bugs with logs, UI symptoms, or runtime evidence; not for greenfield generation.",
  "axint.feedback.create":
    "create a privacy-safe issue packet when output was weak, or read the latest packet; never use it to send source.",
  "axint.agent.install":
    "use once per project to create local multi-agent coordination; not needed for one-off compile.",
  "axint.agent.advice":
    "use when local proof should choose the next move; use suggest for greenfield ideas and repair for known bugs.",
  "axint.agent.claim":
    "use before editing shared files in parallel-agent work; release claims when done.",
  "axint.agent.release":
    "use after finishing or abandoning claimed files; use agent.claim before edits and agent.advice for next steps.",
  "axint.run":
    "use for the complete proof loop; use swift.validate, cloud.check, or fix-packet when only one stage is needed.",
  "axint.run.status":
    "use after MCP timeouts or long builds to inspect or rejoin; it does not start, rerun, or cancel work.",
  "axint.run.cancel":
    "use only to stop an active run or stuck child process group; use run.status for read-only inspection.",
  "axint.tokens.ingest":
    "use before view/component generation when a design system should be preserved.",
  "axint.schema.compile":
    "use for token-light JSON-to-Swift generation; use compile for full TypeScript DSL control and scaffold for TS starters.",
  "axint.swift.validate":
    "use on generated or edited Swift before build; pair with swift.fix for mechanical repairs.",
  "axint.swift.fix":
    "use after swift.validate when errors are mechanical; inspect remaining diagnostics manually.",
  "axint.templates.list": "use to discover valid template ids before templates.get.",
  "axint.templates.get":
    "use after templates.list to fetch a complete reference template; edit it before calling compile.",
};

const RUNTIME_TOOL_EFFECTS: Record<string, string> = {
  "axint.status": "read-only; writes no files; no auth or network required.",
  "axint.activate":
    "read-only built-in compiler smoke test; writes no files and uses no network.",
  "axint.upgrade":
    "destructive when apply=true: can run package installs, refresh Xcode wiring, and write .axint/upgrade; may use npm network.",
  "axint.doctor": "read-only inspection; writes no files; no auth or network required.",
  "axint.xcode.guard":
    "writes .axint/guard proof and may start a session; does not edit app source or use network.",
  "axint.xcode.write":
    "writes the requested file inside cwd, may create dirs, validates Swift, and may write guard/check artifacts.",
  "axint.session.start":
    "writes .axint/session and rehydration artifacts; no auth or network required.",
  "axint.feature": "read-only generated output; writes no files and uses no network.",
  "axint.project.pack":
    "read-only generated file pack; writes no files and uses no network.",
  "axint.project.index":
    "writes .axint/context unless dryRun=true; reads local project files only.",
  "axint.project.syncVersion":
    "updates Axint-owned project instruction files unless dryRun=true; no network.",
  "axint.context.memory":
    "read-only generated context; writes no files and uses no network.",
  "axint.context.docs":
    "read-only generated docs context; writes no files and uses no network.",
  "axint.suggest":
    "local mode is read-only; Pro mode may call Axint endpoint when credentials are configured.",
  "axint.registry.search":
    "read-only local registry search using AXINT_REGISTRY_PATH or sibling checkout; no network by default.",
  "axint.workflow.check":
    "writes a local .axint/session workflow freshness stamp; edits no app source and uses no network.",
  "axint.scaffold":
    "read-only generated TypeScript; writes no files and uses no network.",
  "axint.compile":
    "read-only generated Swift/diagnostics; writes no files and uses no network.",
  "axint.validate": "read-only diagnostics; writes no files and uses no network.",
  "axint.fix-packet":
    "read-only local artifact read; writes no files and uses no network.",
  "axint.cloud.check":
    "read-only response from provided source/path; may use configured Cloud Check endpoint; no source is sent unless provided.",
  "axint.repair":
    "writes .axint/repair and privacy-safe .axint/feedback artifacts; reads local project files.",
  "axint.feedback.create":
    "writes or reads redacted .axint/feedback packets; never includes source by default.",
  "axint.agent.install":
    "writes .axint/agent, context, and coordination files; no network.",
  "axint.agent.advice":
    "reads local Axint context/proof and may refresh advice artifacts; no network.",
  "axint.agent.claim":
    "writes local coordination claims under .axint/coordination; no network.",
  "axint.agent.release":
    "updates local coordination claims under .axint/coordination; no network.",
  "axint.run":
    "starts child processes, writes .axint/run artifacts, may run xcodebuild/tests, and may call Cloud Check.",
  "axint.run.status":
    "read-only local run/job inspection; writes no files and uses no network.",
  "axint.run.cancel": "destructive: kills active Axint child process groups; no network.",
  "axint.tokens.ingest":
    "read-only Swift token output; writes no files and uses no network.",
  "axint.schema.compile":
    "read-only Swift generation; writes no files and uses no network.",
  "axint.swift.validate":
    "read-only Swift diagnostics; writes no files and uses no network.",
  "axint.swift.fix":
    "read-only fixed-source output; writes no files and uses no network.",
  "axint.templates.list":
    "read-only template metadata; writes no files and uses no network.",
  "axint.templates.get":
    "read-only template source; writes no files and uses no network.",
};

const RUNTIME_TOOL_INPUTS: Record<string, string> = {
  "axint.status": "format changes rendering only; no project path is required.",
  "axint.activate":
    "format changes rendering only; the smoke test has no project inputs.",
  "axint.upgrade":
    "apply defaults false; targetVersion selects the install, while reinstallXcode and writeReport matter only when applying.",
  "axint.doctor":
    "cwd selects the project; expectedVersion turns a runtime mismatch into a blocker.",
  "axint.xcode.guard":
    "stage selects the gate; modifiedFiles and notes narrow drift checks; autoStartSession defaults true.",
  "axint.xcode.write":
    "path must remain inside cwd; createDirs, validateSwift, and cloudCheck default true.",
  "axint.session.start":
    "cwd scopes session files; prior token and context inputs preserve continuity after compaction.",
  "axint.feature":
    "description is the feature brief; kind and platform constrain the generated package.",
  "axint.project.pack":
    "cwd and projectName identify the project; host choices control generated integration files.",
  "axint.project.index":
    "changedFiles seed related-file discovery; dryRun returns the pack without writing .axint/context.",
  "axint.project.syncVersion":
    "cwd scopes Axint-owned files; targetVersion overrides running version; dryRun prevents writes.",
  "axint.context.memory":
    "cwd selects project memory; format changes rendering without changing content.",
  "axint.context.docs":
    "cwd selects project docs context; include sections only when the longer runbook is needed.",
  "axint.suggest":
    "prompt is the product brief; dir adds project context; Pro mode is used only when configured.",
  "axint.registry.search":
    "query drives ranking; kind and platform narrow results without changing the registry source.",
  "axint.workflow.check":
    "stage selects the gate; sessionToken proves continuity; allowNoSession is an explicit escape hatch.",
  "axint.scaffold":
    "name must be PascalCase; params define the starter contract; domain defaults to general.",
  "axint.compile":
    "source is TypeScript DSL text; options add sandbox, format, plist, or entitlement proof without writing files.",
  "axint.validate":
    "source is TypeScript DSL text; strictness options affect diagnostics only and never emit Swift.",
  "axint.fix-packet":
    "cwd and path locate an existing packet; latest selects the newest artifact and never reruns analysis.",
  "axint.cloud.check":
    "provide source or sourcePath, not both; evidence fields strengthen UI and runtime claims.",
  "axint.repair":
    "describe the observed bug and attach logs or evidence; modifiedFiles and project index narrow the plan.",
  "axint.feedback.create":
    "latest reads instead of creates; outcome and diagnostic fields stay source-free unless excerpts are explicit.",
  "axint.agent.install":
    "cwd scopes local coordination; projectName and hosts shape generated project-brain files.",
  "axint.agent.advice":
    "cwd selects local context; question and modifiedFiles focus the next-move recommendation.",
  "axint.agent.claim":
    "agentId and files identify the claim; ttlMinutes bounds ownership and force overrides stale claims.",
  "axint.agent.release":
    "agentId releases only its matching claims unless files narrow the release set.",
  "axint.run":
    "integration=minimal enforces local advisory no-fix behavior; background returns a job id; outputDir controls artifacts.",
  "axint.run.status":
    "jobId selects a background run; includeLogs changes returned detail without changing the job.",
  "axint.run.cancel":
    "jobId is required; signal and grace period control escalation before killing the process group.",
  "axint.tokens.ingest":
    "tokens accepts structured design values; enumName and accessLevel shape generated Swift names.",
  "axint.schema.compile":
    "schema kind selects intent, view, widget, or app output; options add companion metadata.",
  "axint.swift.validate":
    "source or sources provide Swift text; projectIndex enables cross-file checks; platform filters rules.",
  "axint.swift.fix":
    "source is required; codes limits mechanical rewrites; maxPasses bounds convergence attempts.",
  "axint.templates.list":
    "category and query filter metadata; call without filters to discover every valid id.",
  "axint.templates.get":
    "id must come from templates.list; format changes source versus metadata rendering.",
};

function withOutputSchemas<T extends { name: string }>(tools: readonly T[]) {
  return tools.map((tool) => ({
    ...tool,
    outputSchema: TOOL_TEXT_OUTPUT_SCHEMA,
  }));
}

function compactSchemaValue(
  value: unknown,
  options: CompactManifestOptions,
  depth: number,
  ownDescriptionChars?: number
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => compactSchemaValue(item, options, depth + 1));
  }

  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const limit =
    ownDescriptionChars ??
    (depth <= 2 ? options.schemaDescriptionChars : options.nestedDescriptionChars);
  const requiredNames = new Set(
    Array.isArray(record.required)
      ? record.required.filter((name): name is string => typeof name === "string")
      : []
  );

  const compacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (key === "description" && typeof nestedValue === "string") {
      if (limit <= 0) continue;
      compacted[key] = compactDescription(nestedValue, limit);
      continue;
    }

    if (
      depth === 0 &&
      key === "properties" &&
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      // Required params keep the full (capped) docs an agent needs to
      // call the tool; optional ones shrink to a short hint.
      const properties: Record<string, unknown> = {};
      for (const [name, property] of Object.entries(nestedValue)) {
        const propertyChars = requiredNames.has(name)
          ? options.schemaDescriptionChars
          : Math.min(OPTIONAL_PROPERTY_DESCRIPTION_CHARS, options.schemaDescriptionChars);
        properties[name] = compactSchemaValue(
          property,
          options,
          depth + 2,
          propertyChars
        );
      }
      compacted[key] = properties;
      continue;
    }

    compacted[key] = compactSchemaValue(nestedValue, options, depth + 1);
  }

  // No fallback where descriptions are budgeted out — re-adding filler
  // text would undo the compaction.
  if (limit > 0 && shouldAddFallbackDescription(compacted, depth)) {
    compacted.description = fallbackSchemaDescription(compacted);
  }

  return compacted;
}

function shouldAddFallbackDescription(
  value: Record<string, unknown>,
  depth: number
): boolean {
  if (depth <= 0 || typeof value.description === "string") return false;
  if (typeof value.type === "string") return true;
  if (Array.isArray(value.enum)) return true;
  return Boolean(value.properties || value.items || value.additionalProperties);
}

function fallbackSchemaDescription(value: Record<string, unknown>): string {
  const type = typeof value.type === "string" ? value.type : "value";
  if (Array.isArray(value.enum)) return `Allowed ${type} value for this Axint parameter.`;
  if (value.items) return `Array value for this Axint parameter.`;
  if (value.properties || value.additionalProperties) {
    return `Structured ${type} value for this Axint parameter.`;
  }
  return `${type[0]?.toUpperCase() ?? "V"}${type.slice(1)} value for this Axint parameter.`;
}

function compactDescription(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return ensureTerminalPunctuation(normalized);

  const safeLimit = Math.max(16, maxChars);
  const sentenceFit = compactToCompleteSentences(normalized, safeLimit);
  if (sentenceFit) return sentenceFit;

  const wordBoundary = normalized.lastIndexOf(" ", safeLimit - 1);
  const end = wordBoundary > 16 ? wordBoundary : safeLimit;
  const trimmed = normalized
    .slice(0, end)
    .replace(/[,;:–-]+\s*$/, "")
    .trim();
  return ensureTerminalPunctuation(trimmed);
}

function compactToCompleteSentences(value: string, maxChars: number): string | undefined {
  const matches = value
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  let out = "";
  for (const sentence of matches) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
  }
  return out || undefined;
}

function ensureTerminalPunctuation(value: string): string {
  if (!value) return value;
  if (/[.!?)]$/.test(value)) return value;
  return `${value}.`;
}

function positiveEnvInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
