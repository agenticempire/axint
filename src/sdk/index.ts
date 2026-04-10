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
 * import { defineIntent, param } from "@axintai/compiler";
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
