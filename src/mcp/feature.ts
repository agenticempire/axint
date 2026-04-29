/**
 * axint.feature — High-level Apple-native feature generator.
 *
 * Takes a feature description and optional surface list, then orchestrates
 * the compiler to produce a scaffolded, file-by-file feature package:
 * Swift sources, Info.plist fragments, entitlements, and XCTest scaffolds.
 *
 * Designed for composition with Xcode's MCP tools — the agent calls
 * axint.feature to generate the package, then uses XcodeWrite to place
 * each file in the project.
 */

import {
  generateEntitlementsFragment,
  generateInfoPlistFragment,
  generateSwift,
} from "../core/generator.js";
import { generateSwiftApp } from "../core/app-generator.js";
import { generateSwiftUIView } from "../core/view-generator.js";
import { generateSwiftWidget } from "../core/widget-generator.js";
import type {
  Diagnostic,
  IRApp,
  IRIntent,
  IRView,
  IRWidget,
  IRWidgetEntry,
  IRParameter,
  IRType,
  IRViewState,
  WidgetFamily,
} from "../core/types.js";
import { isPrimitiveType, type IRPrimitiveType } from "../core/types.js";
import { validateApp, validateSwiftAppSource } from "../core/app-validator.js";
import { validateIntent } from "../core/validator.js";
import { validateSwiftSource } from "../core/swift-validator.js";
import { validateView, validateSwiftUISource } from "../core/view-validator.js";
import { validateWidget, validateSwiftWidgetSource } from "../core/widget-validator.js";
import {
  buildSmartViewBody,
  reservedViewPropertyName,
  usesSettingsBlueprint,
  usesOperatingModelSettings,
  usesProfileCardBlueprint,
  usesInboxBlueprint,
  usesTrustPostureBlueprint,
} from "./view-blueprints.js";
import {
  auditGeneratedFeature,
  inferSemanticComponentArchetypes,
  inferSemanticComponentKind,
  usesSemanticLayout,
} from "./semantic-planner.js";
import { analyzeAppleRepairTask, formatAppleRepairRead } from "../repair/intelligence.js";

export type Surface = "intent" | "view" | "widget" | "component" | "app" | "store";

export interface FeatureInput {
  description: string;
  surfaces?: Surface[];
  name?: string;
  appName?: string;
  domain?: string;
  params?: Record<string, string>;
  platform?: "iOS" | "macOS" | "visionOS" | "all";
  tokenNamespace?: string;
  componentKind?: string;
  context?: string;
}

export interface FeatureFile {
  path: string;
  content: string;
  type: "swift" | "plist" | "entitlements" | "test";
}

export interface FeatureResult {
  success: boolean;
  name: string;
  files: FeatureFile[];
  summary: string;
  diagnostics: string[];
}

const DOMAIN_ENTITLEMENTS: Record<string, string[]> = {
  health: ["com.apple.developer.healthkit"],
  messaging: ["com.apple.developer.siri"],
  "smart-home": ["com.apple.developer.homekit"],
  navigation: ["com.apple.developer.siri"],
  productivity: ["com.apple.developer.siri"],
};

const DOMAIN_PLIST_KEYS: Record<string, Record<string, string>> = {
  health: {
    NSHealthShareUsageDescription: "Read health data to provide insights.",
    NSHealthUpdateUsageDescription: "Save health data you log.",
  },
};

/**
 * Generate a scaffolded Apple-native feature package from a description.
 */
