import {
  recordAdoptionEvent,
  recordAdoptionEventSoon,
  type AdoptionTelemetrySource,
} from "./adoption.js";

export type ProductInsightKind = "registry_search" | "project_brief";
export const PRODUCT_INSIGHT_TAXONOMY_VERSION = "2026-07-v2";

export type ProductProjectCategory =
  | "health-fitness"
  | "productivity"
  | "finance"
  | "commerce"
  | "social-communication"
  | "media-creative"
  | "travel-local"
  | "education"
  | "smart-home"
  | "developer-tools"
  | "business-operations"
  | "accessibility"
  | "ai-assistant"
  | "utilities"
  | "lifestyle"
  | "unknown";

export type ProductProjectGoal =
  | "create-new"
  | "repair-debug"
  | "migrate-modernize"
  | "integrate-automate"
  | "track-monitor"
  | "communicate-share"
  | "search-discover"
  | "purchase-transact"
  | "analyze-insight"
  | "personalize-recommend"
  | "capture-record"
  | "unknown";

export type ProductAppleSurface =
  | "app-intents"
  | "swiftui"
  | "widgetkit"
  | "live-activities"
  | "siri-shortcuts"
  | "foundation-models"
  | "cloudkit"
  | "storekit"
  | "maps-location"
  | "healthkit"
  | "media"
  | "notifications"
  | "accessibility"
  | "xcode";

export type ProductFeatureArea =
  | "ui-interaction"
  | "data-persistence"
  | "networking-api"
  | "auth-identity"
  | "commerce-payments"
  | "media-capture"
  | "media-playback"
  | "ai-models"
  | "automation-intents"
  | "notifications-background"
  | "location-maps"
  | "health-sensors"
  | "accessibility"
  | "testing-quality"
  | "build-release"
  | "collaboration-sharing"
  | "analytics-observability";

export interface ProductInterestClassification {
  taxonomyVersion: typeof PRODUCT_INSIGHT_TAXONOMY_VERSION;
  insightKind: ProductInsightKind;
  projectCategory: ProductProjectCategory;
  projectGoal: ProductProjectGoal;
  appleSurfaces: ProductAppleSurface[];
  featureAreas: ProductFeatureArea[];
  projectLifecycle: "greenfield" | "brownfield" | "unknown";
  deliveryTarget:
    "app-feature" | "bug-fix" | "integration" | "migration" | "test-proof" | "unknown";
  complexityBucket: "simple" | "contained" | "cross-cutting" | "unknown";
  queryLengthBucket: "short" | "medium" | "long";
  resultBucket: "none" | "one" | "few" | "many" | "unknown";
  querySource: string;
  targetPlatform?: "iOS" | "macOS" | "watchOS" | "visionOS" | "multi";
}

export interface RecordProductInterestInput {
  text: string;
  insightKind: ProductInsightKind;
  querySource: string;
  source: AdoptionTelemetrySource;
  version: string;
  resultCount?: number;
  host?: string;
  transport?: string;
  targetPlatform?: string;
}

type Rule<T extends string> = {
  label: T;
  terms: readonly string[];
};

