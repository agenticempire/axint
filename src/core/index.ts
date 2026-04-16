export {
  compileFile,
  compileSource,
  compileFromIR,
  compileViewSource,
  compileViewFromIR,
  compileWidgetSource,
  compileWidgetFromIR,
  compileAppSource,
  compileAppFromIR,
  irFromJSON,
} from "./compiler.js";
export type {
  ViewCompileResult,
  WidgetCompileResult,
  AppCompileResult,
} from "./compiler.js";
export { parseIntentSource, ParserError } from "./parser.js";
export { parseViewSource } from "./view-parser.js";
export { parseWidgetSource } from "./widget-parser.js";
export { parseAppSource } from "./app-parser.js";
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
export { generateSwiftWidget } from "./widget-generator.js";
export { generateSwiftApp } from "./app-generator.js";
export { validateIntent, validateEntity, validateSwiftSource } from "./validator.js";
export { validateView, validateSwiftUISource } from "./view-validator.js";
export { validateWidget, validateSwiftWidgetSource } from "./widget-validator.js";
export { validateApp, validateSwiftAppSource } from "./app-validator.js";
export { fixSwiftSource } from "./swift-fixer.js";
export {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_COUNT,
  getDiagnostic,
  getCodesByCategory,
} from "./diagnostics.js";
export type { DiagnosticInfo } from "./diagnostics.js";
export { ejectIntent } from "./eject.js";
export {
  irTypeToSwift,
  SWIFT_TYPE_MAP,
  PARAM_TYPES,
  LEGACY_PARAM_ALIASES,
} from "./types.js";
export type * from "./types.js";
export type { EjectOptions, EjectResult } from "./eject.js";
export type { FixResult } from "./swift-fixer.js";

// Re-export SDK authoring helpers so `import { defineIntent, param } from "@axint/compiler"`
// works out of the box — the most common import path for new users.
export {
  defineIntent,
  defineEntity,
  defineView,
  defineWidget,
  defineApp,
  param,
  prop,
  state,
  entry,
  view,
  scene,
  storage,
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
  WidgetDefinition,
  WidgetEntryConfig,
  WidgetFamily,
  WidgetRefreshPolicy,
  AppDefinition,
  AppSceneConfig,
  AppSceneKind,
} from "../sdk/index.js";