export function generateFeature(input: FeatureInput): FeatureResult {
  const name = input.name || inferName(input.description);
  const planningDescription = withContext(input.description, input.context);
  const surfaces = input.surfaces?.length ? input.surfaces : (["intent"] as Surface[]);
  const domain = resolveDomain(planningDescription, input.domain);
  const params = input.params || inferParams(planningDescription, domain, surfaces);
  const shouldEmitArtifacts = shouldEmitDomainArtifacts(domain, planningDescription);
  const diagnostics: string[] = [];
  const files: FeatureFile[] = [];

  const repairRead = analyzeAppleRepairTask({
    text: input.description,
    source: input.context,
    fileName: input.name,
    platform: input.platform,
  });
  if (
    repairRead.isExistingProductRepair &&
    surfaces.some((surface) => ["view", "component", "store", "app"].includes(surface))
  ) {
    return {
      success: false,
      name,
      files: [],
      summary: [
        `Generation quality gate stopped output for "${name}"`,
        "Reason: Axint detected an existing-product Apple repair request, not a new scaffold request.",
        ...formatAppleRepairRead(repairRead),
        "Next: run `axint repair` with the failing source/evidence, or ask `axint.suggest` for a proof-first repair loop.",
        "Files:",
        "  none emitted because replacing an existing product screen would be unsafe",
      ].join("\n"),
      diagnostics: [
        `[AX854] error: Existing-product repair prompt should use axint.repair instead of axint.feature\n  help: ${repairRead.summary}`,
      ],
    };
  }

  // --- Intent surface ---
  if (surfaces.includes("intent")) {
    const intentName = withoutSuffix(name, "Intent");
    const intentResult = buildIntent(
      intentName,
      planningDescription,
      domain,
      params,
      shouldEmitArtifacts
    );
    if (intentResult.swift) {
      files.push({
        path: `Sources/Intents/${withSuffix(intentName, "Intent")}.swift`,
        content: intentResult.swift,
        type: "swift",
      });
    }
    if (intentResult.plist) {
      files.push({
        path: `Sources/Supporting/Info.plist.fragment.xml`,
        content: intentResult.plist,
        type: "plist",
      });
    }
    if (intentResult.entitlements) {
      files.push({
        path: `Sources/Supporting/${intentName}.entitlements.fragment.xml`,
        content: intentResult.entitlements,
        type: "entitlements",
      });
    }
    files.push({
      path: `Tests/${withSuffix(intentName, "Intent")}Tests.swift`,
      content: generateIntentTest(intentName, params),
      type: "test",
    });
    diagnostics.push(...intentResult.diagnostics);
  }

  // --- Widget surface ---
  if (surfaces.includes("widget")) {
    const widgetName = withoutSuffix(name, "Widget");
    const widgetResult = buildWidget(widgetName, planningDescription, domain, params);
    if (widgetResult.swift) {
      files.push({
        path: `Sources/Widgets/${withSuffix(widgetName, "Widget")}.swift`,
        content: widgetResult.swift,
        type: "swift",
      });
    }
    files.push({
      path: `Tests/${withSuffix(widgetName, "Widget")}Tests.swift`,
      content: generateWidgetTest(widgetName),
      type: "test",
    });
    diagnostics.push(...widgetResult.diagnostics);
  }

  // --- View surface ---
  if (surfaces.includes("view")) {
    const viewName = withSuffix(withoutSuffix(name, "View"), "View");
    const viewResult = buildView(
      viewName,
      planningDescription,
      params,
      input.platform,
      input.tokenNamespace
    );
    if (viewResult.swift) {
      files.push({
        path: `Sources/Views/${viewName}.swift`,
        content: viewResult.swift,
        type: "swift",
      });
    }
    files.push({
      path: `Tests/${viewName}Tests.swift`,
      content: generateViewTest(viewName),
      type: "test",
    });
    diagnostics.push(...viewResult.diagnostics);
  }

  // --- Component surface ---
  if (surfaces.includes("component")) {
    const componentName = withoutSuffix(withoutSuffix(name, "View"), "Component");
    const archetypes = inferComponentArchetypes(
      input.description,
      componentName,
      input.componentKind
    );

    if (archetypes.length > 0) {
      for (const archetype of archetypes) {
        const componentResult = buildView(
          archetype.name,
          `${planningDescription}\n\nComponent archetype: ${archetype.description}`,
          input.params ?? {},
          input.platform,
          input.tokenNamespace,
          archetype.kind
        );
        if (componentResult.swift) {
          files.push({
            path: `Sources/Components/${archetype.name}.swift`,
            content: componentResult.swift,
            type: "swift",
          });
        }
        files.push({
          path: `Tests/${archetype.name}Tests.swift`,
          content: generateViewTest(archetype.name),
          type: "test",
        });
        diagnostics.push(...componentResult.diagnostics);
      }
    } else {
      const componentKind =
        input.componentKind ??
        inferComponentKindForFeature(input.description, componentName);
      const componentResult = buildView(
        componentName,
        planningDescription,
        input.params ?? {},
        input.platform,
        input.tokenNamespace,
        componentKind
      );
      if (componentResult.swift) {
        files.push({
          path: `Sources/Components/${componentName}.swift`,
          content: componentResult.swift,
          type: "swift",
        });
      }
      files.push({
        path: `Tests/${componentName}Tests.swift`,
        content: generateViewTest(componentName),
        type: "test",
      });
      diagnostics.push(...componentResult.diagnostics);
    }
  }

  // --- Store surface ---
  if (surfaces.includes("store")) {
    const storeName = withSuffix(withoutSuffix(name, "Store"), "Store");
    files.push({
      path: `Sources/Stores/${storeName}.swift`,
      content: buildStore(storeName, planningDescription, domain),
      type: "swift",
    });
    files.push({
      path: `Tests/${storeName}Tests.swift`,
      content: generateStoreTest(storeName),
      type: "test",
    });
  }

  // --- App surface ---
  if (surfaces.includes("app")) {
    const appName = withoutSuffix(input.appName || name, "App");
    const appResult = buildApp(appName, input.platform);
    if (appResult.swift) {
      files.push({
        path: `Sources/App/${withSuffix(appName, "App")}.swift`,
        content: appResult.swift,
        type: "swift",
      });
    }
    files.push({
      path: `Tests/${withSuffix(appName, "App")}Tests.swift`,
      content: generateAppTest(appName),
      type: "test",
    });
    diagnostics.push(...appResult.diagnostics);
  }

  diagnostics.push(...validateGeneratedSwift(files));

  // --- Domain-level entitlements ---
  if (
    domain &&
    surfaces.includes("intent") &&
    shouldEmitArtifacts &&
    DOMAIN_ENTITLEMENTS[domain] &&
    !files.some((f) => f.type === "entitlements")
  ) {
    files.push({
      path: `Sources/Supporting/${name}.entitlements.fragment.xml`,
      content: buildEntitlementsXml(DOMAIN_ENTITLEMENTS[domain]),
      type: "entitlements",
    });
  }

  // --- Domain-level plist ---
  if (
    domain &&
    surfaces.includes("intent") &&
    shouldEmitArtifacts &&
    DOMAIN_PLIST_KEYS[domain] &&
    !files.some((f) => f.type === "plist")
  ) {
    files.push({
      path: `Sources/Supporting/Info.plist.fragment.xml`,
      content: buildPlistXml(DOMAIN_PLIST_KEYS[domain]),
      type: "plist",
    });
  }

  diagnostics.push(...auditGeneratedFeature(input, files));

  const success = !diagnostics.some((d) => /^\[AX[^\]]+\]\s+error\b/.test(d));
  const qualityGateBlocked = diagnostics.some((d) => /^\[AX85[023]\]\s+error\b/.test(d));
  const emittedFiles = qualityGateBlocked ? [] : files;
  const surfaceList = surfaces.join(", ");
  const fileCount = emittedFiles.filter((f) => f.type === "swift").length;
  const testCount = emittedFiles.filter((f) => f.type === "test").length;

  const summary = [
    qualityGateBlocked
      ? `Generation quality gate stopped output for "${name}"`
      : `Generated scaffold: ${fileCount} Swift file${fileCount !== 1 ? "s" : ""} + ${testCount} test${testCount !== 1 ? "s" : ""} for "${name}"`,
    `Surfaces: ${surfaceList}`,
    input.platform ? `Platform: ${input.platform}` : null,
    domain ? `Domain: ${domain}` : null,
    qualityGateBlocked
      ? `Note: Axint refused to emit generic Swift because the generated UI did not preserve enough of the prompt. Use the diagnostics below as the repair brief, add context or a more specific component kind, then rerun axint.feature.`
      : `Note: generated files are editable first drafts; connect real persistence, app state, and product behavior before shipping.`,
    input.context
      ? `Context: nearby project/design context was used as a weak structural hint.`
      : null,
    `Files:`,
    ...(emittedFiles.length > 0
      ? emittedFiles.map((f) => `  ${f.path} (${f.type})`)
      : ["  none emitted because the generation quality gate failed"]),
  ]
    .filter(Boolean)
    .join("\n");

  return { success, name, files: emittedFiles, summary, diagnostics };
}

