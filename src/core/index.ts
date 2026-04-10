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
