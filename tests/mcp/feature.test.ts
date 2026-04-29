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

  it("expands card archetype requests into distinct reusable components", () => {
    const result = generateFeature({
      description:
        "Create CardArchetypes: three distinct card components named FeedPostCard, ProjectMediaCard, and CompactUtilityRow. FeedPostCard needs an author avatar and action row. ProjectMediaCard needs an NSImage cover media slot and project metadata. CompactUtilityRow needs an icon, status, and trailing action. Use SwarmTokens.",
      surfaces: ["component"],
      name: "CardArchetypes",
      componentKind: "cardArchetypes",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    expect(
      result.files.find((f) => f.path === "Sources/Components/CardArchetypes.swift")
    ).toBeUndefined();

    const feed = result.files.find(
      (f) => f.path === "Sources/Components/FeedPostCard.swift"
    );
    const media = result.files.find(
      (f) => f.path === "Sources/Components/ProjectMediaCard.swift"
    );
    const utility = result.files.find(
      (f) => f.path === "Sources/Components/CompactUtilityRow.swift"
    );

    expect(feed).toBeDefined();
    expect(media).toBeDefined();
    expect(utility).toBeDefined();

    expect(feed!.content).toContain("struct FeedPostCard: View");
    expect(feed!.content).toContain("@State private var authorName");
    expect(feed!.content).toContain(
      'Label("\\(reactionCount)", systemImage: "sparkles")'
    );
    expect(feed!.content).toContain("SwarmTokens.Colors.accent");

    expect(media!.content).toContain("struct ProjectMediaCard: View");
    expect(media!.content).toContain("NSImage(named: coverImageName)");
    expect(media!.content).toContain("@State private var mediaLabel");

    expect(utility!.content).toContain("struct CompactUtilityRow: View");
    expect(utility!.content).toContain("@State private var iconName");
    expect(utility!.content).toContain('Image(systemName: "chevron.right")');

    for (const file of [feed!, media!, utility!]) {
      expect(file.content).not.toContain("ProgressView(value: progress)");
      expect(validateSwiftSource(file.content, file.path).diagnostics).toEqual([]);
    }
  });

  it("keeps existing context components out of new semantic panel output", () => {
    const result = generateFeature({
      description:
        "A scoped Swarm Home premium command-layer component. It should sit as a compact 15-20 percent top layer above the feed, preserve feed-first browsing, show command summary, status pills, ambient activity, composer interactivity, and use existing HomeFeedView, FeedPostCard, BuilderAvatarView, ProjectLogoView, and right rail context without replacing those existing types.",
      surfaces: ["component"],
      name: "HomeCommandLayer",
      componentKind: "semanticPanel",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
    });

    expect(result.success).toBe(true);
    const paths = result.files.map((f) => f.path).join("\n");
    expect(paths).toContain("Sources/Components/HomeCommandLayer.swift");
    expect(paths).not.toContain("Sources/Components/HomeFeedView.swift");
    expect(paths).not.toContain("Sources/Components/FeedPostCard.swift");
    expect(paths).not.toContain("Sources/Components/BuilderAvatarView.swift");
    expect(paths).not.toContain("Sources/Components/ProjectLogoView.swift");
    expect(paths).not.toContain("RightRail.swift");

    const component = result.files.find(
      (f) => f.path === "Sources/Components/HomeCommandLayer.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain("struct HomeCommandLayer: View");
    expect(component!.content).toContain("Command layer");
    expect(component!.content).toContain("TextField");
    expect(component!.content).toContain("SwarmDesignTokens.");
    expect(component!.content).toContain("maxHeight: 180");
    expect(component!.content).not.toContain("Approve");
    expect(component!.content).not.toContain("Defer");
    expect(validateSwiftSource(component!.content, component!.path).diagnostics).toEqual(
      []
    );
  });

  it("does not treat context-file symbols as requested output components", () => {
    const result = generateFeature({
      description:
        "Create a focused composer safety strip for the existing Breakaway messenger home screen. Keep it compact, preserve the current screen, and only add the new strip.",
      context: `
struct BreakawayMessengerView: View {
    var body: some View {
        ZStack {
            ThreadList()
            ComposerBox()
            ProjectLogoView()
            BuilderAvatarView()
            MessengerCornerPill()
        }
    }
}

struct ThreadList: View {}
struct ComposerBox: View {}
struct ProjectLogoView: View {}
struct BuilderAvatarView: View {}
struct MessengerCornerPill: View {}
`,
      surfaces: ["component"],
      name: "ComposerSafetyStrip",
      componentKind: "semanticPanel",
      platform: "macOS",
      tokenNamespace: "SwarmDesignTokens",
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics.join("\n")).not.toContain("AX850");

    const paths = result.files.map((f) => f.path).join("\n");
    expect(paths).toContain("Sources/Components/ComposerSafetyStrip.swift");
    expect(paths).not.toContain("BreakawayMessengerView.swift");
    expect(paths).not.toContain("ThreadList.swift");
    expect(paths).not.toContain("ProjectLogoView.swift");
    expect(paths).not.toContain("BuilderAvatarView.swift");
    expect(paths).not.toContain("MessengerCornerPill.swift");

    const component = result.files.find(
      (f) => f.path === "Sources/Components/ComposerSafetyStrip.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain("struct ComposerSafetyStrip: View");
    expect(component!.content).toContain("SwarmDesignTokens.");
    expect(validateSwiftSource(component!.content, component!.path).diagnostics).toEqual(
      []
    );
  });

  it("extracts named component kits instead of returning one generic scaffold", () => {
    const result = generateFeature({
      description:
        "Create a component kit with VoiceCaptureBar, AgentStatusPill, and ApprovalQueueRow for a Mac project room. Voice capture needs waveform, transcript status, and command action. Agent status needs online state. Approval queue needs risk and approve action.",
      surfaces: ["component"],
      name: "ProjectRoomKit",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    expect(
      result.files.find((f) => f.path === "Sources/Components/ProjectRoomKit.swift")
    ).toBeUndefined();

    const voice = result.files.find(
      (f) => f.path === "Sources/Components/VoiceCaptureBar.swift"
    );
    const pill = result.files.find(
      (f) => f.path === "Sources/Components/AgentStatusPill.swift"
    );
    const approval = result.files.find(
      (f) => f.path === "Sources/Components/ApprovalQueueRow.swift"
    );

    expect(voice?.content).toContain("struct VoiceCaptureBar: View");
    expect(voice?.content).toContain('TextField("Search voice capture bar"');
    expect(pill?.content).toContain("struct AgentStatusPill: View");
    expect(pill?.content).toContain("Capsule()");
    expect(approval?.content).toContain("struct ApprovalQueueRow: View");
    expect(approval?.content).toContain("Approve");

    for (const file of [voice!, pill!, approval!]) {
      expect(file.content).toContain("SwarmTokens.");
      expect(validateSwiftSource(file.content, file.path).diagnostics).toEqual([]);
    }
  });

  it("uses semantic UI signals to avoid generic view output for unknown products", () => {
    const result = generateFeature({
      description:
        "Create a semantic analytics dashboard with search, filters, metric cards, chart area, action toolbar, and review queue for a Mac project room.",
      surfaces: ["view"],
      name: "ProjectPulse",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    const view = result.files.find(
      (f) => f.path === "Sources/Views/ProjectPulseView.swift"
    );

    expect(result.success).toBe(true);
    expect(view?.content).toContain("TextField");
    expect(view?.content).toContain('Picker("Filter"');
    expect(view?.content).toContain("Menu");
    expect(view?.content).toContain("SwarmTokens.Colors.surfaceRaised");
    expect(view?.content).not.toContain('Text("Hello")');
    expect(validateSwiftSource(view!.content, view!.path).diagnostics).toEqual([]);
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

  it("keeps operating-model settings prompts out of generic feed-card output", () => {
    const result = generateFeature({
      description:
        "Project operating model settings view with visibility, invite policy, public modules, invite limits, member permissions, agent permissions, privacy posture, and integration readiness controls.",
      surfaces: ["component"],
      name: "ProjectOperatingModelSettings",
      componentKind: "settingsView",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    const component = result.files.find(
      (f) => f.path === "Sources/Components/ProjectOperatingModelSettings.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain('Picker("Visibility"');
    expect(component!.content).toContain('Picker("Invite policy"');
    expect(component!.content).toContain('Stepper("Invite limit');
    expect(component!.content).toContain('Toggle("Public modules enabled"');
    expect(component!.content).toContain('Toggle("Agents can publish drafts"');
    expect(component!.content).toContain('Picker("Privacy posture"');
    expect(component!.content).not.toContain("authorName");
    expect(component!.content).not.toContain("reactionCount");
    expect(component!.content).not.toContain("commentCount");
    expect(validateSwiftSource(component!.content, component!.path).diagnostics).toEqual(
      []
    );
  });

  it("lets trust-posture semantics outrank a generic context-panel hint", () => {
    const result = generateFeature({
      description:
        "CommandTrustPosture macOS component with ProjectOperatingModel visibility, invite policy, public modules, member permissions, agent permissions, privacy posture, reduced motion, and a primary route to Project Settings.",
      surfaces: ["component"],
      name: "CommandTrustPosture",
      componentKind: "contextPanel",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics.join("\n")).not.toContain("AX853");
    const component = result.files.find(
      (f) => f.path === "Sources/Components/CommandTrustPosture.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain("Trust posture");
    expect(component!.content).toContain("Text(visibility)");
    expect(component!.content).toContain("Text(invitePolicy)");
    expect(component!.content).toContain("publicModulesEnabled");
    expect(component!.content).toContain("membersCanInvite");
    expect(component!.content).toContain("agentsCanPublish");
    expect(component!.content).toContain("Project Settings");
    expect(component!.content).not.toContain("North Star");
    expect(validateSwiftSource(component!.content, component!.path).diagnostics).toEqual(
      []
    );
  });

  it("generates purpose-aware sparse states instead of a generic context panel", () => {
    const result = generateFeature({
      description:
        "Create a PurposeAwareSparseState macOS component that reuses Swarm empty-state patterns and produces purpose-aware sparse states for project command surfaces.",
      surfaces: ["component"],
      name: "PurposeAwareSparseState",
      componentKind: "contextPanel",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics.join("\n")).not.toContain("AX853");
    const component = result.files.find(
      (f) => f.path === "Sources/Components/PurposeAwareSparseState.swift"
    );
    expect(component).toBeDefined();
    expect(component!.content).toContain("Purpose-aware sparse state");
    expect(component!.content).toContain("Empty command surfaces");
    expect(component!.content).toContain("Create command");
    expect(component!.content).toContain("Attach context");
    expect(component!.content).not.toContain("North Star");
    expect(validateSwiftSource(component!.content, component!.path).diagnostics).toEqual(
      []
    );
  });

  it("fails closed instead of emitting semantically thin generic UI", () => {
    const result = generateFeature({
      description:
        "Create an Apple signing reliability console with provisioning profile mismatch, certificate expiry, notarization backlog, privacy manifest coverage, entitlement drift, and release captain escalation.",
      surfaces: ["component"],
      name: "SigningReliabilityConsole",
      componentKind: "custom",
      platform: "macOS",
      tokenNamespace: "SwarmTokens",
    });

    expect(result.success).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.summary).toContain("Generation quality gate stopped output");
    expect(result.summary).toContain("none emitted");
    expect(result.diagnostics.join("\n")).toContain("[AX853] error");
    expect(result.diagnostics.join("\n")).toContain("Do not emit a generic scaffold");
  });

  it("refuses existing-product repair prompts instead of replacing a working screen", () => {
    const result = generateFeature({
      description:
        "Fix the existing SwiftUI home feed where the comment box is visible but cannot be tapped, focused, or typed into after the new feature landed.",
      surfaces: ["component"],
      name: "HomeComposerRepair",
      componentKind: "custom",
      platform: "iOS",
    });

    expect(result.success).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.summary).toContain("existing-product Apple repair");
    expect(result.summary).toContain("none emitted");
    expect(result.diagnostics.join("\n")).toContain("[AX854] error");
    expect(result.diagnostics.join("\n")).toContain("axint.repair");
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

  it("adds app-specific adaptive suggestions for non-standard agent workflows", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "A Mac project room for AI agent coordination, voice capture, approval queues, context memory, and operator handoffs.",
      platform: "macOS",
      limit: 4,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].rationale).toContain("Generated from the app description");
    expect(suggestions[0].featurePrompt).toMatch(/project|agent|voice|context/i);
    expect(
      suggestions.some((s) => /dating|hydration|smart home/i.test(s.featurePrompt))
    ).toBe(false);
  });

  it("switches to existing-product repair mode for SwiftUI UX bugs", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Existing Discover tab scroll UX bug: the header sticks wrong, the tab loses position, and a focused Xcode UI test should prove the repair.",
      platform: "macOS",
      limit: 3,
    });

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].domain).toBe("repair");
    expect(suggestions[0].name).toMatch(/Repair Existing/i);
    expect(suggestions[0].featurePrompt).toMatch(
      /existing macOS discover screen SwiftUI flow/i
    );
    expect(suggestions[0].featurePrompt).toMatch(/smallest view\/state/i);
    expect(suggestions[1].featurePrompt).toMatch(/focused macOS Xcode/i);
    expect(suggestions.map((s) => s.domain)).not.toContain("collaboration");
  });

  it("preserves product nouns for existing command-center screen repairs", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Turn the existing macOS SwiftUI Project Room screen for My Project into a premium command center with launch readiness, Capture, Vault, Agents, existing tab routing, and primary actions.",
      platform: "macOS",
      limit: 4,
    });

    const routing = suggestions.find((suggestion) => /routing/i.test(suggestion.name));

    expect(suggestions[0].domain).toBe("repair");
    expect(suggestions[0].name).toMatch(/Project Room/i);
    expect(suggestions[0].featurePrompt).toMatch(/Project Room/);
    expect(suggestions[0].featurePrompt).toMatch(/My Project/);
    expect(suggestions[0].featurePrompt).toMatch(/command center/);
    expect(suggestions[0].featurePrompt).toMatch(/launch readiness/);
    expect(routing).toBeDefined();
    expect(routing!.featurePrompt).toMatch(/capture|run agent|launch check|open vault/i);
    expect(routing!.featurePrompt).toMatch(/tab routing|hittable|route/i);
    expect(routing!.nextStep).toMatch(/--only-testing/);
  });

  it("returns interaction blocker repair guidance when a visible composer stops accepting input", () => {
    const suggestions = suggestFeatures({
      appDescription:
        "Existing Home feed comment composer box is visible, but after adding a feature it no longer accepts taps or typing; likely overlay or disabled state is blocking TextEditor focus.",
      platform: "iOS",
      limit: 4,
    });

    const blocker = suggestions.find((suggestion) =>
      /Interaction Blockers/i.test(suggestion.name)
    );

    expect(suggestions[0].domain).toBe("repair");
    expect(blocker).toBeDefined();
    expect(blocker!.featurePrompt).toMatch(
      /allowsHitTesting|disabled|zIndex|FocusState|overlay/i
    );
    expect(blocker!.nextStep).toContain("axint project index");
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

  it("does not leak profile or swipe state into Swarm semantic interaction components", () => {
    const result = generateFeature({
      name: "SwarmPremiumInteractionSystem",
      surfaces: ["component"],
      platform: "macOS",
      componentKind: "semanticCard",
      description:
        "Premium reusable SwiftUI interaction polish for SWARM cards and buttons. Build press feedback, hover lift, uniform card rhythm, and project-command copy across existing Home, Discover, Profile, Project, and Breakaway surfaces.",
      context: [
        "enum SwarmAnimations { static let quick = 0.16 }",
        "enum SwarmDesignTokens { enum Colors { static let accent = Color.orange } }",
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    const swift = result.files.find((file) =>
      file.path.endsWith("SwarmPremiumInteractionSystem.swift")
    )?.content;
    expect(swift).toBeDefined();
    expect(swift!).toContain("Swarm Premium Interaction System");
    expect(swift!).toContain("Press");
    expect(swift!).toContain("Hover");
    expect(swift!).toContain("Rhythm");
    expect(swift!).toContain("Discover");
    expect(swift!).toContain("Breakaway");
    expect(swift!).not.toMatch(
      /photoURL|workoutPreferences|swipeOffset|lastAction|\bage\b|\bbio\b/i
    );
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