const CATEGORY_RULES: ReadonlyArray<Rule<Exclude<ProductProjectCategory, "unknown">>> = [
  {
    label: "health-fitness",
    terms: [
      "health",
      "healthkit",
      "fitness",
      "workout",
      "exercise",
      "medical",
      "wellness",
      "sleep",
      "hydration",
      "calorie",
      "meditation",
    ],
  },
  {
    label: "productivity",
    terms: [
      "task",
      "todo",
      "note",
      "calendar",
      "schedule",
      "reminder",
      "focus",
      "journal",
      "habit",
    ],
  },
  {
    label: "finance",
    terms: [
      "budget",
      "expense",
      "finance",
      "banking",
      "portfolio",
      "invest",
      "invoice",
      "accounting",
    ],
  },
  {
    label: "commerce",
    terms: [
      "shop",
      "shopping",
      "ecommerce",
      "cart",
      "order",
      "inventory",
      "checkout",
      "retail",
    ],
  },
  {
    label: "social-communication",
    terms: [
      "chat",
      "message",
      "social",
      "community",
      "friend",
      "group",
      "collaboration",
      "dating",
    ],
  },
  {
    label: "media-creative",
    terms: [
      "photo",
      "video",
      "music",
      "audio",
      "podcast",
      "camera",
      "drawing",
      "design",
      "image",
      "creative",
    ],
  },
  {
    label: "travel-local",
    terms: [
      "travel",
      "trip",
      "flight",
      "hotel",
      "map",
      "location",
      "weather",
      "restaurant",
      "navigation",
    ],
  },
  {
    label: "education",
    terms: [
      "learn",
      "education",
      "school",
      "study",
      "quiz",
      "course",
      "reading",
      "student",
    ],
  },
  {
    label: "smart-home",
    terms: [
      "smart home",
      "homekit",
      "lights",
      "thermostat",
      "appliance",
      "matter",
      "home automation",
    ],
  },
  {
    label: "developer-tools",
    terms: [
      "developer",
      "code",
      "xcode",
      "git",
      "build",
      "test",
      "debug",
      "api",
      "compiler",
    ],
  },
  {
    label: "business-operations",
    terms: [
      "crm",
      "sales",
      "customer",
      "team",
      "dashboard",
      "admin",
      "operations",
      "workforce",
    ],
  },
  {
    label: "accessibility",
    terms: [
      "accessibility",
      "voiceover",
      "assistive",
      "caption",
      "hearing",
      "vision impairment",
    ],
  },
  {
    label: "ai-assistant",
    terms: ["ai", "agent", "assistant", "model", "intelligence", "siri", "copilot"],
  },
  {
    label: "utilities",
    terms: [
      "scanner",
      "document",
      "calculator",
      "timer",
      "converter",
      "password",
      "utility",
    ],
  },
  {
    label: "lifestyle",
    terms: ["recipe", "food", "fashion", "pet", "family", "garden", "home"],
  },
];

const GOAL_RULES: ReadonlyArray<Rule<Exclude<ProductProjectGoal, "unknown">>> = [
  {
    label: "repair-debug",
    terms: ["fix", "repair", "broken", "bug", "crash", "error", "fails", "debug"],
  },
  {
    label: "migrate-modernize",
    terms: ["migrate", "modernize", "upgrade", "update", "replace legacy", "deprecate"],
  },
  {
    label: "integrate-automate",
    terms: ["integrate", "automation", "automate", "sync", "connect", "shortcut"],
  },
  {
    label: "track-monitor",
    terms: [
      "track",
      "tracking",
      "tracker",
      "monitor",
      "monitoring",
      "log",
      "logging",
      "measure",
      "counter",
      "progress",
    ],
  },
  {
    label: "communicate-share",
    terms: ["share", "send", "message", "collaborate", "invite", "publish"],
  },
  {
    label: "search-discover",
    terms: ["search", "discover", "find", "browse", "lookup", "recommend nearby"],
  },
  {
    label: "purchase-transact",
    terms: ["buy", "purchase", "checkout", "pay", "subscribe", "order"],
  },
  {
    label: "analyze-insight",
    terms: ["analyze", "analytics", "insight", "report", "dashboard", "forecast"],
  },
  {
    label: "personalize-recommend",
    terms: ["personalize", "recommend", "suggest", "customize", "curate"],
  },
  {
    label: "capture-record",
    terms: ["capture", "record", "scan", "import", "transcribe", "save"],
  },
  {
    label: "create-new",
    terms: ["build", "create", "make", "new app", "generate", "add feature"],
  },
];

const SURFACE_RULES: ReadonlyArray<Rule<ProductAppleSurface>> = [
  { label: "app-intents", terms: ["app intent", "appintent", "intent"] },
  { label: "swiftui", terms: ["swiftui", "view", "interface", "screen"] },
  { label: "widgetkit", terms: ["widget", "widgetkit"] },
  { label: "live-activities", terms: ["live activity", "activitykit", "dynamic island"] },
  { label: "siri-shortcuts", terms: ["siri", "shortcut", "shortcuts", "spotlight"] },
  {
    label: "foundation-models",
    terms: [
      "foundation model",
      "foundationmodels",
      "apple intelligence",
      "language model",
    ],
  },
  { label: "cloudkit", terms: ["cloudkit", "icloud", "cloud sync"] },
  {
    label: "storekit",
    terms: ["storekit", "in-app purchase", "subscription", "paywall"],
  },
  { label: "maps-location", terms: ["mapkit", "core location", "location", "map"] },
  { label: "healthkit", terms: ["healthkit", "health data", "workoutkit"] },
  { label: "media", terms: ["avfoundation", "photos", "camera", "audio", "video"] },
  { label: "notifications", terms: ["notification", "push", "background task"] },
  { label: "accessibility", terms: ["accessibility", "voiceover", "assistive"] },
  { label: "xcode", terms: ["xcode", "xcodebuild", "xcresult"] },
];

