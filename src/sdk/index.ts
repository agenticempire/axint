/**
 * axint — Decorators and types for defining Apple App Intents
 *
 * The canonical way to define an App Intent in TypeScript. The axint
 * compiler parses files written against this SDK and emits a native
 * Swift `AppIntent` struct (plus optional Info.plist and entitlements
 * fragments) suitable for dropping into an Xcode project.
 *
 * @example
 * ```typescript
 * import { defineIntent, param } from "@axint/compiler";
 *
 * export default defineIntent({
 *   name: "CreateEvent",
 *   title: "Create Calendar Event",
 *   description: "Creates a new event in the user's calendar",
 *   domain: "productivity",
 *   entitlements: ["com.apple.developer.siri"],
 *   infoPlistKeys: {
 *     NSCalendarsUsageDescription: "Axint needs calendar access to create events.",
 *   },
 *   params: {
 *     title: param.string("Event title"),
 *     date: param.date("Event date"),
 *     durationMinutes: param.int("Duration in minutes", { default: 30 }),
 *     allDay: param.boolean("Is all-day event", { required: false }),
 *   },
 *   perform: async ({ title, date }) => {
 *     return { success: true, id: "evt_123" };
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// ─── Shared Config ───────────────────────────────────────────────────

/** Configuration for a single parameter. */
export interface ParamConfig {
  /** Display name for this parameter (auto-generated from field name if omitted). */
  title?: string;
  /** Human-readable description shown in Siri/Shortcuts. */
  description: string;
  /** Default value if the user doesn't provide one. */
  default?: unknown;
  /**
   * Whether this parameter is required. Defaults to `true`.
   * Set to `false` to make the Swift property optional (`Type?`).
   */
  required?: boolean;
}

type ParamFactory<T extends string> = (
  description: string,
  config?: Partial<ParamConfig>
) => { type: T; description: string } & Partial<ParamConfig>;

function make<T extends string>(type: T): ParamFactory<T> {
  return (description, config) => ({
    type,
    description,
    ...config,
  });
}

// ─── Parameter Type Helpers ──────────────────────────────────────────

/**
 * Parameter type helpers for defining intent parameters.
 *
 * Each helper maps directly to a Swift App Intents type:
 *
 * | Helper            | Swift type                    |
 * |-------------------|-------------------------------|
 * | `param.string`    | `String`                      |
 * | `param.int`       | `Int`                         |
 * | `param.double`    | `Double`                      |
 * | `param.float`     | `Float`                       |
 * | `param.boolean`   | `Bool`                        |
 * | `param.date`      | `Date`                        |
 * | `param.duration`  | `Measurement<UnitDuration>`   |
 * | `param.url`       | `URL`                         |
 * | `param.number` *  | `Int` *(deprecated alias)*    |
 *
 * @example
 * ```typescript
 * params: {
 *   name: param.string("User's name"),
 *   age: param.int("Age in years"),
 *   height: param.double("Height in meters"),
 *   notify: param.boolean("Send notification", { required: false }),
 *   when: param.date("Scheduled date"),
 *   length: param.duration("How long"),
 *   link: param.url("Resource URL"),
 * }
 * ```
 */
export const param = {
  /** String parameter → Swift `String` */
  string: make("string"),
  /** 64-bit signed integer → Swift `Int` */
  int: make("int"),
  /** Double-precision float → Swift `Double` */
  double: make("double"),
  /** Single-precision float → Swift `Float` */
  float: make("float"),
  /** Boolean parameter → Swift `Bool` */
  boolean: make("boolean"),
  /** Date parameter → Swift `Date` */
  date: make("date"),
  /** Duration parameter → Swift `Measurement<UnitDuration>` */
  duration: make("duration"),
  /** URL parameter → Swift `URL` */
  url: make("url"),
  /**
   * @deprecated Use `param.int` (or `param.double` / `param.float`) for
   * explicit Swift numeric fidelity. `param.number` is kept as an alias
   * for `param.int` to preserve v0.1.x compatibility and will be removed
   * in v1.0.0.
   */
  number: make("number"),

  /**
   * Entity reference parameter. The entity name must match a
   * `defineEntity()` call in the same file or project.
   */
  entity: (entityName: string, description: string, config?: Partial<ParamConfig>) => ({
    type: "entity" as const,
    entityName,
    description,
    ...config,
  }),

  /**
   * Parameter with dynamic option suggestions provided at runtime
   * by a DynamicOptionsProvider. The `providerName` maps to a
   * generated Swift `DynamicOptionsProvider` struct.
   */
  dynamicOptions: (
    providerName: string,
    innerParam: ReturnType<ParamFactory<string>>
  ) => {
    const { type: innerType, description, ...rest } = innerParam;
    return {
      type: "dynamicOptions" as const,
      providerName,
      innerType,
      description,
      ...rest,
    };
  },
};

