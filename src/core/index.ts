export {
  compileFile,
  compileSource,
  compileEntitySource,
  compileEntitiesFromIR,
  compileFromIR,
  compileAnyFile,
  compileAnySource,
  compileViewSource,
  compileViewFromIR,
  compileWidgetSource,
  compileWidgetFromIR,
  compileUnionValueSource,
  compileUnionValueFromIR,
  compileAppSource,
  compileAppFromIR,
  irFromJSON,
} from "./compiler.js";
export type {
  AnyCompileResult,
  EntityCompileResult,
  EntityCompileOutput,
  ViewCompileResult,
  WidgetCompileResult,
  UnionValueCompileResult,
  AppCompileResult,
} from "./compiler.js";
export { parseEntitySource, parseIntentSource, ParserError } from "./parser.js";
export { parseViewSource } from "./view-parser.js";
export { parseWidgetSource } from "./widget-parser.js";
export { parseUnionValueSource } from "./union-value-parser.js";
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
export { generateSwiftUnionValue } from "./union-value-generator.js";
export { generateSwiftApp } from "./app-generator.js";
export { validateIntent, validateEntity, validateSwiftSource } from "./validator.js";
export { validateView, validateSwiftUISource } from "./view-validator.js";
export { validateWidget, validateSwiftWidgetSource } from "./widget-validator.js";
export { validateUnionValue } from "./union-value-validator.js";
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
export { buildToolContract, renderToolContractMarkdown } from "./tool-contract.js";
export { generateAppIntentsTestingHarness } from "../apple-intelligence/appintents-testing.js";
export type {
  AxintToolContract,
  AxintToolContractConfidence,
  AxintToolContractDiagnostic,
  AxintToolContractStatus,
  AxintToolContractVerdict,
} from "./tool-contract.js";
export type { AppIntentsTestingHarnessInput } from "../apple-intelligence/appintents-testing.js";
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
  defineUnionValue,
  defineApp,
  defineLiveActivity,
  defineAppEnum,
  defineAppShortcut,
  defineExtension,
  param,
  prop,
  state,
  entry,
  view,
  scene,
  storage,
  activityState,
  appSchemaDomains,
} from "../sdk/index.js";
export type {
  IntentDefinition,
  AppSchemaDomain,
  AppIntentConformance,
  EntityOwnership,
  FoundationModelProvider,
  FoundationModelModality,
  FoundationModelImageInputDefinition,
  FoundationModelCustomProviderDefinition,
  FoundationModelDynamicProfileDefinition,
  FoundationModelGenerableDefinition,
  FoundationModelToolDefinition,
  FoundationModelDefinition,
  EvaluationDefinition,
  ImagePlaygroundDefinition,
  PreviewProofDefinition,
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
  UnionValueDefinition,
  UnionValueCaseConfig,
  AppDefinition,
  AppSceneConfig,
  AppSceneKind,
  LiveActivityDefinition,
  ActivityStateConfig,
  DynamicIslandConfig,
  AppEnumDefinition,
  AppEnumCaseConfig,
  AppShortcutDefinition,
  AppShortcutEntryConfig,
  ExtensionDefinition,
  ExtensionTargetConfig,
  ExtensionKind,
} from "../sdk/index.js";