const FEATURE_RULES: ReadonlyArray<Rule<ProductFeatureArea>> = [
  {
    label: "ui-interaction",
    terms: [
      "ui",
      "screen",
      "view",
      "button",
      "form",
      "sheet",
      "navigation",
      "animation",
      "gesture",
      "tap",
    ],
  },
  {
    label: "data-persistence",
    terms: [
      "database",
      "persistence",
      "swiftdata",
      "core data",
      "storage",
      "cache",
      "offline",
      "sync",
    ],
  },
  {
    label: "networking-api",
    terms: [
      "api",
      "network",
      "server",
      "backend",
      "request",
      "websocket",
      "graphql",
      "rest",
    ],
  },
  {
    label: "auth-identity",
    terms: ["auth", "login", "sign in", "account", "identity", "oauth", "passkey"],
  },
  {
    label: "commerce-payments",
    terms: [
      "payment",
      "purchase",
      "checkout",
      "subscription",
      "storekit",
      "paywall",
      "order",
    ],
  },
  {
    label: "media-capture",
    terms: ["camera", "capture", "record", "scan", "microphone", "photo picker"],
  },
  {
    label: "media-playback",
    terms: ["playback", "player", "stream", "audio", "video", "music", "podcast"],
  },
  {
    label: "ai-models",
    terms: [
      "ai",
      "model",
      "agent",
      "assistant",
      "foundation model",
      "apple intelligence",
      "core ml",
    ],
  },
  {
    label: "automation-intents",
    terms: ["intent", "siri", "shortcut", "automation", "spotlight"],
  },
  {
    label: "notifications-background",
    terms: ["notification", "push", "background", "live activity", "dynamic island"],
  },
  {
    label: "location-maps",
    terms: ["location", "map", "navigation", "geofence", "nearby", "route"],
  },
  {
    label: "health-sensors",
    terms: [
      "health",
      "healthkit",
      "workout",
      "sensor",
      "heart rate",
      "fitness",
      "motion",
    ],
  },
  {
    label: "accessibility",
    terms: ["accessibility", "voiceover", "caption", "assistive", "dynamic type"],
  },
  {
    label: "testing-quality",
    terms: ["test", "testing", "uitest", "xctest", "validate", "proof", "regression"],
  },
  {
    label: "build-release",
    terms: [
      "xcode",
      "xcodebuild",
      "build error",
      "compile",
      "signing",
      "archive",
      "release",
      "app store",
    ],
  },
  {
    label: "collaboration-sharing",
    terms: ["share", "collaborate", "team", "invite", "message", "community"],
  },
  {
    label: "analytics-observability",
    terms: [
      "analytics",
      "metrics",
      "telemetry",
      "logging",
      "monitoring",
      "dashboard",
      "crash report",
    ],
  },
];

