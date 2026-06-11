/**
 * Axint Swift Code Generator
 *
 * Transforms the IR into clean, idiomatic Swift App Intent source code.
 * Uses string templates for readability and maintainability.
 *
 * In addition to the primary Swift file, this module can emit two
 * companion fragments:
 *   - an Info.plist XML fragment, listing the keys the intent requires
 *   - an .entitlements XML fragment, listing the entitlements the
 *     intent requires
 *
 * Both fragments are designed to be merged into the host Xcode project
 * by the user (or a future axint-link command).
 */

import type {
  IRIntent,
  IRParameter,
  IRType,
  IREntity,
  IRParameterSummary,
  IREvaluationConfig,
  IRPreviewProofConfig,
} from "./types.js";
import { irTypeToSwift } from "./types.js";

// ─── String Escaping ─────────────────────────────────────────────────

/**
 * Escape a string for safe interpolation into Swift string literals.
 * Prevents code injection via user-controlled titles/descriptions.
 */
export function escapeSwiftString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function quotedSwiftString(value: string): string {
  return `"${escapeSwiftString(value)}"`;
}

/**
 * Escape a string for safe interpolation into XML (Info.plist or
 * .entitlements). Plist XML uses the same rules as general XML.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generatedFileHeader(fileName: string): string[] {
  return [
    `// ${fileName}`,
    "// Axint compiler output. Edit freely; regenerate from the source definition when useful.",
  ];
}

// ─── Primary Swift Generator ─────────────────────────────────────────

/**
 * Generate a Swift App Intent source file from an IR intent.
 * If entities are present, they are generated first, followed by the intent.
 */
export function generateSwift(intent: IRIntent): string {
  const lines: string[] = [];
  const safeIntent = makeIntentParametersSwiftSafe(intent);

  // File header
  lines.push(...generatedFileHeader(`${intent.name}Intent.swift`));
  lines.push(``);
  lines.push(`import AppIntents`);
  if (intentUsesCoreTransferable(safeIntent)) {
    lines.push(`import CoreTransferable`);
  }
  if (safeIntent.model) {
    lines.push(`import FoundationModels`);
  }
  if (safeIntent.imagePlayground) {
    lines.push(`import ImagePlayground`);
  }
  lines.push(`import Foundation`);
  lines.push(``);

  // Generate entities before the intent
  if (safeIntent.entities && safeIntent.entities.length > 0) {
    for (const entity of safeIntent.entities) {
      lines.push(generateEntity(entity));
      lines.push(``);
      lines.push(generateEntityQuery(entity));
      lines.push(``);
    }
  }

  for (const provider of collectDynamicOptionsProviders(safeIntent.parameters)) {
    lines.push(generateDynamicOptionsProvider(provider.providerName, provider.valueType));
    lines.push(``);
  }

  if (safeIntent.model) {
    lines.push(generateFoundationModelSupport(safeIntent));
    lines.push(``);
  }

  if (safeIntent.imagePlayground) {
    lines.push(generateImagePlaygroundSupport(safeIntent));
    lines.push(``);
  }

  // Struct declaration
  if (safeIntent.schema) {
    lines.push(`@AppIntent(schema: ${safeIntent.schema})`);
  }
  lines.push(
    `struct ${safeIntent.name}Intent: ${intentConformances(safeIntent).join(", ")} {`
  );

  // Static metadata
  lines.push(
    `    static var title: LocalizedStringResource = "${escapeSwiftString(safeIntent.title)}"`
  );
  lines.push(
    `    static var description: IntentDescription = IntentDescription("${escapeSwiftString(safeIntent.description)}")`
  );
  if (safeIntent.isDiscoverable !== undefined) {
    lines.push(`    static let isDiscoverable: Bool = ${safeIntent.isDiscoverable}`);
  }
  if (safeIntent.supportedModes) {
    lines.push(
      `    static var supportedModes: IntentModes { ${safeIntent.supportedModes} }`
    );
  }
  if (safeIntent.allowedExecutionTargets) {
    lines.push(
      `    static var allowedExecutionTargets: ExecutionTargets { ${safeIntent.allowedExecutionTargets} }`
    );
  }
  lines.push(``);

  // Parameters
  for (const param of safeIntent.parameters) {
    lines.push(generateParameter(param));
  }

  if (safeIntent.parameters.length > 0) {
    lines.push(``);
  }

  if (safeIntent.parameterSummary) {
    lines.push(`    static var parameterSummary: some ParameterSummary {`);
    lines.push(...generateParameterSummary(safeIntent.parameterSummary, 8));
    lines.push(`    }`);
    lines.push(``);
  }

  // Perform function with return-type aware signature
  const returnTypeSignature = generateReturnSignature(
    safeIntent.returnType,
    safeIntent.customResultType
  );
  lines.push(`    func perform() async throws -> ${returnTypeSignature} {`);
  lines.push(`        // TODO: Implement your intent logic here.`);

  if (safeIntent.parameters.length > 0) {
    const paramList = safeIntent.parameters.map((p) => p.name).join(", ");
    lines.push(`        // Parameters available: ${paramList}`);
  }

  // Donate this intent to the system prediction engine so Siri and
  // Spotlight can surface it proactively. The donate API lives on the
  // intent itself since iOS 16 — no separate manager type needed.
  if (safeIntent.donateOnPerform) {
    lines.push(`        `);
    lines.push(`        // Donate to Siri and Spotlight`);
    lines.push(`        try? await self.donate()`);
  }

  lines.push(generatePerformReturn(safeIntent.returnType, safeIntent.customResultType));
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);

  if (safeIntent.evaluation) {
    lines.push(generateEvaluationSupport(safeIntent.evaluation));
    lines.push(``);
  }

  if (safeIntent.previewProof) {
    lines.push(generatePreviewProofSupport(safeIntent.previewProof));
    lines.push(``);
  }

  if (safeIntent.testHarness) {
    lines.push(generateTestHarnessSupport(safeIntent));
    lines.push(``);
  }

  return lines.join("\n");
}