// ─── Intent Definition ───────────────────────────────────────────────

/** The full intent definition including name, metadata, params, and perform function. */
export interface IntentDefinition<
  TParams extends Record<string, ReturnType<(typeof param)[keyof typeof param]>>,
> {
  /** PascalCase name for the generated Swift struct (e.g., "CreateEvent"). */
  name: string;
  /** Display name shown in Siri and Shortcuts. */
  title: string;
  /** Human-readable description of what this intent does. */
  description: string;
  /**
   * Apple App Intent Domain for categorization.
   * Common values: "messaging", "productivity", "finance", "health",
   * "commerce", "media", "navigation", "smart-home"
   */
  domain?: string;
  /** Siri/Shortcuts category for discoverability. */
  category?: string;
  /**
   * Entitlements required by this intent.
   * Example: `["com.apple.developer.siri", "com.apple.developer.healthkit"]`
   * The compiler can emit a matching `.entitlements` fragment.
   */
  entitlements?: string[];
  /**
   * Info.plist keys required by this intent, mapped to their usage
   * description strings.
   * Example: `{ NSCalendarsUsageDescription: "We need calendar access" }`
   */
  infoPlistKeys?: Record<string, string>;
  /** Whether the intent should be exposed to Spotlight indexing. */
  isDiscoverable?: boolean;
  /**
   * Optional interactive parameter summary shown in Shortcuts.
   *
   * Use `${paramName}` placeholders to reference intent parameters.
   * For conditional summaries, use `when` / `switch` blocks.
   */
  parameterSummary?: ParameterSummaryDefinition;
  /** Parameter definitions using `param.*` helpers. */
  params: TParams;
  /**
   * The perform function (used for local testing/type-checking).
   * Note: The compiler generates a placeholder `perform()` in Swift —
   * you'll implement the actual logic in your Xcode project.
   */
  perform: (params: {
    [K in keyof TParams]: unknown;
  }) => Promise<unknown>;
}

/**
 * Define an Apple App Intent for compilation to Swift.
 *
 * This is the main entry point for the Axint SDK. The returned definition
 * is parsed by the Axint compiler and transformed into a native Swift
 * `AppIntent` struct.
 *
 * @param config - The intent definition
 * @returns The same config (identity function for type inference)
 *
 * @example
 * ```typescript
 * export default defineIntent({
 *   name: "SendMessage",
 *   title: "Send Message",
 *   description: "Sends a message to a contact",
 *   domain: "messaging",
 *   params: {
 *     recipient: param.string("Who to send the message to"),
 *     body: param.string("The message content"),
 *   },
 *   perform: async ({ recipient, body }) => {
 *     return { sent: true };
 *   },
 * });
 * ```
 */
export function defineIntent<
  TParams extends Record<string, ReturnType<(typeof param)[keyof typeof param]>>,
>(config: IntentDefinition<TParams>): IntentDefinition<TParams> {
  return config;
}

export type ParameterSummaryDefinition =
  | string
  | {
      when: string;
      then: ParameterSummaryDefinition;
      otherwise?: ParameterSummaryDefinition;
    }
  | {
      switch: string;
      cases: Array<{
        value: string | number | boolean;
        summary: ParameterSummaryDefinition;
      }>;
      default?: ParameterSummaryDefinition;
    };

// ─── View Definition ────────────────────────────────────────────────

