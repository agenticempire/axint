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
  compileFromIR,
  compileViewFromIR,
  compileWidgetFromIR,
} from "../core/compiler.js";
import type {
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
import {
  buildSmartViewBody,
  reservedViewPropertyName,
  usesProfileCardBlueprint,
} from "./view-blueprints.js";

export type Surface = "intent" | "view" | "widget";

export interface FeatureInput {
  description: string;
  surfaces?: Surface[];
  name?: string;
  appName?: string;
  domain?: string;
  params?: Record<string, string>;
  platform?: "iOS" | "macOS" | "visionOS" | "all";
  tokenNamespace?: string;
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
  const surfaces = input.surfaces?.length ? input.surfaces : (["intent"] as Surface[]);
  const domain = resolveDomain(input.description, input.domain);
  const params = input.params || inferParams(input.description, domain, surfaces);
  const shouldEmitArtifacts = shouldEmitDomainArtifacts(domain, input.description);
  const diagnostics: string[] = [];
  const files: FeatureFile[] = [];

  // --- Intent surface ---
  if (surfaces.includes("intent")) {
    const intentName = withoutSuffix(name, "Intent");
    const intentResult = buildIntent(
      intentName,
      input.description,
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
    const widgetResult = buildWidget(widgetName, input.description, domain, params);
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
      input.description,
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

  const success = diagnostics.every((d) => !d.startsWith("[AX") || d.includes("warning"));
  const surfaceList = surfaces.join(", ");
  const fileCount = files.filter((f) => f.type === "swift").length;
  const testCount = files.filter((f) => f.type === "test").length;

  const summary = [
    `Generated scaffold: ${fileCount} Swift file${fileCount !== 1 ? "s" : ""} + ${testCount} test${testCount !== 1 ? "s" : ""} for "${name}"`,
    `Surfaces: ${surfaceList}`,
    input.platform ? `Platform: ${input.platform}` : null,
    domain ? `Domain: ${domain}` : null,
    `Note: perform() bodies and app-specific UI logic are starter scaffolds; fill the real product behavior before shipping.`,
    `Files:`,
    ...files.map((f) => `  ${f.path} (${f.type})`),
  ]
    .filter(Boolean)
    .join("\n");

  return { success, name, files, summary, diagnostics };
}

// ─── Surface builders ───────────────────────────────────────────────

interface SurfaceOutput {
  swift: string | null;
  plist: string | null;
  entitlements: string | null;
  diagnostics: string[];
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

  const result = compileFromIR(ir, {
    emitInfoPlist: !!plistKeys,
    emitEntitlements: !!entitlements,
  });

  if (!result.success || !result.output) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: result.diagnostics.map(
        (d) => `[${d.code}] ${d.severity}: ${d.message}`
      ),
    };
  }

  return {
    swift: result.output.swiftCode,
    plist: result.output.infoPlistFragment || null,
    entitlements: result.output.entitlementsFragment || null,
    diagnostics: result.diagnostics.map((d) => `[${d.code}] ${d.severity}: ${d.message}`),
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

  const result = compileWidgetFromIR(ir);

  if (!result.success || !result.output) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: result.diagnostics.map(
        (d) => `[${d.code}] ${d.severity}: ${d.message}`
      ),
    };
  }

  return {
    swift: result.output.swiftCode,
    plist: null,
    entitlements: null,
    diagnostics: result.diagnostics.map((d) => `[${d.code}] ${d.severity}: ${d.message}`),
  };
}

function buildView(
  name: string,
  description: string,
  params: Record<string, string>,
  platform: FeatureInput["platform"] = "all",
  tokenNamespace?: string
): SurfaceOutput {
  const state: IRViewState[] = Object.entries(params).map(([propName, typeStr]) => ({
    name: reservedViewPropertyName(propName),
    type: toIRType(typeStr),
    kind: "state" as const,
    defaultValue: defaultForType(typeStr),
  }));

  if (usesProfileCardBlueprint(description)) {
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

  const ir: IRView = {
    name,
    props: [],
    state,
    body: [
      {
        kind: "raw",
        swift: buildViewBody(name, description, state, platform, tokenNamespace),
      },
    ],
    sourceFile: "<feature>",
  };

  const result = compileViewFromIR(ir);

  if (!result.success || !result.output) {
    return {
      swift: null,
      plist: null,
      entitlements: null,
      diagnostics: result.diagnostics.map(
        (d) => `[${d.code}] ${d.severity}: ${d.message}`
      ),
    };
  }

  return {
    swift: result.output.swiftCode,
    plist: null,
    entitlements: null,
    diagnostics: result.diagnostics.map((d) => `[${d.code}] ${d.severity}: ${d.message}`),
  };
}

// ─── Test generators ────────────────────────────────────────────────

function generateIntentTest(name: string, params: Record<string, string>): string {
  const paramSetup = Object.entries(params)
    .map(([p, t]) => `        intent.${p} = ${testValueForType(t)}`)
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

// ─── Inference helpers ──────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
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
  if (domain === "social") {
    return inferSocialParams(description);
  }
  if (domain && PARAM_PATTERNS[domain]) {
    return { ...PARAM_PATTERNS[domain] };
  }
  // generic fallback
  return { input: "string" };
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
  tokenNamespace?: string
): string {
  const blueprint = buildSmartViewBody({
    name,
    description,
    state,
    platform,
    tokenNamespace,
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