function withContext(description: string, context?: string): string {
  if (!context?.trim()) return description;
  return `${description}\n\nProject context hints:\n${context.trim().slice(0, 6000)}`;
}

function validateGeneratedSwift(files: FeatureFile[]): string[] {
  return files
    .filter((file) => file.type === "swift")
    .flatMap((file) =>
      validateSwiftSource(file.content, file.path).diagnostics.map((d) => {
        const location = d.line ? ` line ${d.line}` : "";
        const suggestion = d.suggestion ? `\n  help: ${d.suggestion}` : "";
        return `[${d.code}] ${d.severity}${location}: Generated ${file.path}: ${d.message}${suggestion}`;
      })
    );
}

function hasBlockingDiagnostic(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map(
    (diagnostic) => `[${diagnostic.code}] ${diagnostic.severity}: ${diagnostic.message}`
  );
}

// ─── Surface builders ───────────────────────────────────────────────

interface SurfaceOutput {
  swift: string | null;
  plist: string | null;
  entitlements: string | null;
  diagnostics: string[];
}

interface ComponentArchetype {
  name: string;
  kind: string;
  description: string;
}

function buildIntent(
  name: string,
  description: string,
  domain: string | undefined,
  params: Record<string, string>,
  shouldEmitArtifacts: boolean
): SurfaceOutput {
  const irParams = paramsToIR(params);
  const entitlements =
    domain && shouldEmitArtifacts ? DOMAIN_ENTITLEMENTS[domain] : undefined;
  const plistKeys = domain && shouldEmitArtifacts ? DOMAIN_PLIST_KEYS[domain] : undefined;

  const ir: IRIntent = {
    name,
    title: humanize(name),
    description,
    domain,
    parameters: irParams,
    returnType: { kind: "primitive", value: "string" },
    sourceFile: "<feature>",
    entitlements,
    infoPlistKeys: plistKeys,
  };

  const irDiagnostics = validateIntent(ir);
  if (hasBlockingDiagnostic(irDiagnostics)) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: formatDiagnostics(irDiagnostics),
    };
  }

  const swift = generateSwift(ir);
  const generatedDiagnostics = validateSwiftSource(
    swift,
    `${name}Intent.swift`
  ).diagnostics;
  const diagnostics = [...irDiagnostics, ...generatedDiagnostics];

  return {
    swift: hasBlockingDiagnostic(generatedDiagnostics) ? null : swift,
    plist: plistKeys ? (generateInfoPlistFragment(ir) ?? null) : null,
    entitlements: entitlements ? (generateEntitlementsFragment(ir) ?? null) : null,
    diagnostics: formatDiagnostics(diagnostics),
  };
}

function buildWidget(
  name: string,
  description: string,
  domain: string | undefined,
  params: Record<string, string>
): SurfaceOutput {
  const entries: IRWidgetEntry[] = Object.entries(params)
    .filter(([entryName]) => entryName !== "date")
    .slice(0, 4) // widgets get a subset of params as timeline entries
    .map(([entryName, typeStr]) => ({
      name: entryName,
      type: toIRType(typeStr),
    }));

  const families: WidgetFamily[] = ["systemSmall", "systemMedium"];
  const widgetName = withoutSuffix(name, "Widget");

  const ir: IRWidget = {
    name: widgetName,
    displayName: humanize(widgetName),
    description,
    families,
    entry: entries,
    body: [
      {
        kind: "raw",
        swift: buildWidgetBody(widgetName, entries),
      },
    ],
    refreshPolicy: "atEnd",
    sourceFile: "<feature>",
  };

  const irDiagnostics = validateWidget(ir);
  if (hasBlockingDiagnostic(irDiagnostics)) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: formatDiagnostics(irDiagnostics),
    };
  }

  const swift = generateSwiftWidget(ir);
  const generatedDiagnostics = validateSwiftWidgetSource(swift, ir.name);
  const diagnostics = [...irDiagnostics, ...generatedDiagnostics];

  return {
    swift: hasBlockingDiagnostic(generatedDiagnostics) ? null : swift,
    plist: null,
    entitlements: null,
    diagnostics: formatDiagnostics(diagnostics),
  };
}

