export {
  compileFile,
  compileSource,
  compileFromIR,
  compileViewSource,
  compileViewFromIR,
  irFromJSON,
} from "./compiler.js";
export type { ViewCompileResult } from "./compiler.js";
export { parseIntentSource, ParserError } from "./parser.js";
export { parseViewSource } from "./view-parser.js";
export {
  generateSwift,
  generateEntity,
  generateEntityQuery,
  generateInfoPlistFragment,
  generateEntitlementsFragment,
  escapeSwiftString,
  escapeXml,
} from "./generator.js";
export { generateSwiftUIView } from "./view-generator.js";
export { validateIntent, validateEntity, validateSwiftSource } from "./validator.js";
export { validateView, validateSwiftUISource } from "./view-validator.js";
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
export {
  defineIntent,
  defineEntity,
  defineView,
  param,
  prop,
  state,
  view,
} from "../sdk/index.js";
export type {
  IntentDefinition,
  EntityDefinition,
  EntityDisplay,
  ViewDefinition,
  ViewElement,
  ViewStateConfig,
  ViewPropConfig,
  ParamConfig,
} from "../sdk/index.js";
