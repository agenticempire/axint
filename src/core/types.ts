/**
 * Axint Core Types
 *
 * Intermediate Representation (IR) and compiler types for the
 * TypeScript → Swift App Intent compilation pipeline.
 */

// ─── IR Types ────────────────────────────────────────────────────────

/** Primitive types supported by App Intents */
export type IRPrimitiveType =
  | "string"
  | "int"
  | "double"
  | "float"
  | "boolean"
  | "date"
  | "duration"
  | "url";

/** Type node in the IR */
export type IRType =
  | { kind: "primitive"; value: IRPrimitiveType }
  | { kind: "array"; elementType: IRType }
  | { kind: "optional"; innerType: IRType }
  | { kind: "entity"; entityName: string; properties: IRParameter[] }
  | {
      kind: "entityQuery";
      entityName: string;
      queryType: "all" | "id" | "string" | "property";
    }
  | { kind: "dynamicOptions"; valueType: IRType; providerName: string }
  | { kind: "enum"; name: string; cases: string[] };

/** A single parameter in an intent definition */
export interface IRParameter {
  name: string;
  type: IRType;
  title: string;
  description: string;
  isOptional: boolean;
  defaultValue?: unknown;
}

/**
 * Display representation configuration for an entity.
 * Maps which properties to show in Siri and Shortcuts UI.
 */
export interface DisplayRepresentation {
  title: string;
  subtitle?: string;
  image?: string;
}

/**
 * An App Entity definition for complex, domain-specific data types.
 * Entities can be queried and used as parameter types in intents.
 */
export interface IREntity {
  name: string;
  displayRepresentation: DisplayRepresentation;
  properties: IRParameter[];
  queryType: "all" | "id" | "string" | "property";
}

// ─── View IR Types ──────────────────────────────────────────────────

/** SwiftUI property wrapper kind for state management */
export type ViewStateKind = "state" | "binding" | "environment" | "observed";

/** A state or binding property in a view definition */
export interface IRViewState {
  name: string;
  type: IRType;
  kind: ViewStateKind;
  defaultValue?: unknown;
  /** For @Environment, the keypath (e.g. "\.dismiss") */
  environmentKey?: string;
}

/** A prop passed from a parent view */
export interface IRViewProp {
  name: string;
  type: IRType;
  isOptional: boolean;
  defaultValue?: unknown;
  description?: string;
}

/** Supported SwiftUI layout container types */
export type ViewBodyNode =
  | { kind: "vstack"; spacing?: number; alignment?: string; children: ViewBodyNode[] }
  | { kind: "hstack"; spacing?: number; alignment?: string; children: ViewBodyNode[] }
  | { kind: "zstack"; alignment?: string; children: ViewBodyNode[] }
  | { kind: "text"; content: string }
  | { kind: "image"; systemName?: string; name?: string }
  | { kind: "button"; label: string; action?: string }
  | { kind: "spacer" }
  | { kind: "divider" }
  | { kind: "foreach"; collection: string; itemName: string; body: ViewBodyNode[] }
  | {
      kind: "conditional";
      condition: string;
      then: ViewBodyNode[];
      else?: ViewBodyNode[];
    }
  | { kind: "navigationLink"; destination: string; label: ViewBodyNode[] }
  | { kind: "list"; children: ViewBodyNode[] }
  | { kind: "raw"; swift: string };

/** Modifier applied to a view node */
export interface ViewModifier {
  name: string;
  args: string[];
}

/** The main IR node representing a compiled view */
export interface IRView {
  name: string;
  props: IRViewProp[];
  state: IRViewState[];
  body: ViewBodyNode[];
  modifiers?: Record<string, ViewModifier[]>;
  sourceFile: string;
}

/** The main IR node representing a compiled intent */
export interface IRIntent {
  name: string;
  title: string;
  description: string;
  domain?: string;
  category?: string;
  parameters: IRParameter[];
  returnType: IRType;
  sourceFile: string;
  /** Entitlements required by this intent (e.g., "com.apple.developer.siri") */
  entitlements?: string[];
  /** Info.plist keys required by this intent (e.g., "NSCalendarsUsageDescription") */
  infoPlistKeys?: Record<string, string>;
  /** Whether the intent should be exposed to Spotlight indexing */
  isDiscoverable?: boolean;
  /** App Entities used by this intent */
  entities?: IREntity[];
  /** Whether to donate this intent to Spotlight/Siri when performed */
  donateOnPerform?: boolean;
  /** Custom result type (SwiftUI view or custom struct) to return */
  customResultType?: string;
}

// ─── Widget IR Types ────────────────────────────────────────────────────────

/** Widget family sizes */
export type WidgetFamily =
  | "systemSmall"
  | "systemMedium"
  | "systemLarge"
  | "systemExtraLarge"
  | "accessoryCircular"
  | "accessoryRectangular"
  | "accessoryInline";