/** SwiftUI view body element types */
export type ViewElement =
  | { type: "vstack"; spacing?: number; alignment?: string; children: ViewElement[] }
  | { type: "hstack"; spacing?: number; alignment?: string; children: ViewElement[] }
  | { type: "zstack"; alignment?: string; children: ViewElement[] }
  | { type: "text"; content: string }
  | { type: "image"; systemName?: string; name?: string }
  | { type: "button"; label: string; action?: string }
  | { type: "spacer" }
  | { type: "divider" }
  | { type: "foreach"; collection: string; item: string; children: ViewElement[] }
  | { type: "if"; condition: string; then: ViewElement[]; else?: ViewElement[] }
  | { type: "navigationLink"; destination: string; children: ViewElement[] }
  | { type: "list"; children: ViewElement[] }
  | { type: "raw"; swift: string };

/** Configuration for view state properties */
export interface ViewStateConfig {
  kind?: "state" | "binding" | "environment" | "observed";
  default?: unknown;
  /** For @Environment, e.g. "\.dismiss" */
  environmentKey?: string;
}

type StateFactory<T extends string> = (
  description?: string,
  config?: Partial<ViewStateConfig>
) => { type: T } & Partial<ViewStateConfig>;

function makeState<T extends string>(type: T): StateFactory<T> {
  return (_description, config) => ({ type, ...config });
}

/** State property helpers — mirrors the param.* pattern for views */
export const state = {
  string: makeState("string"),
  int: makeState("int"),
  double: makeState("double"),
  float: makeState("float"),
  boolean: makeState("boolean"),
  date: makeState("date"),
  url: makeState("url"),
  /** Array of a given element type (pass the inner type string) */
  array: (
    elementType: string,
    _description?: string,
    config?: Partial<ViewStateConfig>
  ) => ({
    type: "array" as const,
    elementType,
    ...config,
  }),
};

/** View prop (input from parent) configuration */
export interface ViewPropConfig {
  description?: string;
  default?: unknown;
  required?: boolean;
}

type PropFactory<T extends string> = (
  description?: string,
  config?: Partial<ViewPropConfig>
) => { type: T; description?: string } & Partial<ViewPropConfig>;

function makeProp<T extends string>(type: T): PropFactory<T> {
  return (description, config) => ({ type, description, ...config });
}

/** View prop helpers for declaring inputs from parent views */
export const prop = {
  string: makeProp("string"),
  int: makeProp("int"),
  double: makeProp("double"),
  float: makeProp("float"),
  boolean: makeProp("boolean"),
  date: makeProp("date"),
  url: makeProp("url"),
};

/** SwiftUI view body builder helpers */
export const view = {
  vstack: (
    children: ViewElement[],
    opts?: { spacing?: number; alignment?: string }
  ): ViewElement => ({
    type: "vstack",
    children,
    ...opts,
  }),
  hstack: (
    children: ViewElement[],
    opts?: { spacing?: number; alignment?: string }
  ): ViewElement => ({
    type: "hstack",
    children,
    ...opts,
  }),
  zstack: (children: ViewElement[], opts?: { alignment?: string }): ViewElement => ({
    type: "zstack",
    children,
    ...opts,
  }),
  text: (content: string): ViewElement => ({ type: "text", content }),
  image: (opts: { systemName?: string; name?: string }): ViewElement => ({
    type: "image",
    ...opts,
  }),
  button: (label: string, action?: string): ViewElement => ({
    type: "button",
    label,
    action,
  }),
  spacer: (): ViewElement => ({ type: "spacer" }),
  divider: (): ViewElement => ({ type: "divider" }),
  foreach: (collection: string, item: string, children: ViewElement[]): ViewElement => ({
    type: "foreach",
    collection,
    item,
    children,
  }),
  conditional: (
    condition: string,
    then: ViewElement[],
    elseChildren?: ViewElement[]
  ): ViewElement => ({
    type: "if",
    condition,
    then,
    else: elseChildren,
  }),
  navigationLink: (destination: string, children: ViewElement[]): ViewElement => ({
    type: "navigationLink",
    destination,
    children,
  }),
  list: (children: ViewElement[]): ViewElement => ({ type: "list", children }),
  raw: (swift: string): ViewElement => ({ type: "raw", swift }),
};

/** The full view definition for generating a SwiftUI view struct. */
export interface ViewDefinition {
  /** PascalCase name for the generated Swift struct (e.g., "ProfileCard"). */
  name: string;
  /** Props received from parent view — using prop.* helpers. */
  props?: Record<string, ReturnType<(typeof prop)[keyof typeof prop]>>;
  /** Local state managed by this view — using state.* helpers. */
  state?: Record<string, ReturnType<(typeof state)[keyof typeof state]>>;
  /** The view body tree — using view.* helpers. */
  body: ViewElement[];
}