// ─── Entity Generation ───────────────────────────────────────────────

/**
 * Generate an AppEntity struct from an IREntity definition.
 */
export function generateEntity(entity: IREntity): string {
  const lines: string[] = [];
  const propertyNames = new Set(entity.properties.map((p) => p.name));

  if (entity.schema) {
    lines.push(`@AppEntity(schema: ${entity.schema})`);
  }
  lines.push(`struct ${entity.name}: ${entityConformances(entity).join(", ")} {`);
  lines.push(`    static var defaultQuery = ${entity.name}Query()`);
  if (entity.semanticIndex) {
    lines.push(
      `    // Spotlight semantic index: ${escapeSwiftString(entity.semanticIndex.contentType)}`
    );
    if (entity.semanticIndex.attribution) {
      lines.push(
        `    // Semantic index attribution: ${escapeSwiftString(entity.semanticIndex.attribution)}`
      );
    }
    if (entity.semanticIndex.searchableByLLM !== undefined) {
      lines.push(
        `    // Searchable by Apple Intelligence: ${entity.semanticIndex.searchableByLLM}`
      );
    }
    if (entity.semanticIndex.attributes?.length) {
      lines.push(
        `    // Semantic index attributes: ${entity.semanticIndex.attributes.map(escapeSwiftString).join(", ")}`
      );
    }
  }
  lines.push(``);

  // Apple requires AppEntity to have an id property
  const hasId = propertyNames.has("id");
  if (!hasId) {
    lines.push(`    var id: String`);
  }

  // Properties
  for (const prop of entity.properties) {
    const swiftType = irTypeToSwift(prop.type);
    if (prop.name === "id") {
      lines.push(`    var id: ${swiftType}`);
      continue;
    }
    lines.push(`    @Property(title: "${escapeSwiftString(prop.title)}")`);
    lines.push(`    var ${prop.name}: ${swiftType}`);
  }

  lines.push(``);

  // Type display representation
  lines.push(
    `    static let typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(`
  );
  lines.push(
    `        name: LocalizedStringResource("${escapeSwiftString(entity.name)}")`
  );
  lines.push(`    )`);
  lines.push(``);

  // Display representation computed property — title/subtitle are property
  // name references, so we emit Swift string interpolation \(propName)
  lines.push(`    var displayRepresentation: DisplayRepresentation {`);
  lines.push(`        DisplayRepresentation(`);
  lines.push(
    `            title: "\\(${entity.displayRepresentation.title})"${entity.displayRepresentation.subtitle || entity.displayRepresentation.image ? "," : ""}`
  );
  if (entity.displayRepresentation.subtitle) {
    const hasImage = !!entity.displayRepresentation.image;
    lines.push(
      `            subtitle: "\\(${entity.displayRepresentation.subtitle})"${hasImage ? "," : ""}`
    );
  }
  if (entity.displayRepresentation.image) {
    lines.push(
      `            image: .init(systemName: "${escapeSwiftString(entity.displayRepresentation.image)}")`
    );
  }
  lines.push(`        )`);
  lines.push(`    }`);

  if (entity.ownership) {
    lines.push(``);
    lines.push(`    var ownership: EntityOwnership { .${entity.ownership} }`);
  }

  if (entity.intentValueRepresentation) {
    lines.push(``);
    lines.push(`    static var transferRepresentation: some TransferRepresentation {`);
    lines.push(`        ${entity.intentValueRepresentation}`);
    lines.push(`    }`);
  }

  lines.push(`}`);

  return lines.join("\n");
}