/** Widget refresh policy */
export type WidgetRefreshPolicy = "atEnd" | "after" | "never";

/** Timeline entry field */
export interface IRWidgetEntry {
  name: string;
  type: IRType;
  defaultValue?: unknown;
}

/** The main IR node for a compiled widget */
export interface IRWidget {
  name: string;
  displayName: string;
  description: string;
  families: WidgetFamily[];
  entry: IRWidgetEntry[];
  /** The view body to render (reuses ViewBodyNode from views) */
  body: ViewBodyNode[];
  /** Refresh interval in minutes (for .after policy) */
  refreshInterval?: number;
  refreshPolicy: WidgetRefreshPolicy;
  sourceFile: string;
}

// ─── App IR Types ──────────────────────────────────────────────────────────

/** Scene type in a SwiftUI App */
export type SceneKind = "windowGroup" | "window" | "documentGroup" | "settings";

/** A single scene in an App definition */
export interface IRScene {
  /** Optional name identifier for named windows */
  name?: string;
  /** Scene wrapper type */
  sceneKind: SceneKind;
  /** The root view to render in this scene */
  rootView: string;
  /** Title for the window/group */
  title?: string;
  /** Whether this scene is the default (first WindowGroup) */
  isDefault?: boolean;
  /** Platform guard: only emit this scene under #if os(...) */
  platformGuard?: "macOS" | "iOS" | "visionOS";
}

/** The main IR node for a compiled App */
export interface IRApp {
  name: string;
  scenes: IRScene[];
  /** App-level @AppStorage properties */
  appStorage?: Array<{ name: string; key: string; type: IRType; defaultValue?: unknown }>;
  sourceFile: string;
}

// ─── Compiler Types ──────────────────────────────────────────────────

export interface CompilerOptions {
  /** Output directory for generated Swift files */
  outDir: string;
  /** Whether to run validation after generation */
  validate?: boolean;
  /** Target iOS/macOS version */
  target?:
    | "ios16"
    | "ios17"
    | "ios18"
    | "ios26"
    | "macos13"
    | "macos14"
    | "macos15"
    | "macos26";
  /** Whether to emit an Info.plist fragment alongside the Swift file */
  emitInfoPlist?: boolean;
  /** Whether to emit an entitlements fragment alongside the Swift file */
  emitEntitlements?: boolean;
  /** Whether to run swift-format on the output (requires swift-format on PATH) */
  format?: boolean;
}

export interface CompilerOutput {
  /** Path to the generated Swift file */
  outputPath: string;
  /** The generated Swift source code */
  swiftCode: string;
  /** Info.plist fragment (if emitInfoPlist is true) */
  infoPlistFragment?: string;
  /** Entitlements fragment (if emitEntitlements is true) */
  entitlementsFragment?: string;
  /** The intermediate representation */
  ir: IRIntent;
  /** Validation diagnostics */
  diagnostics: Diagnostic[];
}

// ─── Diagnostics ─────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

// ─── Param Type Registry ─────────────────────────────────────────────

/**
 * Canonical set of supported param types.
 * Single source of truth — parser, SDK, and docs all derive from this.
 * To add a new type: add it to IRPrimitiveType, PARAM_TYPES, and SWIFT_TYPE_MAP.
 */
export const PARAM_TYPES: ReadonlySet<IRPrimitiveType> = new Set<IRPrimitiveType>([
  "string",
  "int",
  "double",
  "float",
  "boolean",
  "date",
  "duration",
  "url",
]);

/**
 * Legacy alias: "number" → "int" for backwards compatibility with v0.1.x files.
 * Parser will accept "number" and rewrite it to "int" with a deprecation warning.
 */
export const LEGACY_PARAM_ALIASES: Record<string, IRPrimitiveType> = {
  number: "int",
};

// ─── Swift Type Mapping ──────────────────────────────────────────────

export const SWIFT_TYPE_MAP: Record<IRPrimitiveType, string> = {
  string: "String",
  int: "Int",
  double: "Double",
  float: "Float",
  boolean: "Bool",
  date: "Date",
  duration: "Measurement<UnitDuration>",
  url: "URL",
};

/**
 * Convert an IRType to its Swift type string.
 */
export function irTypeToSwift(type: IRType): string {
  switch (type.kind) {
    case "primitive":
      return SWIFT_TYPE_MAP[type.value];
    case "array":
      return `[${irTypeToSwift(type.elementType)}]`;
    case "optional":
      return `${irTypeToSwift(type.innerType)}?`;
    case "entity":
      return type.entityName;
    case "entityQuery":
      return `${type.entityName}Query`;
    case "dynamicOptions":
      return `[DynamicOptionsResult<${irTypeToSwift(type.valueType)}>]`;
    case "enum":
      return type.name;
  }
}
