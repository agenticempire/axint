export { compileFile, compileSource, compileFromIR, irFromJSON } from "./compiler.js";
export { parseIntentSource, ParserError } from "./parser.js";
export {
  generateSwift,
  generateEntity,
  generateEntityQuery,
  generateInfoPlistFragment,
  generateEntitlementsFragment,
  escapeSwiftString,
  escapeXml,
} from "./generator.js";
export { validateIntent, validateEntity, validateSwiftSource } from "./validator.js";
export { ejectIntent } from "./eject.js";
export {
  irTypeToSwift,
  SWIFT_TYPE_MAP,
  PARAM_TYPES,
  LEGACY_PARAM_ALIASES,
} from "./types.js";
export type * from "./types.js";
export type { EjectOptions, EjectResult } from "./eject.js";

// Re-export SDK authoring helpers so `import { defineIntent, param } from "@axintai/compiler"`
// works out of the box — the most common import path for new users.
export { defineIntent, param } from "../sdk/index.js";
export type { IntentDefinition, ParamConfig } from "../sdk/index.js";
