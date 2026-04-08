/**
 * @axint/sdk — Decorators and types for defining Apple App Intents
 *
 * @example
 * ```typescript
 * import { defineIntent, param } from "@axint/sdk";
 *
 * export default defineIntent({
 *   name: "CreateEvent",
 *   title: "Create Calendar Event",
 *   description: "Creates a new event in the user's calendar",
 *   params: {
 *     title: param.string("Event title"),
 *     date: param.date("Event date"),
 *   },
 *   perform: async ({ title, date }) => {
 *     return { success: true };
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// ─── Intent Definition ───────────────────────────────────────────────

/** Configuration for an App Intent's metadata. */
export interface IntentConfig {
  /** Display name shown in Siri and Shortcuts (max 60 chars recommended). */
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
}

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

// ─── Parameter Type Helpers ──────────────────────────────────────────

/**
 * Parameter type helpers for defining intent parameters.
 *
 * @example
 * ```typescript
 * params: {
 *   name: param.string("User's name"),
 *   count: param.number("How many", { default: 1 }),
 *   notify: param.boolean("Send notification", { required: false }),
 *   when: param.date("Scheduled date"),
 *   length: param.duration("How long"),
 *   link: param.url("Resource URL"),
 * }
 * ```
 */
export const param = {
  /** String parameter → Swift `String` */
  string: (description: string, config?: Partial<ParamConfig>) => ({
    type: "string" as const,
    description,
    ...config,
  }),
  /** Number parameter → Swift `Int` */
  number: (description: string, config?: Partial<ParamConfig>) => ({
    type: "number" as const,
    description,
    ...config,
  }),
  /** Boolean parameter → Swift `Bool` */
  boolean: (description: string, config?: Partial<ParamConfig>) => ({
    type: "boolean" as const,
    description,
    ...config,
  }),
  /** Date parameter → Swift `Date` */
  date: (description: string, config?: Partial<ParamConfig>) => ({
    type: "date" as const,
    description,
    ...config,
  }),
  /** Duration parameter → Swift `Measurement<UnitDuration>` */
  duration: (description: string, config?: Partial<ParamConfig>) => ({
    type: "duration" as const,
    description,
    ...config,
  }),
  /** URL parameter → Swift `URL` */
  url: (description: string, config?: Partial<ParamConfig>) => ({
    type: "url" as const,
    description,
    ...config,
  }),
  // array() planned for v0.2.0 — requires parser support for element type extraction
};

// ─── Intent Definition Function ──────────────────────────────────────

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
  /** Apple App Intent Domain (e.g., "productivity", "messaging"). */
  domain?: string;
  /** Siri/Shortcuts category for discoverability. */
  category?: string;
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