function buildView(
  name: string,
  description: string,
  params: Record<string, string>,
  platform: FeatureInput["platform"] = "all",
  tokenNamespace?: string,
  componentKind?: string
): SurfaceOutput {
  const state: IRViewState[] = Object.entries(params).map(([propName, typeStr]) => ({
    name: reservedViewPropertyName(propName),
    type: toIRType(typeStr),
    kind: "state" as const,
    defaultValue: defaultForType(typeStr),
  }));

  if (usesProfileCardBlueprint(description)) {
    ensureState(state, "photoURL", "url", "https://example.com/profile.jpg");
    ensureState(state, "name", "string", "Alex");
    ensureState(state, "age", "int", 29);
    ensureState(
      state,
      "bio",
      "string",
      "Building strength, consistency, and better software."
    );
    ensureState(
      state,
      "workoutPreferences",
      "string",
      "Strength training · Morning sessions"
    );
    state.push(
      {
        name: "swipeOffset",
        type: { kind: "primitive", value: "double" },
        kind: "state",
        defaultValue: 0,
      },
      {
        name: "lastAction",
        type: { kind: "primitive", value: "string" },
        kind: "state",
        defaultValue: "Ready to swipe",
      }
    );
  }

  if (usesSettingsBlueprint(description)) {
    ensureState(state, "appearanceMode", "string", "System");
    ensureState(state, "accentColor", "string", "Blue");
    ensureState(state, "transcriptionEngine", "string", "Apple Speech");
    ensureState(state, "reduceMotion", "boolean", false);
    if (usesOperatingModelSettings(description)) {
      ensureState(state, "visibility", "string", "Invite only");
      ensureState(state, "invitePolicy", "string", "Owner approval");
      ensureState(state, "inviteLimit", "int", 25);
      ensureState(state, "publicModulesEnabled", "boolean", true);
      ensureState(state, "membersCanInvite", "boolean", false);
      ensureState(state, "agentsCanPublish", "boolean", false);
      ensureState(state, "requireReview", "boolean", true);
      ensureState(state, "privacyPosture", "string", "Strict");
      ensureState(state, "integrationReadiness", "string", "Ready");
    }
  }

  if (usesTrustPostureBlueprint(`${name} ${description}`)) {
    ensureState(state, "visibility", "string", "Invite only");
    ensureState(state, "invitePolicy", "string", "Owner approval");
    ensureState(state, "publicModulesEnabled", "boolean", true);
    ensureState(state, "membersCanInvite", "boolean", false);
    ensureState(state, "agentsCanPublish", "boolean", false);
    ensureState(state, "privacyPosture", "string", "Strict");
    ensureState(state, "reduceMotion", "boolean", false);
  }

  if (usesInboxBlueprint(description)) {
    ensureState(state, "searchText", "string", "");
    ensureState(state, "selectedFilter", "string", "All");
    ensureState(state, "draftText", "string", "");
  }

  ensureBlueprintState(state, name, description, componentKind);

  const ir: IRView = {
    name,
    props: [],
    state,
    body: [
      {
        kind: "raw",
        swift: buildViewBody(
          name,
          description,
          state,
          platform,
          tokenNamespace,
          componentKind
        ),
      },
    ],
    sourceFile: "<feature>",
  };

  const irDiagnostics = validateView(ir);
  if (hasBlockingDiagnostic(irDiagnostics)) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: formatDiagnostics(irDiagnostics),
    };
  }

  const swift = generateSwiftUIView(ir);
  const generatedDiagnostics = validateSwiftUISource(swift);
  const diagnostics = [...irDiagnostics, ...generatedDiagnostics];

  return {
    swift: hasBlockingDiagnostic(generatedDiagnostics) ? null : swift,
    plist: null,
    entitlements: null,
    diagnostics: formatDiagnostics(diagnostics),
  };
}

function buildApp(
  name: string,
  platform: FeatureInput["platform"] = "all"
): SurfaceOutput {
  const platformGuard =
    platform === "macOS" || platform === "iOS" || platform === "visionOS"
      ? platform
      : undefined;
  const ir: IRApp = {
    name,
    scenes: [
      {
        sceneKind: "windowGroup",
        rootView: "ContentView",
        title: humanize(name),
        isDefault: true,
        platformGuard,
      },
    ],
    sourceFile: "<feature>",
  };

  const irDiagnostics = validateApp(ir);
  if (hasBlockingDiagnostic(irDiagnostics)) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: formatDiagnostics(irDiagnostics),
    };
  }

  const swift = generateSwiftApp(ir);
  const generatedDiagnostics = validateSwiftAppSource(swift, ir.name);
  const diagnostics = [...irDiagnostics, ...generatedDiagnostics];

  return {
    swift: hasBlockingDiagnostic(generatedDiagnostics) ? null : swift,
    plist: null,
    entitlements: null,
    diagnostics: formatDiagnostics(diagnostics),
  };
}