/**
 * Define a SwiftUI view for compilation to Swift.
 *
 * @example
 * ```typescript
 * export default defineView({
 *   name: "Greeting",
 *   props: {
 *     username: prop.string("User's display name"),
 *   },
 *   state: {
 *     tapCount: state.int("Number of taps", { default: 0 }),
 *   },
 *   body: [
 *     view.vstack([
 *       view.text("Hello, \\(username)!"),
 *       view.button("Tap me", "tapCount += 1"),
 *       view.text("Tapped \\(tapCount) times"),
 *     ], { spacing: 16 }),
 *   ],
 * });
 * ```
 */
export function defineView(config: ViewDefinition): ViewDefinition {
  return config;
}

// ─── Entity Definition ──────────────────────────────────────────────

/** Display representation mapping for an entity. */
export interface EntityDisplay {
  title: string;
  subtitle?: string;
  image?: string;
}

/** The full entity definition for generating an AppEntity struct. */
export interface EntityDefinition {
  /** PascalCase name for the generated Swift struct. */
  name: string;
  /** How the entity is displayed in Siri/Shortcuts. */
  display: EntityDisplay;
  /** Entity properties using `param.*` helpers. */
  properties: Record<string, ReturnType<(typeof param)[keyof typeof param]>>;
  /**
   * Query type:
   * - "all" for EnumerableEntityQuery
   * - "id" for EntityQuery
   * - "string" for EntityStringQuery
   * - "property" for EntityPropertyQuery
   */
  query?: "all" | "id" | "string" | "property";
}

/**
 * Define an Apple AppEntity for compilation to Swift.
 *
 * Generates a Swift `AppEntity` struct with `EntityQuery` conformance,
 * display representation, and typed properties.
 *
 * @param config - The entity definition
 * @returns The same config (identity function for type inference)
 */
