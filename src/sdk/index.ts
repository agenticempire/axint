/**
 * @axint/sdk — Decorators and types for defining Apple App Intents
 *
 * Usage:
 *   import { defineIntent, param } from "@axint/sdk"
 */

// ─── Intent Definition ───────────────────────────────────────────────

export interface IntentConfig {
  /** Display name shown in Siri and Shortcuts */
  title: string;
  /** Human-readable description of what this intent does */
  description: string;
  /** Apple App Intent Domain (messaging, productivity, finance, etc.) */
  domain?: string;
  /** Siri/Shortcuts category for discoverability */
  category?: string;
}

export interface ParamConfig {
  /** Display name for this parameter */
  title?: string;
  /** Human-readable description */
  description: string;
  /** Default value if not provided */
  default?: unknown;
  /** Whether this parameter is required */
  required?: boolean;
}

// ─── Parameter Type Helpers ──────────────────────────────────────────

export const param = {
  string: (description: string, config?: Partial<ParamConfig>) => ({
    type: "string" as const,
    description,
    ...config,
  }),
  number: (description: string, config?: Partial<ParamConfig>) => ({
    type: "number" as const,
    description,
    ...config,
  }),
  boolean: (description: string, config?: Partial<ParamConfig>) => ({
    type: "boolean" as const,
    description,
    ...config,
  }),
  date: (description: string, config?: Partial<ParamConfig>) => ({
    type: "date" as const,
    description,
    ...config,
  }),
  duration: (description: string, config?: Partial<ParamConfig>) => ({
    type: "duration" as const,
    description,
    ...config,
  }),
  url: (description: string, config?: Partial<ParamConfig>) => ({
    type: "url" as const,
    description,
    ...config,
  }),
  array: (
    elementType: string,
    description: string,
    config?: Partial<ParamConfig>
  ) => ({
    type: "array" as const,
    elementType,
    description,
    ...config,
  }),
};

// ─── Intent Definition Function ──────────────────────────────────────

export interface IntentDefinition<
  TParams extends Record<string, ReturnType<(typeof param)[keyof typeof param]>>
> {
  name: string;
  title: string;
  description: string;
  domain?: string;
  category?: string;
  params: TParams;
  perform: (params: {
    [K in keyof TParams]: unknown;
  }) => Promise<unknown>;
}

export function defineIntent<
  TParams extends Record<string, ReturnType<(typeof param)[keyof typeof param]>>
>(config: IntentDefinition<TParams>): IntentDefinition<TParams> {
  return config;
}