function buildStore(
  name: string,
  description: string,
  domain: string | undefined
): string {
  const itemName = withoutSuffix(name, "Store") + "Item";
  const titleSeed =
    domain === "collaboration"
      ? "New mission"
      : domain === "developer-tools"
        ? "Run project check"
        : domain === "social"
          ? "New profile"
          : "New item";
  const statusSeed =
    domain === "collaboration"
      ? "ready"
      : domain === "developer-tools"
        ? "queued"
        : domain === "social"
          ? "new"
          : "active";

  return `import Foundation
import Observation

struct ${itemName}: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var detail: String
    var status: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        title: String,
        detail: String = "",
        status: String = "${statusSeed}",
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.detail = detail
        self.status = status
        self.createdAt = createdAt
    }
}

@MainActor
@Observable
final class ${name} {
    var items: [${itemName}] = [
        ${itemName}(title: "${escapeSwiftLiteral(titleSeed)}", detail: "${escapeSwiftLiteral(description)}")
    ]
    var selectedID: UUID?

    var selectedItem: ${itemName}? {
        guard let selectedID else { return items.first }
        return items.first { $0.id == selectedID }
    }

    func add(title: String, detail: String = "", status: String = "${statusSeed}") {
        let item = ${itemName}(title: title, detail: detail, status: status)
        items.insert(item, at: 0)
        selectedID = item.id
    }

    func updateStatus(for id: UUID, status: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].status = status
    }
}
`;
}

function ensureState(
  state: IRViewState[],
  name: string,
  type: string,
  defaultValue: unknown
): void {
  if (state.some((entry) => entry.name === name)) return;
  state.push({
    name,
    type: toIRType(type),
    kind: "state",
    defaultValue,
  });
}

function ensureBlueprintState(
  state: IRViewState[],
  name: string,
  description: string,
  componentKind?: string
): void {
  const explicitKind = (componentKind ?? "").replace(/[\s_-]+/g, "").toLowerCase();
  const haystack = `${componentKind ?? ""} ${name} ${description}`
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
  const matchesKind = (...kinds: string[]) =>
    explicitKind
      ? kinds.includes(explicitKind)
      : kinds.some((kind) => haystack.includes(kind));

  if (matchesKind("feedcard", "feedpostcard")) {
    ensureState(state, "authorName", "string", "Nima Nejat");
    ensureState(state, "authorInitials", "string", "NN");
    ensureState(state, "headline", "string", "Visual overhaul is ready for review");
    ensureState(
      state,
      "bodyText",
      "string",
      "Three reusable card archetypes now cover feed posts, project media, and compact utility actions."
    );
    ensureState(state, "reactionCount", "int", 24);
    ensureState(state, "commentCount", "int", 7);
    ensureState(state, "isPinned", "boolean", true);
  }

  if (matchesKind("mediacard", "projectmediacard")) {
    ensureState(state, "coverImageName", "string", "project-cover");
    ensureState(state, "coverSymbol", "string", "photo.on.rectangle.angled");
    ensureState(state, "title", "string", "Launch Room");
    ensureState(state, "subtitle", "string", "Prototype, assets, and notes");
    ensureState(state, "mediaLabel", "string", "NSImage-ready cover slot");
    ensureState(state, "status", "string", "Ready");
    ensureState(state, "actionTitle", "string", "Open");
  }

  if (matchesKind("utilityrow", "compactutilityrow")) {
    ensureState(state, "iconName", "string", "bolt.fill");
    ensureState(state, "title", "string", "Run polish pass");
    ensureState(state, "subtitle", "string", "Tighten the room before handoff");
    ensureState(state, "status", "string", "Live");
    ensureState(state, "isActive", "boolean", true);
  }

  if (matchesKind("missioncard")) {
    ensureState(state, "title", "string", "Launch mission");
    ensureState(state, "subtitle", "string", "Owned by Design Agent");
    ensureState(state, "status", "string", "ready");
    ensureState(state, "progress", "double", 0.42);
  }

  if (matchesKind("avatar")) {
    ensureState(state, "initials", "string", "AE");
    ensureState(state, "status", "string", "online");
  }

  if (matchesKind("statusring")) {
    ensureState(state, "value", "double", 0.72);
    ensureState(state, "label", "string", "Ready");
  }

  if (matchesKind("channelrow")) {
    ensureState(state, "title", "string", "agents");
    ensureState(state, "isSelected", "boolean", true);
    ensureState(state, "unreadCount", "int", 3);
  }

  if (matchesKind("agentrow")) {
    ensureState(state, "name", "string", "Research Agent");
    ensureState(state, "role", "string", "Tracks the frontier");
    ensureState(state, "status", "string", "awake");
  }

  if (matchesKind("settingsview", "settings", "preferences")) {
    ensureState(state, "appearanceMode", "string", "System");
    ensureState(state, "accentColor", "string", "Blue");
    ensureState(state, "transcriptionEngine", "string", "Apple Speech");
    ensureState(state, "reduceMotion", "boolean", false);
    if (usesOperatingModelSettings(description)) {
      ensureState(state, "visibility", "string", "Invite only");
      ensureState(state, "invitePolicy", "string", "Owner approval");
      ensureState(state, "inviteLimit", "int", 25);
      ensureState(state, "publicModulesEnabled", "boolean", true);
      ensureState(state, "membersCanInvite", "boolean", false);
      ensureState(state, "agentsCanPublish", "boolean", false);
      ensureState(state, "requireReview", "boolean", true);
      ensureState(state, "privacyPosture", "string", "Strict");
      ensureState(state, "integrationReadiness", "string", "Ready");
    }
  }
}

// ─── Test generators ────────────────────────────────────────────────

function generateIntentTest(name: string, params: Record<string, string>): string {
  const paramSetup = Object.entries(params)
    .map(
      ([p, t]) =>
        `        intent.${safeIntentTestPropertyName(p)} = ${testValueForType(t)}`
    )
    .join("\n");

  return `import XCTest
import AppIntents

final class ${name}IntentTests: XCTestCase {
    func test${name}IntentConformance() {
        let intent = ${name}Intent()
        XCTAssertNotNil(intent)
    }

    func test${name}IntentTitle() {
        let intent = ${name}Intent()
        XCTAssertFalse(intent.title.description.isEmpty)
    }

    func test${name}IntentPerform() async throws {
        var intent = ${name}Intent()
${paramSetup}
        let result = try await intent.perform()
        XCTAssertNotNil(result)
    }
}
`;
}