export function defineEntity(config: EntityDefinition): EntityDefinition {
  return config;
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** Configuration for a widget timeline entry field */
export interface WidgetEntryConfig {
  description?: string;
  default?: unknown;
}

type WidgetEntryFactory<T extends string> = (
  description?: string,
  config?: Partial<WidgetEntryConfig>
) => { type: T; description?: string } & Partial<WidgetEntryConfig>;

function makeWidgetEntry<T extends string>(type: T): WidgetEntryFactory<T> {
  return (description, config) => ({ type, description, ...config });
}

/** Widget entry field helpers — timeline entry properties */
export const entry = {
  string: makeWidgetEntry("string"),
  int: makeWidgetEntry("int"),
  double: makeWidgetEntry("double"),
  float: makeWidgetEntry("float"),
  boolean: makeWidgetEntry("boolean"),
  date: makeWidgetEntry("date"),
  url: makeWidgetEntry("url"),
};

/** Widget family size option */
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

/** The full widget definition for generating a WidgetKit widget */
export interface WidgetDefinition {
  /** PascalCase name for the generated Swift struct (e.g., "StepCounterWidget"). */
  name: string;
  /** Display name shown in widget gallery. */
  displayName: string;
  /** Human-readable description of what this widget does. */
  description: string;
  /** Supported widget families/sizes. */
  families: WidgetFamily[];
  /** Timeline entry fields — using entry.* helpers. */
  entry: Record<string, ReturnType<(typeof entry)[keyof typeof entry]>>;
  /** The widget body tree — using view.* helpers. */
  body: ViewElement[];
  /** Refresh interval in minutes (required if refreshPolicy is "after"). */
  refreshInterval?: number;
  /** Refresh policy: "atEnd" (default), "after" (interval-based), "never". */
  refreshPolicy?: WidgetRefreshPolicy;
}

/**
 * Define a WidgetKit widget for compilation to Swift.
 *
 * @example
 * ```typescript
 * export default defineWidget({
 *   name: "StepCounter",
 *   displayName: "Step Counter",
 *   description: "Shows your daily step count",
 *   families: ["systemSmall", "systemMedium"],
 *   entry: {
 *     steps: entry.int("Current step count", { default: 0 }),
 *     goal: entry.int("Daily goal", { default: 10000 }),
 *     lastUpdated: entry.date("Last sync time"),
 *   },
 *   body: [
 *     view.vstack([
 *       view.text("\\(steps)"),
 *       view.text("of \\(goal) steps"),
 *     ], { spacing: 4 }),
 *   ],
 *   refreshInterval: 15,
 * });
 * ```
 */
export function defineWidget(config: WidgetDefinition): WidgetDefinition {
  return config;
}

// ─── App Definition ────────────────────────────────────────────────────────

/** Scene kind in a SwiftUI App */
export type AppSceneKind = "windowGroup" | "window" | "documentGroup" | "settings";

/** A single scene configuration */
export interface AppSceneConfig {
  /** Scene type: windowGroup, window, documentGroup, settings */
  kind: AppSceneKind;
  /** PascalCase name of the root SwiftUI view */
  view: string;
  /** Optional window title */
  title?: string;
  /** Optional scene identifier (for multi-window apps) */
  name?: string;
  /** Platform guard: only emit under #if os(...) */
  platform?: "macOS" | "iOS" | "visionOS";
}

/** AppStorage property type helpers */
export interface AppStorageConfig {
  default?: unknown;
}

type StorageFactory<T extends string> = (
  key: string,
  defaultValue?: unknown
) => { type: T; key: string; default?: unknown };

function makeStorage<T extends string>(type: T): StorageFactory<T> {
  return (key, defaultValue) => ({ type, key, default: defaultValue });
}

/** AppStorage property helpers for app-level persistent state */
export const storage = {
  string: makeStorage("string"),
  int: makeStorage("int"),
  double: makeStorage("double"),
  float: makeStorage("float"),
  boolean: makeStorage("boolean"),
  date: makeStorage("date"),
  url: makeStorage("url"),
};

/** Scene builder helpers */
export const scene = {
  /** Main window group (default scene for most apps) */
  windowGroup: (
    view: string,
    opts?: Omit<AppSceneConfig, "kind" | "view">
  ): AppSceneConfig => ({
    kind: "windowGroup",
    view,
    ...opts,
  }),
  /** Named window (macOS multi-window) */
  window: (
    view: string,
    opts?: Omit<AppSceneConfig, "kind" | "view">
  ): AppSceneConfig => ({
    kind: "window",
    view,
    ...opts,
  }),
  /** Document-based app group */
  documentGroup: (
    view: string,
    opts?: Omit<AppSceneConfig, "kind" | "view">
  ): AppSceneConfig => ({
    kind: "documentGroup",
    view,
    ...opts,
  }),
  /** Settings window (macOS) */
  settings: (
    view: string,
    opts?: Omit<AppSceneConfig, "kind" | "view">
  ): AppSceneConfig => ({
    kind: "settings",
    view,
    ...opts,
  }),
};

/** The full app definition for generating a SwiftUI @main App struct. */
export interface AppDefinition {
  /** PascalCase name for the generated App (e.g., "MyApp" → MyAppApp struct). */
  name: string;
  /** Scenes in the app — using scene.* helpers. */
  scenes: AppSceneConfig[];
  /** Optional app-level @AppStorage properties — using storage.* helpers. */
  appStorage?: Record<string, ReturnType<(typeof storage)[keyof typeof storage]>>;
}

/**
 * Define a SwiftUI App for compilation to Swift.
 *
 * @example
 * ```typescript
 * export default defineApp({
 *   name: "MyApp",
 *   scenes: [
 *     scene.windowGroup("ContentView"),
 *     scene.settings("SettingsView", { platform: "macOS" }),
 *   ],
 *   appStorage: {
 *     isDarkMode: storage.boolean("dark_mode", false),
 *     username: storage.string("username", ""),
 *   },
 * });
 * ```
 */
export function defineApp(config: AppDefinition): AppDefinition {
  return config;
}

// ─── Live Activity Definition ───────────────────────────────────────────────

/** Configuration for a Live Activity attribute / contentState field */
export interface ActivityStateConfig {
  description?: string;
  default?: unknown;
}

type ActivityStateFactory<T extends string> = (
  description?: string,
  config?: Partial<ActivityStateConfig>
) => { type: T; description?: string } & Partial<ActivityStateConfig>;

function makeActivityState<T extends string>(type: T): ActivityStateFactory<T> {
  return (description, config) => ({ type, description, ...config });
}

/**
 * Live Activity field helpers for `attributes` (immutable) and
 * `contentState` (mutable) blocks. Maps to the same Swift types as
 * `param.*`.
 */
export const activityState = {
  string: makeActivityState("string"),
  int: makeActivityState("int"),
  double: makeActivityState("double"),
  float: makeActivityState("float"),
  boolean: makeActivityState("boolean"),
  date: makeActivityState("date"),
  duration: makeActivityState("duration"),
  url: makeActivityState("url"),
};

/** Dynamic Island region bodies — four required, one optional. */
export interface DynamicIslandConfig {
  /** Expanded state center region — shown when the user long-presses. */
  expanded: ViewElement[];
  /** Expanded state bottom region — optional row below `expanded`. */
  bottom?: ViewElement[];
  /** Compact leading (left of the notch / camera cutout). */
  compactLeading: ViewElement[];
  /** Compact trailing (right of the notch / camera cutout). */
  compactTrailing: ViewElement[];
  /** Minimal state when multiple Live Activities share the island. */
  minimal: ViewElement[];
}

/** The full Live Activity definition for ActivityKit codegen. */
export interface LiveActivityDefinition {
  /** PascalCase base name — generator emits `<Name>Attributes` + `<Name>LiveActivity`. */
  name: string;
  /** Immutable fields — passed in at activity start, never change. */
  attributes?: Record<
    string,
    ReturnType<(typeof activityState)[keyof typeof activityState]>
  >;
  /** Mutable fields — update during the activity's lifetime. */
  contentState: Record<
    string,
    ReturnType<(typeof activityState)[keyof typeof activityState]>
  >;
  /** Lock-screen / banner body. */
  lockScreen: ViewElement[];
  /** Dynamic Island regions. */
  dynamicIsland: DynamicIslandConfig;
}

/**
 * Define a Live Activity for compilation to ActivityKit Swift.
 *
 * @example
 * ```typescript
 * export default defineLiveActivity({
 *   name: "PizzaDelivery",
 *   attributes: {
 *     orderNumber: activityState.string("Order number"),
 *   },
 *   contentState: {
 *     status: activityState.string("Order status"),
 *     eta: activityState.date("Estimated arrival"),
 *     progress: activityState.double("Delivery progress 0-1"),
 *   },
 *   lockScreen: [
 *     view.vstack([
 *       view.text("Pizza on the way"),
 *       view.text("ETA: soon"),
 *     ]),
 *   ],
 *   dynamicIsland: {
 *     expanded: [view.text("Expanded")],
 *     compactLeading: [view.image({ systemName: "bicycle" })],
 *     compactTrailing: [view.text("5m")],
 *     minimal: [view.image({ systemName: "bicycle" })],
 *   },
 * });
 * ```
 */
export function defineLiveActivity(
  config: LiveActivityDefinition
): LiveActivityDefinition {
  return config;
}

/** A single case in an App Enum. */
export interface AppEnumCaseConfig {
  /** Raw string value — becomes the Swift case name and RawValue. */
  value: string;
  /** Human-readable label shown in Shortcuts and Siri. */
  title: string;
  /** Optional SF Symbol name for the case display representation. */
  image?: string;
}

/** An App Enum definition — compiles to `enum: String, AppEnum`. */
export interface AppEnumDefinition {
  /** PascalCase type name — becomes the Swift enum identifier. */
  name: string;
  /** Type display representation shown in Shortcuts (falls back to name). */
  title?: string;
  /** The ordered list of cases. */
  cases: AppEnumCaseConfig[];
}

/**
 * Define an App Enum for use as a parameter type in App Intents or
 * Shortcuts. Compiles to a Swift `enum: String, AppEnum` with the
 * required `typeDisplayRepresentation` and `caseDisplayRepresentations`.
 *
 * @example
 * ```typescript
 * export default defineAppEnum({
 *   name: "PizzaSize",
 *   title: "Pizza Size",
 *   cases: [
 *     { value: "small", title: "Small" },
 *     { value: "medium", title: "Medium" },
 *     { value: "large", title: "Large" },
 *   ],
 * });
 * ```
 */
export function defineAppEnum(config: AppEnumDefinition): AppEnumDefinition {
  return config;
}