export function classifyProductInterest(input: {
  text: string;
  insightKind: ProductInsightKind;
  querySource: string;
  resultCount?: number;
  targetPlatform?: string;
}): ProductInterestClassification {
  const normalized = normalize(input.text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const projectGoal = strongestRule(normalized, GOAL_RULES) ?? "unknown";
  const appleSurfaces = SURFACE_RULES.filter((rule) => scoreRule(normalized, rule) > 0)
    .map((rule) => rule.label)
    .slice(0, 4);
  const featureAreas = FEATURE_RULES.filter((rule) => scoreRule(normalized, rule) > 0)
    .map((rule) => rule.label)
    .slice(0, 6);
  return {
    taxonomyVersion: PRODUCT_INSIGHT_TAXONOMY_VERSION,
    insightKind: input.insightKind,
    projectCategory: strongestRule(normalized, CATEGORY_RULES) ?? "unknown",
    projectGoal,
    appleSurfaces,
    featureAreas,
    projectLifecycle: projectLifecycle(normalized, projectGoal),
    deliveryTarget: deliveryTarget(normalized, projectGoal),
    complexityBucket: complexityBucket(
      tokens.length,
      appleSurfaces.length,
      featureAreas.length
    ),
    queryLengthBucket:
      tokens.length <= 4 ? "short" : tokens.length <= 14 ? "medium" : "long",
    resultBucket: resultBucket(input.resultCount),
    querySource: normalizeSource(input.querySource),
    targetPlatform: normalizePlatform(input.targetPlatform),
  };
}

function projectLifecycle(
  normalized: string,
  goal: ProductProjectGoal
): ProductInterestClassification["projectLifecycle"] {
  if (
    goal === "repair-debug" ||
    goal === "migrate-modernize" ||
    /(?:^|\s)(existing|current|legacy|brownfield|regression|broken)(?:$|\s)/.test(
      normalized
    )
  )
    return "brownfield";
  if (
    goal === "create-new" ||
    /(?:^|\s)(new app|from scratch|greenfield|prototype)(?:$|\s)/.test(normalized) ||
    /(?:^|\s)(build|create|make) (a|an|new)(?:$|\s)/.test(normalized)
  )
    return "greenfield";
  return "unknown";
}

function deliveryTarget(
  normalized: string,
  goal: ProductProjectGoal
): ProductInterestClassification["deliveryTarget"] {
  if (/(?:^|\s)(test|testing|validate|proof|xctest|uitest)(?:$|\s)/.test(normalized))
    return "test-proof";
  if (goal === "repair-debug") return "bug-fix";
  if (goal === "migrate-modernize") return "migration";
  if (goal === "integrate-automate") return "integration";
  if (goal !== "unknown") return "app-feature";
  return "unknown";
}

function complexityBucket(
  tokenCount: number,
  surfaceCount: number,
  featureCount: number
): ProductInterestClassification["complexityBucket"] {
  if (tokenCount === 0) return "unknown";
  if (tokenCount <= 5 && surfaceCount + featureCount <= 1) return "simple";
  if (tokenCount > 20 || surfaceCount >= 3 || featureCount >= 4) return "cross-cutting";
  return "contained";
}

export async function recordProductInterestEvent(input: RecordProductInterestInput) {
  const classification = classifyProductInterest(input);
  return recordAdoptionEvent({
    source: input.source,
    eventName: "axint_interest_observed",
    version: input.version,
    host: input.host,
    transport: input.transport,
    result: "ok",
    ...classification,
  });
}

export function recordProductInterestEventSoon(input: RecordProductInterestInput): void {
  const classification = classifyProductInterest(input);
  recordAdoptionEventSoon({
    source: input.source,
    eventName: "axint_interest_observed",
    version: input.version,
    host: input.host,
    transport: input.transport,
    result: "ok",
    ...classification,
  });
}

function strongestRule<T extends string>(
  normalized: string,
  rules: ReadonlyArray<Rule<T>>
): T | undefined {
  return rules
    .map((rule, index) => ({
      label: rule.label,
      score: scoreRule(normalized, rule),
      index,
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
    ?.label;
}

function scoreRule<T extends string>(normalized: string, rule: Rule<T>): number {
  return rule.terms.reduce((score, term) => {
    const normalizedTerm = normalize(term);
    const pattern = new RegExp(`(?:^|\\s)${escapeRegex(normalizedTerm)}(?:$|\\s)`, "g");
    return (
      score + (normalized.match(pattern)?.length ?? 0) * normalizedTerm.split(" ").length
    );
  }, 0);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSource(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized.slice(0, 48) || "unknown";
}

function normalizePlatform(
  value?: string
): ProductInterestClassification["targetPlatform"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ios") return "iOS";
  if (normalized === "macos") return "macOS";
  if (normalized === "watchos") return "watchOS";
  if (normalized === "visionos") return "visionOS";
  if (normalized === "multi" || normalized === "all") return "multi";
  return undefined;
}

function resultBucket(value?: number): ProductInterestClassification["resultBucket"] {
  if (value === undefined || !Number.isFinite(value)) return "unknown";
  if (value <= 0) return "none";
  if (value === 1) return "one";
  if (value <= 5) return "few";
  return "many";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