function safeIntentTestPropertyName(name: string): string {
  if (name === "title") return "intentTitle";
  if (name === "description") return "intentDescription";
  if (
    [
      "parameterSummary",
      "perform",
      "isDiscoverable",
      "openAppWhenRun",
      "authenticationPolicy",
    ].includes(name)
  ) {
    return `${name}Value`;
  }
  return name;
}

function generateWidgetTest(name: string): string {
  return `import XCTest
import WidgetKit

final class ${name}WidgetTests: XCTestCase {
    func test${name}WidgetConfiguration() {
        // Verify widget can be instantiated
        let widget = ${name}Widget()
        XCTAssertNotNil(widget)
    }
}
`;
}

function generateViewTest(name: string): string {
  return `import XCTest
import SwiftUI

final class ${name}Tests: XCTestCase {
    func test${name}CanBeInstantiated() {
        let view = ${name}()
        XCTAssertNotNil(view)
    }
}
`;
}

function generateStoreTest(name: string): string {
  return `import XCTest

@MainActor
final class ${name}Tests: XCTestCase {
    func test${name}AddsItems() {
        let store = ${name}()
        let before = store.items.count
        store.add(title: "Test item", detail: "Created by test")
        XCTAssertEqual(store.items.count, before + 1)
        XCTAssertEqual(store.items.first?.title, "Test item")
    }
}
`;
}

function generateAppTest(name: string): string {
  return `import XCTest
import SwiftUI

final class ${name}AppTests: XCTestCase {
    func test${name}AppCanBeInstantiated() {
        let app = ${name}App()
        XCTAssertNotNil(app)
    }
}
`;
}

// ─── Inference helpers ──────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  collaboration: [
    "swarm",
    "agent",
    "agents",
    "mission",
    "missions",
    "workspace",
    "team",
    "collaboration",
    "project",
    "projects",
    "channel",
    "channels",
    "handoff",
    "handoffs",
    "approval",
    "approvals",
    "operator",
    "execution",
    "review",
  ],
  "developer-tools": [
    "developer",
    "code",
    "coding",
    "compiler",
    "repo",
    "github",
    "pull request",
    "xcode",
    "build",
    "test",
    "tests",
    "ci",
    "deploy",
    "diagnostic",
    "diagnostics",
    "mcp",
    "fix packet",
  ],
  community: [
    "community",
    "member",
    "members",
    "group",
    "groups",
    "club",
    "event",
    "events",
    "meetup",
    "profile",
    "profiles",
  ],
  food: [
    "recipe",
    "recipes",
    "cooking",
    "meal",
    "meals",
    "ingredient",
    "ingredients",
    "grocery",
    "groceries",
    "restaurant",
  ],
  creative: [
    "design",
    "designer",
    "creator",
    "creative",
    "photo",
    "image",
    "video",
    "portfolio",
    "moodboard",
    "asset",
    "assets",
    "brand",
  ],
  health: [
    "health",
    "fitness",
    "workout",
    "workouts",
    "step",
    "steps",
    "calorie",
    "calories",
    "heart",
    "sleep",
    "water",
    "hydration",
    "weight",
    "medication",
    "vitamin",
  ],
  social: [
    "dating",
    "date",
    "match",
    "matches",
    "swipe",
    "profile",
    "swolemate",
    "swolemates",
    "tinder",
    "bumble",
    "social",
    "friend",
    "community",
    "connection",
  ],
  messaging: ["message", "chat", "send", "text", "email", "sms", "contact"],
  "smart-home": [
    "thermostat",
    "light",
    "lock",
    "garage",
    "home",
    "smart",
    "device",
    "temperature",
  ],
  navigation: ["direction", "navigate", "map", "location", "route", "drive", "walk"],
  productivity: [
    "note",
    "task",
    "reminder",
    "calendar",
    "event",
    "todo",
    "schedule",
    "appointment",
    "bookmark",
  ],
  finance: [
    "expense",
    "budget",
    "payment",
    "transaction",
    "money",
    "cost",
    "invoice",
    "bill",
  ],
  commerce: ["order", "cart", "buy", "purchase", "shop", "product", "checkout"],
  media: ["play", "music", "song", "podcast", "video", "playlist", "track", "stream"],
};