/**
 * Generate an EntityQuery conformance struct based on the entity's query type.
 */
export function generateEntityQuery(entity: IREntity): string {
  const lines: string[] = [];
  const queryType = entity.queryType;

  const protocol =
    queryType === "all"
      ? "EnumerableEntityQuery"
      : queryType === "string"
        ? "EntityStringQuery"
        : queryType === "property"
          ? "EntityPropertyQuery"
          : "EntityQuery";
  const queryConformances = entity.indexedQuery
    ? [protocol, "IndexedEntityQuery"]
    : [protocol];
  lines.push(`struct ${entity.name}Query: ${queryConformances.join(", ")} {`);
  if (queryType === "all" || queryType === "property") {
    lines.push(
      `    static var findIntentDescription: IntentDescription = IntentDescription("Find ${escapeSwiftString(entity.name)}")`
    );
    lines.push(``);
  }
  lines.push(
    `    func entities(for identifiers: [${entity.name}.ID]) async throws -> [${entity.name}] {`
  );
  lines.push(`        // TODO: Fetch entities by IDs`);
  lines.push(`        return []`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    func suggestedEntities() async throws -> [${entity.name}] {`);
  lines.push(`        // TODO: Return suggested entities for pickers and shortcuts`);
  lines.push(`        return []`);
  lines.push(`    }`);
  lines.push(``);

  // Generate appropriate query method based on queryType
  if (queryType === "all") {
    lines.push(`    func allEntities() async throws -> [${entity.name}] {`);
    lines.push(`        // TODO: Return all entities`);
    lines.push(`        return []`);
    lines.push(`    }`);
  } else if (queryType === "id") {
    // ID-based query is handled by entities(for:) above
    lines.push(`    // ID-based query is provided by the entities(for:) method above`);
  } else if (queryType === "string") {
    lines.push(
      `    func entities(matching string: String) async throws -> [${entity.name}] {`
    );
    lines.push(`        // TODO: Search entities by string`);
    lines.push(`        return []`);
    lines.push(`    }`);
  } else if (queryType === "property") {
    // Property-based query: generate EntityPropertyQuery with sortable/filterable properties
    const queryableProps = entity.properties
      .map((prop) => ({
        prop,
        type: queryablePropertyType(prop.type),
      }))
      .filter((entry) => entry.prop.name !== "id")
      .filter(
        (entry): entry is { prop: IRParameter; type: IRType } => entry.type !== null
      );

    lines.push(`    static var properties = QueryProperties {`);
    for (const entry of queryableProps) {
      const swiftType = irTypeToSwift(entry.type);
      lines.push(`        Property(\\.$${entry.prop.name}) {`);
      lines.push(`            EqualToComparator()`);
      if (swiftType === "String") {
        lines.push(`            ContainsComparator()`);
      }
      if (["Int", "Double", "Float", "Date"].includes(swiftType)) {
        lines.push(`            LessThanComparator()`);
        lines.push(`            GreaterThanComparator()`);
      }
      lines.push(`        }`);
    }
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    static var sortingOptions = SortingOptions {`);
    for (const entry of queryableProps) {
      lines.push(`        SortableBy(\\.$${entry.prop.name})`);
    }
    lines.push(`    }`);
    lines.push(``);
    lines.push(
      `    func entities(matching comparators: [${entity.name}Comparator], mode: ComparatorMode, sortedBy: [${entity.name}Sort], limit: Int?) async throws -> [${entity.name}] {`
    );
    lines.push(`        // TODO: Filter and sort entities using the comparators`);
    lines.push(`        return []`);
    lines.push(`    }`);
  }

  lines.push(`}`);

  return lines.join("\n");
}

function generateDynamicOptionsProvider(providerName: string, valueType: IRType): string {
  const lines: string[] = [];
  lines.push(`struct ${providerName}: DynamicOptionsProvider {`);
  lines.push(`    func results() async throws -> [${irTypeToSwift(valueType)}] {`);
  lines.push(`        // TODO: Return runtime-backed options for this parameter.`);
  lines.push(`        return []`);
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join("\n");
}

function generateFoundationModelSupport(intent: IRIntent): string {
  const model = intent.model!;
  const sessionName = model.sessionName || `${intent.name}ModelSession`;
  const lines: string[] = [];

  if (model.generable) {
    lines.push(`@Generable`);
    lines.push(`struct ${model.generable.name}: Generable {`);
    for (const [name, type] of Object.entries(model.generable.fields)) {
      lines.push(`    var ${name}: ${type}`);
    }
    lines.push(`}`);
    lines.push(``);
  }

  for (const tool of model.tools ?? []) {
    const argumentsType = tool.argumentsType || `${tool.name}Arguments`;
    const outputType = tool.outputType || "String";
    if (tool.kind) {
      lines.push(`// ${tool.name} is a ${tool.kind} Foundation Models tool.`);
    }
    lines.push(`struct ${tool.name}: Tool {`);
    lines.push(`    let name = "${escapeSwiftString(tool.name)}"`);
    lines.push(`    let description = "${escapeSwiftString(tool.description)}"`);
    if (tool.kind === "ocr") {
      lines.push(`    // OCRVisionTool: connect this to Vision text-recognition proof.`);
    } else if (tool.kind === "barcode") {
      lines.push(`    // BarcodeVisionTool: connect this to Vision barcode proof.`);
    } else if (tool.kind === "vision") {
      lines.push(`    // Vision framework tool: attach image-understanding fixtures.`);
    }
    lines.push(``);
    lines.push(`    @Generable`);
    lines.push(`    struct Arguments: Generable {`);
    lines.push(
      `        // TODO: Replace with fields from ${escapeSwiftString(argumentsType)}.`
    );
    lines.push(`        var query: String`);
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    func call(arguments: Arguments) async throws -> ${outputType} {`);
    lines.push(`        // TODO: Implement ${escapeSwiftString(tool.name)} safely.`);
    lines.push(`        ${defaultFoundationModelToolReturn(outputType)}`);
    lines.push(`    }`);
    lines.push(`}`);
    lines.push(``);
  }

  if (model.dynamicProfiles?.length) {
    lines.push(`enum ${sessionName}Profiles {`);
    for (const profile of model.dynamicProfiles) {
      lines.push(
        `    static let ${swiftIdentifier(profile.name)} = "${escapeSwiftString(profile.provider ?? model.provider)}"`
      );
      if (profile.instructions) {
        lines.push(
          `    // ${escapeSwiftString(profile.name)} instructions: ${escapeSwiftString(profile.instructions)}`
        );
      }
      if (profile.tools?.length) {
        lines.push(
          `    // ${escapeSwiftString(profile.name)} tools: ${profile.tools.map(escapeSwiftString).join(", ")}`
        );
      }
    }
    lines.push(`}`);
    lines.push(``);
  }

  lines.push(`enum ${sessionName}Factory {`);
  lines.push(`    static func make() -> LanguageModelSession {`);
  if (model.instructions) {
    lines.push(
      `        let instructions = Instructions("${escapeSwiftString(model.instructions)}")`
    );
  } else {
    lines.push(`        let instructions = Instructions("")`);
  }
  if (model.dynamicProfile) {
    lines.push(`        // Dynamic Profile: ${escapeSwiftString(model.dynamicProfile)}`);
  }
  if (model.dynamicProfiles?.length) {
    lines.push(
      `        // Dynamic Profiles: ${model.dynamicProfiles.map((profile) => escapeSwiftString(profile.name)).join(", ")}`
    );
  }
  if (model.promptVersion) {
    lines.push(`        // Prompt version: ${escapeSwiftString(model.promptVersion)}`);
  }
  if (model.modalities?.length) {
    lines.push(
      `        // Multimodal inputs: ${model.modalities.map(escapeSwiftString).join(", ")}`
    );
  }
  for (const imageInput of model.imageInputs ?? []) {
    lines.push(
      `        // Image input ${escapeSwiftString(imageInput.name)} from ${escapeSwiftString(imageInput.source)}${imageInput.required === false ? " (optional)" : ""}`
    );
  }
  if (model.customProvider) {
    lines.push(
      `        // Custom Language Model provider: ${escapeSwiftString(model.customProvider.typeName)}`
    );
    if (model.customProvider.packageName) {
      lines.push(
        `        // Custom provider Swift package: ${escapeSwiftString(model.customProvider.packageName)}`
      );
    }
    if (model.customProvider.configuration) {
      lines.push(
        `        // Custom provider configuration: ${escapeSwiftString(model.customProvider.configuration)}`
      );
    }
  }
  if (model.guardrails?.length) {
    lines.push(
      `        // Guardrails: ${model.guardrails.map(escapeSwiftString).join(", ")}`
    );
  }
  lines.push(
    `        // Provider: ${escapeSwiftString(model.provider)}${model.useCase ? ` · Use case: ${escapeSwiftString(model.useCase)}` : ""}`
  );
  if (model.prompt) {
    lines.push(`        // Prompt seed: ${escapeSwiftString(model.prompt)}`);
  }
  if (model.tools?.length) {
    lines.push(
      `        // Tools: ${model.tools.map((tool) => escapeSwiftString(tool.name)).join(", ")}`
    );
  }
  lines.push(`        return LanguageModelSession(instructions: instructions)`);
  lines.push(`    }`);
  lines.push(`}`);

  return lines.join("\n");
}

function swiftIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "_");
  if (!sanitized) return "profile";
  if (/^[A-Za-z_]/.test(sanitized)) return sanitized;
  return `profile_${sanitized}`;
}

function defaultFoundationModelToolReturn(outputType: string): string {
  if (outputType === "String") return `return ""`;
  if (outputType === "Int") return `return 0`;
  if (outputType === "Bool") return `return false`;
  if (/^\[[A-Za-z_][A-Za-z0-9_]*\]$/.test(outputType)) return `return []`;
  return `throw CancellationError()`;
}

function generateEvaluationSupport(evaluation: IREvaluationConfig): string {
  const lines: string[] = [];
  lines.push(`enum ${evaluation.suite} {`);
  lines.push(`    // Evaluations framework proof contract.`);
  lines.push(
    `    static let scenarios: [String] = [${evaluation.scenarios.map(quotedSwiftString).join(", ")}]`
  );
  lines.push(
    `    static let criteria: [String] = [${evaluation.criteria.map(quotedSwiftString).join(", ")}]`
  );
  if (evaluation.fixtures?.length) {
    lines.push(
      `    // Evaluation fixtures: ${evaluation.fixtures.map(escapeSwiftString).join(", ")}`
    );
  }
  if (evaluation.metrics?.length) {
    lines.push(
      `    // Evaluation metrics: ${evaluation.metrics.map(escapeSwiftString).join(", ")}`
    );
  }
  lines.push(
    `    // AppIntentsTesting: pair these scenarios with Siri, Shortcuts, and Spotlight pathway tests.`
  );
  lines.push(`}`);
  return lines.join("\n");
}

function generateImagePlaygroundSupport(intent: IRIntent): string {
  const imagePlayground = intent.imagePlayground!;
  const lines: string[] = [];
  lines.push(`enum ${intent.name}ImagePlaygroundContract {`);
  lines.push(`    // Image Playground contract`);
  lines.push(
    `    static let conceptParameter = "${escapeSwiftString(imagePlayground.conceptParam)}"`
  );
  if (imagePlayground.sourceImageParam) {
    lines.push(
      `    static let sourceImageParameter = "${escapeSwiftString(imagePlayground.sourceImageParam)}"`
    );
  }
  if (imagePlayground.style) {
    lines.push(`    static let style = "${escapeSwiftString(imagePlayground.style)}"`);
  }
  if (imagePlayground.dimensions) {
    lines.push(
      `    static let dimensions = "${escapeSwiftString(imagePlayground.dimensions)}"`
    );
  }
  if (imagePlayground.mode) {
    lines.push(`    static let mode = "${escapeSwiftString(imagePlayground.mode)}"`);
  }
  if (imagePlayground.privateCloudCompute !== undefined) {
    lines.push(
      `    static let privateCloudComputeEligible = ${imagePlayground.privateCloudCompute}`
    );
    lines.push(
      `    // Private Cloud Compute proof must include generated-image artifacts and privacy eligibility notes.`
    );
  }
  lines.push(`}`);
  return lines.join("\n");
}

function generatePreviewProofSupport(previewProof: IRPreviewProofConfig): string {
  const lines: string[] = [];
  lines.push(`// Preview Snapshot proof matrix for ${previewProof.view}.`);
  lines.push(
    `// Variants: ${previewProof.variants.length ? previewProof.variants.map(escapeSwiftString).join(", ") : "default"}`
  );
  if (previewProof.widgetTimeline) {
    lines.push(
      `// Widget timeline states must be rendered in Xcode Preview Snapshot proof.`
    );
  }
  if (previewProof.liveActivityStates?.length) {
    lines.push(
      `// Live Activity states: ${previewProof.liveActivityStates.map(escapeSwiftString).join(", ")}`
    );
  }
  lines.push(
    `// AppIntentsTesting and preview evidence should be attached before release.`
  );
  return lines.join("\n");
}

function generateTestHarnessSupport(intent: IRIntent): string {
  const className = swiftIdentifier(
    intent.testHarness?.className || `${intent.name}IntentTests`
  );
  const lines: string[] = [];

  // canImport guards keep the harness inert in app targets, so the file can
  // live in either target without an #if TESTING build setting.
  lines.push(`#if canImport(XCTest) && canImport(AppIntentsTesting)`);
  lines.push(`import XCTest`);
  lines.push(`import AppIntentsTesting`);
  lines.push(``);
  lines.push(`@available(iOS 26.0, macOS 26.0, *)`);
  lines.push(`final class ${className}: XCTestCase {`);
  lines.push(`    func testPerformSucceeds() async throws {`);
  lines.push(`        let intent = ${intent.name}Intent()`);
  for (const param of intent.parameters) {
    if (param.isOptional) continue;
    const sample = sampleSwiftValue(param.type);
    if (sample) {
      lines.push(`        intent.${param.name} = ${sample}`);
    } else {
      lines.push(`        // Set ${param.name} before running the harness.`);
    }
  }
  lines.push(``);
  lines.push(`        _ = try await intent.perform()`);
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(`#endif`);
  return lines.join("\n");
}

function sampleSwiftValue(type: IRType): string | undefined {
  switch (type.kind) {
    case "primitive":
      switch (type.value) {
        case "string":
          return `"Sample"`;
        case "int":
          return "1";
        case "double":
        case "float":
          return "1.0";
        case "boolean":
          return "true";
        case "date":
          return "Date()";
        case "duration":
          return "Measurement(value: 60, unit: UnitDuration.seconds)";
        case "url":
          return `URL(string: "https://example.com")!`;
      }
      return undefined;
    case "array":
      return "[]";
    case "dynamicOptions":
      return sampleSwiftValue(type.valueType);
    case "optional":
    case "entity":
    case "entityQuery":
    case "enum":
      return undefined;
  }
}

// ─── Info.plist Fragment Generator ───────────────────────────────────

/**
 * Generate an Info.plist XML fragment from the intent's declared keys.
 * Returns `undefined` if the intent declares no Info.plist keys.
 *
 * The fragment is a bare `<dict>`-less sequence of `<key>…</key>` /
 * `<string>…</string>` pairs, ready to be merged into an existing
 * Info.plist. A commented header identifies the source intent so users
 * can audit provenance.
 */
export function generateInfoPlistFragment(intent: IRIntent): string | undefined {
  const keys = intent.infoPlistKeys;
  if (!keys || Object.keys(keys).length === 0) return undefined;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<!-- Info.plist fragment generated by Axint for ${intent.name}Intent -->`);
  lines.push(`<!-- Merge these keys into your app's Info.plist. -->`);
  lines.push(`<plist version="1.0">`);
  lines.push(`<dict>`);
  for (const [key, desc] of Object.entries(keys)) {
    lines.push(`    <key>${escapeXml(key)}</key>`);
    lines.push(`    <string>${escapeXml(desc)}</string>`);
  }
  lines.push(`</dict>`);
  lines.push(`</plist>`);
  lines.push(``);

  return lines.join("\n");
}

// ─── Entitlements Fragment Generator ─────────────────────────────────

/**
 * Generate a `.entitlements` XML fragment from the intent's declared
 * entitlements. Returns `undefined` if the intent declares none.
 *
 * Axint only knows the entitlement identifiers, so all entries are
 * emitted as `<true/>` boolean entitlements. If an entitlement requires
 * a typed value (string, array), users must edit the fragment after
 * generation — a TODO comment is emitted to flag this.
 */
export function generateEntitlementsFragment(intent: IRIntent): string | undefined {
  const ents = intent.entitlements;
  if (!ents || ents.length === 0) return undefined;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<!-- Entitlements fragment generated by Axint for ${intent.name}Intent -->`
  );
  lines.push(`<!-- Merge these into your target's .entitlements file. -->`);
  lines.push(`<!-- Note: entitlements requiring typed values (string/array) -->`);
  lines.push(`<!-- need manual adjustment — defaults below are boolean true. -->`);
  lines.push(
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`
  );
  lines.push(`<plist version="1.0">`);
  lines.push(`<dict>`);
  for (const ent of ents) {
    lines.push(`    <key>${escapeXml(ent)}</key>`);
    lines.push(`    <true/>`);
  }
  lines.push(`</dict>`);
  lines.push(`</plist>`);
  lines.push(``);

  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────

const APP_INTENT_MEMBER_NAMES = new Set([
  "title",
  "description",
  "parameterSummary",
  "perform",
  "isDiscoverable",
  "openAppWhenRun",
  "authenticationPolicy",
  "supportedModes",
  "allowedExecutionTargets",
]);

function intentUsesCoreTransferable(intent: IRIntent): boolean {
  return (intent.entities ?? []).some((entity) => !!entity.intentValueRepresentation);
}

function intentConformances(intent: IRIntent): string[] {
  const conformances = ["AppIntent"];
  for (const conformance of intent.conformsTo ?? []) {
    if (!conformances.includes(conformance)) conformances.push(conformance);
  }
  return conformances;
}

function entityConformances(entity: IREntity): string[] {
  const conformances = ["AppEntity"];
  if (entity.syncable) conformances.push("SyncableEntity");
  if (entity.indexed) conformances.push("IndexedEntity");
  if (entity.ownership) conformances.push("OwnershipProvidingEntity");
  return conformances;
}

function makeIntentParametersSwiftSafe(intent: IRIntent): IRIntent {
  const renames = new Map<string, string>();
  const used = new Set<string>();
  const parameters = intent.parameters.map((param) => {
    let name = param.name;
    if (APP_INTENT_MEMBER_NAMES.has(name)) {
      name = safeIntentParameterName(name, used);
      renames.set(param.name, name);
    }
    used.add(name);
    return name === param.name ? param : { ...param, name };
  });

  if (renames.size === 0) return intent;

  return {
    ...intent,
    parameters,
    parameterSummary: intent.parameterSummary
      ? renameParameterSummary(intent.parameterSummary, renames)
      : undefined,
  };
}

function safeIntentParameterName(name: string, used: Set<string>): string {
  const preferred =
    name === "title"
      ? "intentTitle"
      : name === "description"
        ? "intentDescription"
        : `${name}Value`;
  if (!used.has(preferred)) return preferred;

  let index = 2;
  while (used.has(`${preferred}${index}`)) index += 1;
  return `${preferred}${index}`;
}

function renameParameterSummary(
  summary: IRParameterSummary,
  renames: Map<string, string>
): IRParameterSummary {
  if (summary.kind === "summary") {
    return {
      ...summary,
      template: rewriteSummaryTemplate(summary.template, renames),
    };
  }
  if (summary.kind === "when") {
    return {
      ...summary,
      parameter: renames.get(summary.parameter) ?? summary.parameter,
      then: renameParameterSummary(summary.then, renames),
      otherwise: summary.otherwise
        ? renameParameterSummary(summary.otherwise, renames)
        : undefined,
    };
  }
  return {
    ...summary,
    parameter: renames.get(summary.parameter) ?? summary.parameter,
    cases: summary.cases.map((item) => ({
      ...item,
      summary: renameParameterSummary(item.summary, renames),
    })),
    default: summary.default
      ? renameParameterSummary(summary.default, renames)
      : undefined,
  };
}

function rewriteSummaryTemplate(template: string, renames: Map<string, string>): string {
  return template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => {
    return `\${${renames.get(name) ?? name}}`;
  });
}

function generateParameter(param: IRParameter): string {
  const swiftType = irTypeToSwift(param.type);
  const lines: string[] = [];

  // Build @Parameter decorator
  const attrs: string[] = [];
  attrs.push(`title: "${escapeSwiftString(param.title)}"`);
  if (param.description) {
    attrs.push(`description: "${escapeSwiftString(param.description)}"`);
  }
  const dynamicOptions = dynamicOptionsConfig(param.type);
  if (dynamicOptions) {
    attrs.push(`optionsProvider: ${dynamicOptions.providerName}()`);
  }

  const decorator = `    @Parameter(${attrs.join(", ")})`;
  lines.push(decorator);

  // Property declaration
  if (param.defaultValue !== undefined) {
    const defaultStr = formatSwiftDefault(param.defaultValue, param.type);
    lines.push(`    var ${param.name}: ${swiftType} = ${defaultStr}`);
  } else {
    lines.push(`    var ${param.name}: ${swiftType}`);
  }

  lines.push(``);

  return lines.join("\n");
}

/**
 * Choose the Swift return-type signature for the generated perform().
 * We map the inferred IR return type to an App Intents `IntentResult`
 * shape. For primitive return types we use `some ReturnsValue<T>`;
 * for custom result types we use the custom type; otherwise we fall
 * back to `some IntentResult`.
 */
function generateReturnSignature(type: IRType, customResultType?: string): string {
  if (customResultType) {
    return customResultType;
  }
  if (type.kind === "primitive") {
    const swift = irTypeToSwift(type);
    return `some IntentResult & ReturnsValue<${swift}>`;
  }
  if (type.kind === "optional" && type.innerType.kind === "primitive") {
    const swift = irTypeToSwift(type.innerType);
    return `some IntentResult & ReturnsValue<${swift}>`;
  }
  return `some IntentResult`;
}

/**
 * Emit the `return .result(...)` line that matches the return signature
 * produced by `generateReturnSignature`. When the return type is a
 * primitive we return a well-typed default placeholder the user can
 * replace; otherwise we emit a plain `.result()`.
 */
function generatePerformReturn(type: IRType, customResultType?: string): string {
  const indent = "        ";
  if (customResultType) {
    return `${indent}return .result(value: ${customResultType}()) // replace with your ${customResultType} instance`;
  }
  if (type.kind === "primitive") {
    return `${indent}return .result(value: ${defaultLiteralFor(type.value)})`;
  }
  if (type.kind === "optional" && type.innerType.kind === "primitive") {
    return `${indent}return .result(value: ${defaultLiteralFor(type.innerType.value)})`;
  }
  return `${indent}return .result()`;
}

function defaultLiteralFor(primitive: string): string {
  switch (primitive) {
    case "string":
      return `""`;
    case "int":
      return `0`;
    case "double":
      return `0.0`;
    case "float":
      return `Float(0)`;
    case "boolean":
      return `false`;
    case "date":
      return `Date()`;
    case "duration":
      return `Measurement<UnitDuration>(value: 0, unit: .seconds)`;
    case "url":
      return `URL(string: "about:blank")! // TODO: Replace with your URL`;
    default:
      return `""`;
  }
}

function formatSwiftDefault(value: unknown, type: IRType): string {
  const base =
    type.kind === "optional"
      ? type.innerType
      : type.kind === "dynamicOptions"
        ? type.valueType
        : type;

  if (base.kind === "array" && Array.isArray(value)) {
    return `[${value.map((element) => formatSwiftDefault(element, base.elementType)).join(", ")}]`;
  }

  // A bare string literal is not a URL in Swift — wrap it in the
  // failable initializer the way hand-written App Intents code would.
  if (base.kind === "primitive" && base.value === "url" && typeof value === "string") {
    return `URL(string: "${escapeSwiftString(value)}")!`;
  }

  if (typeof value === "string") return `"${escapeSwiftString(value)}"`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `0`; // Guard against NaN/Infinity
    return `${value}`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return `"${escapeSwiftString(String(value))}"`; // Safe fallback
}

function collectDynamicOptionsProviders(parameters: IRParameter[]) {
  const seen = new Set<string>();
  const providers: Array<{ providerName: string; valueType: IRType }> = [];
  for (const param of parameters) {
    const config = dynamicOptionsConfig(param.type);
    if (!config || seen.has(config.providerName)) continue;
    seen.add(config.providerName);
    providers.push(config);
  }
  return providers;
}

function dynamicOptionsConfig(
  type: IRType
): { providerName: string; valueType: IRType } | null {
  if (type.kind === "dynamicOptions") {
    return {
      providerName: type.providerName,
      valueType: type.valueType,
    };
  }
  if (type.kind === "optional") {
    return dynamicOptionsConfig(type.innerType);
  }
  return null;
}

function queryablePropertyType(type: IRType): IRType | null {
  if (type.kind === "primitive") return type;
  if (type.kind === "optional" && type.innerType.kind === "primitive") {
    return type.innerType;
  }
  return null;
}

function generateParameterSummary(summary: IRParameterSummary, indent: number): string[] {
  const pad = " ".repeat(indent);
  const childIndent = indent + 4;
  if (summary.kind === "summary") {
    return [`${pad}Summary("${renderParameterSummaryTemplate(summary.template)}")`];
  }

  if (summary.kind === "when") {
    const lines = [`${pad}When(\\.$${summary.parameter}, .hasAnyValue) {`];
    lines.push(...generateParameterSummary(summary.then, childIndent));
    if (summary.otherwise) {
      lines.push(`${pad}} otherwise: {`);
      lines.push(...generateParameterSummary(summary.otherwise, childIndent));
      lines.push(`${pad}}`);
    } else {
      lines.push(`${pad}}`);
    }
    return lines;
  }

  const lines = [`${pad}Switch(\\.$${summary.parameter}) {`];
  for (const item of summary.cases) {
    lines.push(`${pad}    Case(${formatParameterSummaryCaseValue(item.value)}) {`);
    lines.push(...generateParameterSummary(item.summary, childIndent + 4));
    lines.push(`${pad}    }`);
  }
  if (summary.default) {
    lines.push(`${pad}    DefaultCase {`);
    lines.push(...generateParameterSummary(summary.default, childIndent + 4));
    lines.push(`${pad}    }`);
  }
  lines.push(`${pad}}`);
  return lines;
}

function renderParameterSummaryTemplate(template: string): string {
  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let cursor = 0;
  let rendered = "";
  for (const match of template.matchAll(pattern)) {
    const [token, paramName] = match;
    const start = match.index ?? 0;
    rendered += escapeSwiftString(template.slice(cursor, start));
    rendered += `\\(\\.$${paramName})`;
    cursor = start + token.length;
  }
  rendered += escapeSwiftString(template.slice(cursor));
  return rendered;
}

function formatParameterSummaryCaseValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return `"${escapeSwiftString(value)}"`;
  }
  return String(value);
}
