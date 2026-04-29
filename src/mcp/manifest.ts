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
      "as the first tool in a new Codex, Claude, or Xcode agent chat to prove which Axint process " +
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
    name: "axint.upgrade",
    description:
      "Check the latest Axint package and optionally apply the upgrade while preserving " +
      "the current agent thread. Returns exact install commands, optional Xcode MCP " +
      "wiring refresh, .axint/upgrade/latest.* artifacts, and a same-thread resume " +
      "prompt so Codex, Claude, or Xcode can reload the MCP process without starting " +
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
      "this as the first Axint tool in Codex, Claude, or Xcode after a new chat, MCP reload, or " +
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
            enum: ["intent", "view", "widget", "component", "app", "store"],
          },
          description:
            "Which Apple surfaces to generate. 'intent' produces an App Intent " +
            "struct for Siri/Shortcuts/Spotlight. 'widget' produces a WidgetKit " +
            "widget with timeline provider. 'view' produces a SwiftUI view. " +
            "'component' produces a reusable SwiftUI component under Sources/Components. " +
            "'store' produces a shared Observable data store. 'app' produces a SwiftUI @main app shell. " +
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
      "so an Xcode/Codex/Claude agent can install the exact first-try workflow: read docs, " +
      "call axint.status, run workflow gates, validate Swift, run Cloud Check with evidence, " +
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
            "Optional product goals for Pro mode, such as activation, retention, conversion, speed, accessibility, or investor readiness.",
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
    name: "axint.workflow.check",
    description:
      "Read-only agent workflow gate. Requires the current Axint session token " +
      "from axint.session.start unless requireSession=false is explicitly set. " +
      "Use this at session start, after context compaction, before planning, writing, " +
      "building, or committing to make sure the agent has actually used the " +
      "right Axint tools: suggest for planning, feature for new surfaces, " +
      "swift.validate for modified Swift, cloud.check for coverage-aware " +
      "repair feedback, and Xcode build/test evidence for runtime proof. " +
      "For existing dirty SwiftUI files or Codex-style patch edits, it points " +
      "agents toward surgical patching plus validation instead of full-file writes. " +
      "A ready result is not a completion stamp: the response includes the next " +
      "Axint action the agent should call before returning to broad Apple-native work.",
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
            "Agent host/tool lane for this gate. Codex/Claude/Cowork/Cursor use patch-first lanes; Xcode may use Xcode guard/write.",
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
            "Inline Swift or Axint TypeScript source to check. Use this when the agent already has the code in memory.",
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
            "Optional Xcode build output. Cloud Check will classify recognized compile, availability, duplicate symbol, and conformance failures into actionable diagnostics.",
        },
        testFailure: {
          type: "string",
          description:
            "Optional failing unit/UI-test output. Use this when static checks pass but Xcode tests still fail; Cloud Check will look for element lookup, accessibility identifier, timeout, and runtime evidence patterns.",
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
            "Active host/tool lane. Axint adapts the repair plan so Codex/Claude/Cursor avoid Xcode-only write tools.",
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
      ".axint/context/latest.*, and .axint/coordination files so Codex, Claude, Cursor, " +
      "Xcode, OpenClaw, and humans coordinate through the same local truth layer.",
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
      "host-specific guidance for Codex, Claude, Cursor, Xcode, or another agent lane.",
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
      "a task. This keeps Codex, Claude, Cursor, and Xcode from blocking each other on stale claims.",
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
      "Use this when the agent might forget the Axint workflow: one tool call owns the gate.",
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
            "Changed Swift files to validate and Cloud Check. If omitted, Axint scans project Swift files.",
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
      "List all 26 bundled reference templates in the Axint SDK. Returns " +
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
