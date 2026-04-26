import { describe, it, expect } from "vitest";
import { generateFeature } from "../../src/mcp/feature.js";
import { suggestFeatures, suggestFeaturesSmart } from "../../src/mcp/suggest.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";
import { buildProSuggestionRequest } from "../../src/mcp/pro-intelligence.js";

describe("axint.feature", () => {
  it("generates intent from natural language description", () => {
    const result = generateFeature({
      description: "Let users log water intake via Siri",
    });

    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);

    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).toContain("AppIntent");

    const testFile = result.files.find((f) => f.type === "test");
    expect(testFile).toBeDefined();
    expect(testFile!.content).toContain("XCTestCase");
  });

  it("generates intent + widget when both surfaces requested", () => {
    const result = generateFeature({
      description: "Track daily step count",
      surfaces: ["intent", "widget"],
    });

    expect(result.success).toBe(true);

    const swiftFiles = result.files.filter((f) => f.type === "swift");
    expect(swiftFiles.length).toBe(2);

    const widgetFile = swiftFiles.find((f) => f.path.includes("Widget"));
    expect(widgetFile).toBeDefined();
    expect(widgetFile!.content).toContain("Widget");
    expect(widgetFile!.content.match(/\blet date: Date\b/g)).toHaveLength(1);
    expect(widgetFile!.content).not.toContain("date: Date(), date:");
    expect(widgetFile!.content).not.toContain("WidgetWidget");
  });

  it("generates all three surfaces", () => {
    const result = generateFeature({
      description: "Log workouts with type and duration",
      surfaces: ["intent", "widget", "view"],
    });

    expect(result.success).toBe(true);

    const swiftFiles = result.files.filter((f) => f.type === "swift");
    expect(swiftFiles.length).toBe(3);
  });

  it("infers health domain from description", () => {
    const result = generateFeature({
      description: "Let users log calories burned during exercise",
    });

    expect(result.success).toBe(true);
    // health domain should add HealthKit entitlements
    const entFile = result.files.find((f) => f.type === "entitlements");
    expect(entFile).toBeDefined();
    expect(entFile!.content).toContain("healthkit");
  });

  it("uses explicit params when provided", () => {
    const result = generateFeature({
      description: "Log a custom metric",
      params: { value: "double", label: "string", timestamp: "date" },
    });

    expect(result.success).toBe(true);
    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).toContain("value");
    expect(intentFile!.content).toContain("label");
    expect(intentFile!.content).toContain("timestamp");
  });

  it("does not infer a generic input parameter for read-only query intents", () => {
    const result = generateFeature({
      description: "Check how many matches are waiting",
      surfaces: ["intent"],
      name: "CheckMatches",
    });

    expect(result.success).toBe(true);
    const intentFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("Intent")
    );
    expect(intentFile).toBeDefined();
    expect(intentFile!.content).not.toContain("@Parameter");
    expect(intentFile!.content).not.toContain("var input");
  });

  it("does not add HealthKit artifacts to non-health features just because domain is stale", () => {
    const result = generateFeature({
      description: "Check how many matches are waiting",
      surfaces: ["intent", "widget"],
      name: "CheckMatches",
      domain: "health",
    });

    expect(result.success).toBe(true);
    expect(result.files.find((f) => f.type === "entitlements")).toBeUndefined();
    expect(result.files.find((f) => f.type === "plist")).toBeUndefined();
  });

  it("uses explicit name when provided", () => {
    const result = generateFeature({
      description: "Track water intake",
      name: "HydrateNow",
    });

    expect(result.success).toBe(true);
    expect(result.name).toBe("HydrateNow");
    const intentFile = result.files.find((f) => f.path.includes("Intent"));
    expect(intentFile!.path).toContain("HydrateNow");
  });

  it("includes structured file paths for Xcode agent composition", () => {
    const result = generateFeature({
      description: "Send a message to a contact",
      surfaces: ["intent"],
    });

    expect(result.success).toBe(true);
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("Sources/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("Tests/"))).toBe(true);
  });

  it("generates summary with file listing", () => {
    const result = generateFeature({
      description: "Create a reminder",
      surfaces: ["intent", "widget"],
    });

    expect(result.summary).toContain("Generated scaffold");
    expect(result.summary).toContain("Swift file");
    expect(result.summary).toContain("test");
    expect(result.summary).toContain("editable first drafts");
    expect(result.summary).toContain("Files:");
  });

  it("accepts a macOS platform hint for starter SwiftUI views", () => {
    const result = generateFeature({
      description: "Track daily water intake",
      surfaces: ["view"],
      platform: "macOS",
    });

    const viewFile = result.files.find((f) => f.path.includes("View"));
    expect(viewFile).toBeDefined();
    expect(result.summary).toContain("Platform: macOS");
    expect(viewFile!.content).not.toContain("NavigationStack");
  });

  it("uses the description instead of a stale health domain for dating profile views", () => {
    const result = generateFeature({
      description:
        "A SwiftUI view showing a dating profile card with the person's photo, name, age, bio, and workout preferences. Has swipe left and right gesture support.",
      surfaces: ["view"],
      name: "SwipeProfileView",
      domain: "health",
      platform: "macOS",
    });

    expect(result.success).toBe(true);
    const viewFile = result.files.find(
      (f) => f.type === "swift" && f.path.includes("SwipeProfileView")
    );
    expect(viewFile).toBeDefined();
    expect(viewFile!.path).toBe("Sources/Views/SwipeProfileView.swift");
    expect(viewFile!.content).toContain("struct SwipeProfileView: View");
    expect(viewFile!.content).toContain("photoURL");
    expect(viewFile!.content).toContain("workoutPreferences");
    expect(viewFile!.content).not.toContain("SwipeProfileViewView");
    expect(viewFile!.content).not.toContain('duration: Measurement<UnitDuration> = ""');
    expect(viewFile!.content).not.toContain("calories");
    expect(result.files.find((f) => f.type === "entitlements")).toBeUndefined();
    expect(result.files.find((f) => f.type === "plist")).toBeUndefined();
    expect(
      result.files.find((f) => f.path === "Tests/SwipeProfileViewTests.swift")
    ).toBeDefined();
  });

  it("does not duplicate surface suffixes in feature output paths or structs", () => {
    const view = generateFeature({
      description: "Show a profile card",
      surfaces: ["view"],
      name: "ProfileCardView",
    });
    const widget = generateFeature({
      description: "Show today's suggested match",
      surfaces: ["widget"],
      name: "DailySwolemateWidget",
    });

    expect(view.files.map((f) => f.path).join("\n")).not.toContain("ViewView");
    expect(view.files.find((f) => f.type === "swift")!.content).not.toContain("ViewView");
    expect(widget.files.map((f) => f.path).join("\n")).not.toContain("WidgetWidget");
    expect(widget.files.find((f) => f.type === "swift")!.content).not.toContain(
      "WidgetWidget"
    );
  });

  it("generates a Swarm-style three-pane macOS shell from the description", () => {
    const result = generateFeature({
      description:
        "A three-pane layout with a 56px sidebar rail, 244px channels column, a flex content area for Swarm agent activity, and a 308px right Project Context pane.",
      surfaces: ["view"],
      name: "SwarmShellView",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    const viewFile = result.files.find((f) => f.type === "swift");
    expect(viewFile).toBeDefined();
    expect(viewFile!.content).toContain("HStack(spacing: 0)");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.sidebarRail");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.channelsColumn");
    expect(viewFile!.content).toContain("SwarmTokens.Layout.rightContextPane");
    expect(viewFile!.content).toContain("NORTH_STAR.md");
    expect(viewFile!.content).toContain(".frame(maxWidth: .infinity");
  });

  it("renames reserved SwiftUI state names in generated views", () => {
    const result = generateFeature({
      description: "A messaging profile card",
      surfaces: ["view"],
      name: "ProfileCardView",
      domain: "messaging",
      params: { body: "string", recipient: "string" },
    });

    const viewFile = result.files.find((f) => f.type === "swift");
    expect(viewFile).toBeDefined();
    expect(viewFile!.content).toContain("@State private var messageBody");
    expect(viewFile!.content).not.toContain("@State private var body");
  });

  it("self-validates generated Swift before returning feature output", () => {
    const result = generateFeature({
      description:
        "Create a mission review feature with a SwiftUI mission card, a status widget, and a Siri shortcut to open the mission.",
      surfaces: ["intent", "widget", "view"],
      name: "MissionReview",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
      params: {
        missionTitle: "string",
        owner: "string",
        priority: "string",
        progress: "double",
      },
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics.filter((d) => /\]\s+error\b/.test(d))).toEqual([]);

    for (const file of result.files.filter((f) => f.type === "swift")) {
      expect(validateSwiftSource(file.content, file.path).diagnostics).toEqual([]);
    }
  });

  it("generates reusable SwiftUI components as first-class feature output", () => {
    const result = generateFeature({
      description:
        "Reusable mission card component with title, owner, status, and progress for a Mac agent workspace",
      surfaces: ["component"],
      name: "MissionCard",
      componentKind: "missionCard",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    const component = result.files.find(
      (f) => f.path === "Sources/Components/MissionCard.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain("struct MissionCard: View");
    expect(component!.content).toContain("@State private var title");
    expect(component!.content).toContain("@State private var progress");
    expect(component!.content).not.toContain("missionTitle");
    expect(component!.content).toContain("ProgressView(value: progress)");
    expect(component!.content).toContain("SwarmTokens.Colors.accent");
    expect(
      result.files.find((f) => f.path === "Tests/MissionCardTests.swift")
    ).toBeDefined();
  });

  it("can generate a shared store and app shell for real project starts", () => {
    const result = generateFeature({
      description:
        "Create a Swarm mission workspace with shared mission state, a Mac app shell, and a mission dashboard",
      surfaces: ["store", "app", "component"],
      name: "MissionWorkspace",
      appName: "Swarm",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    expect(
      result.files.find((f) => f.path === "Sources/Stores/MissionWorkspaceStore.swift")
    ).toBeDefined();
    expect(
      result.files.find((f) => f.path === "Sources/App/SwarmApp.swift")
    ).toBeDefined();
    const store = result.files.find((f) => f.path.includes("Store.swift"));
    const component = result.files.find(
      (f) => f.path === "Sources/Components/MissionWorkspace.swift"
    );
    expect(store!.content).toContain("@Observable");
    expect(store!.content).toContain("func add");
    expect(store!.content).toContain("func updateStatus");
    expect(component!.content).toContain("ProgressView(value: progress)");
    expect(component!.content).not.toContain("missionTitle");
    expect(validateSwiftSource(store!.content, store!.path).diagnostics).toEqual([]);
  });

  it("generates a real settings view from settings-specific description cues", () => {
    const result = generateFeature({
      description:
        "App settings view with appearance mode segmented picker, accent color swatches, transcription engine picker, reduce motion toggle, and keyboard shortcuts.",
      surfaces: ["view"],
      name: "AppSettingsView",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    const view = result.files.find(
      (f) => f.path === "Sources/Views/AppSettingsView.swift"
    );
    expect(view).toBeDefined();
    expect(view!.content).toContain('Picker("Appearance"');
    expect(view!.content).toContain('Toggle("Reduce motion"');
    expect(view!.content).toContain("Keyboard Shortcuts");
    expect(view!.content).toContain("@State private var appearanceMode");
    expect(view!.content).not.toContain("Device:");
    expect(validateSwiftSource(view!.content, view!.path).diagnostics).toEqual([]);
  });

  it("generates a token-aware inbox view from search, filter, composer, and list cues", () => {
    const result = generateFeature({
      description:
        "Universal capture inbox with a composer, saved items by classification, filter bar for all unread pinned archived, search, action buttons to pin archive save to project summarize and turn into post, source badges, classification chips, tags, and related project.",
      surfaces: ["view"],
      name: "SwarmInbox",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
      domain: "productivity",
    });

    expect(result.success).toBe(true);
    const view = result.files.find(
      (f) => f.path === "Sources/Views/SwarmInboxView.swift"
    );
    expect(view).toBeDefined();
    expect(view!.content).toContain("TextEditor(text: $draftText)");
    expect(view!.content).toContain('TextField("Search saved items"');
    expect(view!.content).toContain('Picker("Filter"');
    expect(view!.content).toContain("List {");
    expect(view!.content).toContain("SwarmDesignTokens.Colors.surface");
    expect(view!.content).toContain("@State private var searchText");
    expect(view!.content).not.toContain("Title:");
    expect(view!.content).not.toContain("@State private var title");
    expect(view!.content).not.toContain("Date:");
    expect(view!.content).not.toContain("Notes:");
    expect(validateSwiftSource(view!.content, view!.path).diagnostics).toEqual([]);
  });

  it("uses nearby context as a structural hint for view generation", () => {
    const result = generateFeature({
      description: "Create the primary workspace shell for a Mac project room.",
      context:
        "Existing design uses a three-pane HSplitView with a 56px sidebar rail, 244px channels column, flexible content area, and right context pane.",
      surfaces: ["view"],
      name: "WorkspaceShell",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Context: nearby project/design context");
    const view = result.files.find(
      (f) => f.path === "Sources/Views/WorkspaceShellView.swift"
    );
    expect(view).toBeDefined();
    expect(view!.content).toContain("HStack(spacing: 0)");
    expect(view!.content).toContain("SwarmDesignTokens.Layout.sidebarRail");
    expect(view!.content).toContain("SwarmDesignTokens.Layout.channelsColumn");
    expect(view!.content).toContain("Context");
    expect(validateSwiftSource(view!.content, view!.path).diagnostics).toEqual([]);
  });

  it("infers collaboration parameters for agent mission workflows instead of generic input", () => {
    const result = generateFeature({
      description:
        "Let operators create an AI agent mission with owner, priority, status, and handoff review in a Swarm project room",
      surfaces: ["intent"],
      name: "CreateMission",
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Domain: collaboration");
    const intent = result.files.find((f) => f.path.includes("Intent"));
    expect(intent).toBeDefined();
    expect(intent!.content).toContain("missionTitle");
    expect(intent!.content).toContain("owner");
    expect(intent!.content).toContain("priority");
    expect(intent!.content).not.toContain("var input");
  });
});

describe("axint.suggest", () => {
  it("suggests health features for a fitness app", () => {
    const suggestions = suggestFeatures({
      appDescription: "A fitness tracking app that logs workouts and counts steps",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("health");
    expect(suggestions[0].surfaces.length).toBeGreaterThan(0);
    expect(suggestions[0].featurePrompt).toBeTruthy();
  });

  it("suggests finance features for a budget app", () => {
    const suggestions = suggestFeatures({
      appDescription: "An app for tracking expenses and managing budgets",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("finance");
  });

  it("respects explicit domain", () => {
    const suggestions = suggestFeatures({
      appDescription: "A general utility app",
      domain: "smart-home",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("smart-home");
  });

  it("lets appDescription override a stale explicit health domain for dating apps", () => {
    const suggestions = suggestFeatures({
      appDescription: "Tinder-style fitness dating app for gym people",
      domain: "health",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("social");
    expect(suggestions[0].name).toMatch(/Match|Profile/);
  });

  it("does not let stale dating context contaminate a collaboration app", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Swarm is a Mac app for AI agent mission control, team channels, project handoffs, operator approvals, and execution review. It is not a dating app and has nothing to do with dating.",
      domain: "social",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("collaboration");
    expect(suggestions.map((s) => s.domain)).not.toContain("social");
    expect(suggestions.some((s) => /dating|match|swolemate/i.test(s.featurePrompt))).toBe(
      false
    );
  });

  it("uses broader app context instead of falling back to collaboration for recipes", () => {
    const suggestions = suggestFeatures({
      appDescription: "A recipe and cooking app for meal plans and groceries",
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].domain).toBe("food");
  });

  it("honors explicit exclusions", () => {
    const suggestions = suggestFeatures({
      appDescription: "A community app with member profiles, groups, and event discovery",
      exclude: ["profile", "event"],
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => /profile|event/i.test(s.featurePrompt))).toBe(false);
  });

  it("falls back to local suggestions when pro mode has no authenticated endpoint", async () => {
    const previousProToken = process.env.AXINT_PRO_TOKEN;
    const previousProUrl = process.env.AXINT_PRO_SUGGEST_URL;
    const previousProInsightsUrl = process.env.AXINT_PRO_INSIGHTS_URL;
    const previousProInsights = process.env.AXINT_PRO_INSIGHTS;
    const previousEndpoint = process.env.AXINT_SUGGEST_AI_ENDPOINT;
    const previousEndpointToken = process.env.AXINT_SUGGEST_AI_TOKEN;
    process.env.AXINT_PRO_TOKEN = "";
    delete process.env.AXINT_PRO_SUGGEST_URL;
    delete process.env.AXINT_PRO_INSIGHTS_URL;
    delete process.env.AXINT_PRO_INSIGHTS;
    delete process.env.AXINT_SUGGEST_AI_ENDPOINT;
    process.env.AXINT_SUGGEST_AI_TOKEN = "";

    try {
      const suggestions = await suggestFeaturesSmart({
        appDescription: "A design review app for brand assets",
        mode: "pro",
      });

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].domain).toBe("creative");
    } finally {
      if (previousProToken) process.env.AXINT_PRO_TOKEN = previousProToken;
      else delete process.env.AXINT_PRO_TOKEN;
      if (previousProUrl) process.env.AXINT_PRO_SUGGEST_URL = previousProUrl;
      if (previousProInsightsUrl) {
        process.env.AXINT_PRO_INSIGHTS_URL = previousProInsightsUrl;
      }
      if (previousProInsights) process.env.AXINT_PRO_INSIGHTS = previousProInsights;
      if (previousEndpoint) {
        process.env.AXINT_SUGGEST_AI_ENDPOINT = previousEndpoint;
      }
      if (previousEndpointToken) {
        process.env.AXINT_SUGGEST_AI_TOKEN = previousEndpointToken;
      } else delete process.env.AXINT_SUGGEST_AI_TOKEN;
    }
  });

  it("keeps Pro suggestion requests as a sanitized OSS client contract", () => {
    const local = suggestFeatures({
      appDescription:
        "A Mac app for AI agent project rooms with missions, handoffs, voice capture, and context files",
      limit: 2,
    });
    const request = buildProSuggestionRequest(
      {
        appDescription:
          "A Mac app for AI agent project rooms with missions, handoffs, voice capture, and context files",
        mode: "pro",
        goals: ["activation", "retention"],
        stage: "mvp",
        constraints: ["macOS-native"],
      },
      local
    );

    expect(request.compiler.boundary).toBe("open-source-client");
    expect(request.input.mode).toBe("pro");
    expect(request.input.goals).toEqual(["activation", "retention"]);
    expect(JSON.stringify(request)).not.toMatch(
      /privatePrompt|systemPrompt|modelProvider|strategyPack/i
    );
  });

  it("creates app-specific fallback suggestions instead of generic domain guesses", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "A veterinary grooming booking app for salon owners to manage pets, pickup windows, and service notes",
      limit: 3,
    });

    expect(suggestions.length).toBe(3);
    expect(suggestions[0].domain).toBe("custom");
    expect(suggestions[0].name).toContain("Veterinary");
    expect(suggestions[0].rationale).toMatch(/app-specific/i);
    expect(suggestions.map((s) => s.domain)).not.toContain("collaboration");
    expect(suggestions.map((s) => s.domain)).not.toContain("health");
  });

  it("includes description cues in suggestion rationales", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "A Mac app for AI agent mission control, team channels, handoffs, approvals, and execution review",
      limit: 2,
    });

    expect(suggestions[0].domain).toBe("collaboration");
    expect(suggestions[0].rationale).toMatch(/agent|mission|team|channels/i);
  });

  it("can suggest reusable components for agent workspace apps", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "A Mac app for AI agent mission control with reusable mission cards, approval cards, agent rows, and project context panels",
      limit: 6,
    });

    expect(suggestions.some((s) => s.surfaces.includes("component"))).toBe(true);
    expect(
      suggestions.find((s) => s.surfaces.includes("component"))?.featurePrompt
    ).toMatch(/component/i);
  });

  it("can suggest shared stores for apps with cross-surface state", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "A Mac app for AI agent missions where views, widgets, and Siri shortcuts need shared mission state",
      limit: 8,
    });

    expect(suggestions.some((s) => s.surfaces.includes("store"))).toBe(true);
    expect(suggestions.some((s) => s.surfaces.includes("intent"))).toBe(true);
  });

  it("respects limit", () => {
    const suggestions = suggestFeatures({
      appDescription: "A fitness and health tracking app",
      limit: 3,
    });

    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("falls back to productivity for vague descriptions", () => {
    const suggestions = suggestFeatures({
      appDescription: "An app that helps users be more organized",
    });

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("each suggestion has all required fields", () => {
    const suggestions = suggestFeatures({
      appDescription: "A recipe and cooking app",
    });

    for (const s of suggestions) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.surfaces.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(s.complexity);
      expect(s.featurePrompt).toBeTruthy();
      expect(s.domain).toBeTruthy();
    }
  });
});