function inferDomain(description: string): string | undefined {
  const lower = description.toLowerCase();
  let bestDomain: string | undefined;
  let bestScore = 0;

  for (const domain of Object.keys(DOMAIN_KEYWORDS)) {
    const score = domainScore(domain, lower);
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestScore > 0 ? bestDomain : undefined;
}

function resolveDomain(
  description: string,
  explicitDomain: string | undefined
): string | undefined {
  const inferredDomain = inferDomain(description);
  if (!explicitDomain) return inferredDomain;
  if (!inferredDomain || inferredDomain === explicitDomain) return explicitDomain;

  const lower = description.toLowerCase();
  const explicitScore = domainScore(explicitDomain, lower);
  const inferredScore = domainScore(inferredDomain, lower);

  // A strongly specific description should beat a stale caller-supplied domain.
  // Example: "dating profile card" with domain "health" is a social feature,
  // even if it contains a word like "workout" in the profile copy.
  if (inferredScore >= 2 && inferredScore > explicitScore) {
    return inferredDomain;
  }

  return explicitDomain;
}

function domainScore(domain: string, lowerDescription: string): number {
  const keywords = DOMAIN_KEYWORDS[domain] ?? [];
  return keywords.filter((kw) => wordAppears(kw, lowerDescription)).length;
}

function wordAppears(keyword: string, lowerDescription: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(lowerDescription);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeSwiftLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function inferName(description: string): string {
  // extract the core action verb + noun from the description
  const cleaned = description
    .replace(/^(let users?|allow users? to|add|create|enable|implement|build)\s+/i, "")
    .replace(
      /\s+(via siri|through shortcuts|in spotlight|for the app|to the app)\s*\.?$/i,
      ""
    )
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim();

  const words = cleaned.split(/\s+/).slice(0, 3);
  if (words.length === 0) return "CustomFeature";

  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

const PARAM_PATTERNS: Record<string, Record<string, string>> = {
  collaboration: {
    missionTitle: "string",
    owner: "string",
    priority: "string",
    status: "string",
  },
  "developer-tools": {
    target: "string",
    checkName: "string",
    includeTests: "boolean",
  },
  community: { memberName: "string", groupName: "string", eventTitle: "string" },
  food: { recipeName: "string", ingredient: "string", servings: "int" },
  creative: { assetTitle: "string", format: "string", destination: "string" },
  health: { type: "string", duration: "duration", calories: "int" },
  social: { profileName: "string", profileId: "string" },
  messaging: { recipient: "string", body: "string" },
  navigation: { destination: "string", mode: "string" },
  finance: { amount: "double", category: "string", currency: "string" },
  commerce: { productId: "string", quantity: "int" },
  media: { query: "string", shuffle: "boolean" },
  productivity: { title: "string", date: "date", notes: "string" },
  "smart-home": { device: "string", value: "string" },
};

function inferParams(
  description: string,
  domain: string | undefined,
  surfaces: Surface[]
): Record<string, string> {
  if (
    surfaces.length === 1 &&
    surfaces.includes("intent") &&
    isReadOnlyQuery(description)
  ) {
    return {};
  }
  if (surfaces.length === 1 && surfaces.includes("component")) {
    return {};
  }
  if (
    surfaces.length === 1 &&
    surfaces.includes("view") &&
    usesDescriptionDrivenViewBlueprint(description)
  ) {
    return {};
  }
  if (domain === "social") {
    return inferSocialParams(description);
  }
  if (domain && PARAM_PATTERNS[domain]) {
    return { ...PARAM_PATTERNS[domain] };
  }
  // generic fallback
  return { input: "string" };
}

function usesDescriptionDrivenViewBlueprint(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    usesSettingsBlueprint(description) ||
    usesProfileCardBlueprint(description) ||
    usesInboxBlueprint(description) ||
    usesSemanticLayout(description) ||
    /\b(three|3)[-\s]?pane|sidebar rail|channels column|split view|list|filter|search|composer|picker|toggle|grid|table|settings|profile card|mission card|agent row|status ring\b/.test(
      lower
    )
  );
}

// ─── IR / codegen helpers ───────────────────────────────────────────

function paramsToIR(params: Record<string, string>): IRParameter[] {
  return Object.entries(params).map(([name, typeStr]) => ({
    name,
    type: toIRType(typeStr),
    title: humanize(name),
    description: humanize(name),
    isOptional: false,
  }));
}

function toIRType(typeStr: string): IRType {
  const normalized = typeStr === "number" ? "int" : typeStr;
  if (isPrimitiveType(normalized)) {
    return { kind: "primitive", value: normalized as IRPrimitiveType };
  }
  return { kind: "primitive", value: "string" };
}

function humanize(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\bId\b/g, "ID")
    .replace(/\bUrl\b/g, "URL")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function withoutSuffix(name: string, suffix: string): string {
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function withSuffix(name: string, suffix: string): string {
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

function inferSocialParams(description: string): Record<string, string> {
  const lower = description.toLowerCase();
  if (
    /\b(profile|card|photo|bio|age|swipe|dating)\b/.test(lower) ||
    lower.includes("workout preferences")
  ) {
    return {
      photoURL: "url",
      name: "string",
      age: "int",
      bio: "string",
      workoutPreferences: "string",
    };
  }

  if (/\b(match|matches|swolemate|swolemates)\b/.test(lower)) {
    return { profileName: "string", profileId: "string" };
  }

  return { ...PARAM_PATTERNS.social };
}

function inferComponentKindForFeature(
  description: string,
  name: string
): string | undefined {
  const semanticKind = inferSemanticComponentKind(description, name);
  if (semanticKind) return semanticKind;

  const lower = `${name} ${description}`.toLowerCase();
  if (
    /\b(settings|preferences|visibility|invite policy|invite limit|permissions|privacy posture|integration readiness|operating model)\b/.test(
      lower
    )
  )
    return "settingsView";
  if (
    /\b(feed post|feedpost|post card|author avatar|reaction|comment|action row)\b/.test(
      lower
    )
  )
    return "feedCard";
  if (
    /\b(project media|media card|cover image|cover asset|gallery|nsimage)\b/.test(lower)
  )
    return "mediaCard";
  if (
    /\b(compact utility|utility row|quick action|status row|trailing action)\b/.test(
      lower
    )
  )
    return "utilityRow";
  if (/\bmission|task|handoff|approval\b/.test(lower)) return "missionCard";
  if (/\bagent|operator|teammate|member\b/.test(lower)) return "agentRow";
  if (/\bchannel|room|conversation\b/.test(lower)) return "channelRow";
  if (/\bstatus|progress|ring\b/.test(lower)) return "statusRing";
  if (/\bavatar|profile photo|initials\b/.test(lower)) return "avatar";
  if (/\bcontext|north star|memory\b/.test(lower)) return "contextPanel";
  if (/\bprofile|swipe|dating\b/.test(lower)) return "profileCard";
  return undefined;
}

function inferComponentArchetypes(
  description: string,
  baseName: string,
  componentKind?: string
): ComponentArchetype[] {
  const semanticArchetypes = inferSemanticComponentArchetypes(
    description,
    baseName,
    componentKind
  );
  if (semanticArchetypes.length > 0) return semanticArchetypes;

  const haystack = `${componentKind ?? ""} ${baseName} ${description}`;
  const compact = haystack.replace(/[\s_-]+/g, "").toLowerCase();
  const lower = haystack.toLowerCase();
  const wantsKit =
    compact.includes("cardarchetypes") ||
    compact.includes("componentkit") ||
    compact.includes("cardkit") ||
    /\b(three|3)\s+(distinct\s+)?(card|component)s?\b/.test(lower) ||
    /\b(card archetype|card archetypes|component archetype|component archetypes)\b/.test(
      lower
    );

  if (!wantsKit) return [];

  const defaults: ComponentArchetype[] = [
    {
      name: "FeedPostCard",
      kind: "feedCard",
      description:
        "Feed post card with author avatar, headline, body text, tags, and reaction/comment/share actions.",
    },
    {
      name: "ProjectMediaCard",
      kind: "mediaCard",
      description:
        "Project media card with an NSImage-backed macOS cover slot, title, metadata, status, and action.",
    },
    {
      name: "CompactUtilityRow",
      kind: "utilityRow",
      description:
        "Compact utility row with icon, title, supporting text, status pill, and trailing action.",
    },
  ];

  const detected = defaults.filter((archetype) => {
    const name = archetype.name.toLowerCase();
    const spaced = humanize(archetype.name).toLowerCase();
    return lower.includes(name) || lower.includes(spaced);
  });

  return detected.length >= 2 ? detected : defaults;
}

function isReadOnlyQuery(description: string): boolean {
  const lower = description.toLowerCase();
  const hasQueryVerb = /\b(check|show|display|view|see|count|summarize|list)\b/.test(
    lower
  );
  const hasInputVerb = /\b(log|add|create|send|set|update|save|record|book|order)\b/.test(
    lower
  );
  return hasQueryVerb && !hasInputVerb;
}

function shouldEmitDomainArtifacts(
  domain: string | undefined,
  description: string
): boolean {
  if (!domain) return false;
  if (domain !== "health") return true;

  const lower = description.toLowerCase();
  return [
    "health",
    "healthkit",
    "workout",
    "workouts",
    "exercise",
    "exercises",
    "step",
    "steps",
    "calorie",
    "calories",
    "heart",
    "sleep",
    "water",
    "hydration",
    "weight",
    "medication",
    "vitamin",
  ].some((kw) => lower.includes(kw));
}

function defaultForType(typeStr: string): unknown {
  switch (typeStr) {
    case "string":
      return "";
    case "int":
      return 0;
    case "double":
    case "float":
      return 0.0;
    case "boolean":
      return false;
    case "duration":
      return 0;
    case "date":
      return "Date()";
    case "url":
      return "https://example.com";
    default:
      return "";
  }
}

function testValueForType(typeStr: string): string {
  switch (typeStr) {
    case "string":
      return '"test"';
    case "int":
      return "1";
    case "double":
    case "float":
      return "1.0";
    case "boolean":
      return "true";
    case "date":
      return "Date()";
    case "duration":
      return "Duration.seconds(60)";
    case "url":
      return 'URL(string: "https://example.com")!';
    default:
      return '"test"';
  }
}

function buildWidgetBody(name: string, entries: IRWidgetEntry[]): string {
  const fields = entries
    .filter((e) => e.name !== "date")
    .map((e) => `                Text("\\(entry.${e.name})")`)
    .join("\n");

  return `VStack(alignment: .leading, spacing: 8) {
            Text("${humanize(name)}")
                .font(.headline)
${fields || '            Text("—")'}
        }
        .padding()`;
}

function buildViewBody(
  name: string,
  description: string,
  state: IRViewState[],
  platform: FeatureInput["platform"],
  tokenNamespace?: string,
  componentKind?: string
): string {
  const blueprint = buildSmartViewBody({
    name,
    description,
    state,
    platform,
    tokenNamespace,
    componentKind,
  });
  if (blueprint) return blueprint;

  const fields = state
    .map((s) => {
      if (s.type.kind === "primitive" && s.type.value === "boolean") {
        return `            Toggle("${humanize(s.name)}", isOn: $${s.name})`;
      }
      return `            Text("${humanize(s.name)}: \\(${s.name})")`;
    })
    .join("\n");

  const content = `VStack(spacing: 16) {
${fields || '                Text("Hello")'}
            }
            .padding()`;

  if (platform === "macOS") {
    return content;
  }

  return `NavigationStack {
            ${content}
                .navigationTitle("${humanize(name)}")
        }`;
}

function buildEntitlementsXml(entitlements: string[]): string {
  const entries = entitlements.map((e) => `\t<key>${e}</key>\n\t<true/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries}
</dict>
</plist>`;
}

function buildPlistXml(keys: Record<string, string>): string {
  const entries = Object.entries(keys)
    .map(([k, v]) => `\t<key>${k}</key>\n\t<string>${v}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries}
</dict>
</plist>`;
}
