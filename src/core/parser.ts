/**
 * Axint Parser
 *
 * Parses TypeScript intent definitions (using the defineIntent() API)
 * into the Axint Intermediate Representation (IR).
 *
 * Approach: Real TypeScript compiler API AST walker. We create a
 * SourceFile, find defineIntent() CallExpressions, and extract the
 * ObjectLiteralExpression properties using the actual TS AST.
 *
 * The previous v0.1.x parser used regex matching. That approach was
 * replaced in v0.2.0 to support enums, arrays, entities, and accurate
 * return-type inference.
 */

import ts from "typescript";
import type {
  IRIntent,
  IRParameter,
  IRType,
  IREntity,
  DisplayRepresentation,
  IRParameterSummary,
  IRAppSchemaDomain,
  IRIntentConformance,
  IREntityOwnership,
  IRFoundationModelConfig,
  IRFoundationModelProvider,
  IRFoundationModelTool,
  IRFoundationModelGenerable,
  IRFoundationModelModality,
  IRFoundationModelImageInput,
  IRFoundationModelCustomProvider,
  IRFoundationModelDynamicProfile,
  IREvaluationConfig,
  IRTestHarnessConfig,
  IRPreviewProofConfig,
  IRImagePlaygroundConfig,
} from "./types.js";
import { PARAM_TYPES, LEGACY_PARAM_ALIASES, isPrimitiveType } from "./types.js";
import {
  propertyMap,
  propertyKeyName,
  readStringLiteral,
  readBooleanLiteral,
  readStringArray,
  readStringRecord,
  evaluateLiteral,
  posOf,
  findCallExpression,
  findAllCallExpressions,
} from "./parser-utils.js";

const FOUNDATION_MODEL_PROVIDERS = new Set([
  "apple-on-device",
  "private-cloud-compute",
  "custom-language-model",
]);

function resolveEntityProperties(type: IRType, entities: IREntity[]): void {
  if (type.kind === "entity") {
    const match = entities.find((e) => e.name === type.entityName);
    if (match) {
      type.properties = match.properties;
    }
  } else if (type.kind === "optional") {
    resolveEntityProperties(type.innerType, entities);
  } else if (type.kind === "array") {
    resolveEntityProperties(type.elementType, entities);
  }
}

/**
 * Parse a TypeScript source file containing defineIntent() and/or
 * defineEntity() calls and return the IR representation.
 */
export function parseIntentSource(
  source: string,
  filePath: string = "<stdin>"
): IRIntent {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    ts.ScriptKind.TS
  );

  // Parse all entity definitions first, so they can be referenced by intents
  const entities = parseEntityDefinitions(sourceFile, filePath);

  const defineIntentCall = findCallExpression(sourceFile, "defineIntent");
  if (!defineIntentCall) {
    throw new ParserError(
      "AX001",
      `No defineIntent() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineIntent({ ... })` call."
    );
  }

  const arg = defineIntentCall.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX001",
      "defineIntent() must be called with an object literal",
      filePath,
      posOf(sourceFile, defineIntentCall),
      "Pass an object: defineIntent({ name, title, description, params, perform })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  const title = readStringLiteral(props.get("title"));
  const description = readStringLiteral(props.get("description"));
  const domain = readStringLiteral(props.get("domain"));
  const schemaDomain = readStringLiteral(props.get("schemaDomain"));
  const schema = readStringLiteral(props.get("schema"));
  const category = readStringLiteral(props.get("category"));
  const isDiscoverable = readBooleanLiteral(props.get("isDiscoverable"));
  const parameterSummary = props.get("parameterSummary")
    ? parseParameterSummaryDefinition(
        props.get("parameterSummary")!,
        filePath,
        sourceFile
      )
    : undefined;

  if (!name) {
    throw new ParserError(
      "AX002",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "MyIntent"'
    );
  }
  if (!title) {
    throw new ParserError(
      "AX003",
      "Missing required field: title",
      filePath,
      posOf(sourceFile, arg),
      'Add a title field: title: "My Intent Title"'
    );
  }
  if (!description) {
    throw new ParserError(
      "AX004",
      "Missing required field: description",
      filePath,
      posOf(sourceFile, arg),
      'Add a description field: description: "What this intent does"'
    );
  }

  const paramsNode = props.get("params");
  const parameters: IRParameter[] = paramsNode
    ? extractParameters(paramsNode, filePath, sourceFile)
    : [];

  // Resolve entity references — link param.entity("X") properties from parsed entities
  for (const param of parameters) {
    resolveEntityProperties(param.type, entities);
  }

  // Return-type inference from the perform() function signature.
  const performNode = props.get("perform");
  const returnType = inferReturnType(performNode);

  // Entitlements (optional array of strings)
  const entitlementsNode = props.get("entitlements");
  const entitlements = readStringArray(entitlementsNode);

  // Info.plist keys (optional object literal of { key: "description" })
  const infoPlistNode = props.get("infoPlistKeys");
  const infoPlistKeys = readStringRecord(infoPlistNode);

  // Intent donation (optional boolean)
  const donateOnPerformNode = props.get("donateOnPerform");
  const donateOnPerform = readBooleanLiteral(donateOnPerformNode);

  // Custom result type (optional string)
  const customResultTypeNode = props.get("customResultType");
  const customResultType = readStringLiteral(customResultTypeNode);

  const conformsTo = readStringArray(props.get("conformsTo"));
  const supportedModes = readStringLiteral(props.get("supportedModes"));
  const allowedExecutionTargets = readStringLiteral(props.get("allowedExecutionTargets"));
  const model = parseFoundationModelConfig(props.get("model"), filePath, sourceFile);
  const evaluation = parseEvaluationConfig(props.get("evaluation"), filePath, sourceFile);
  const testHarness = parseTestHarnessConfig(
    props.get("testHarness"),
    filePath,
    sourceFile
  );
  const previewProof = parsePreviewProofConfig(
    props.get("previewProof"),
    filePath,
    sourceFile
  );
  const imagePlayground = parseImagePlaygroundConfig(
    props.get("imagePlayground"),
    filePath,
    sourceFile
  );

  return {
    name,
    title,
    description,
    domain: domain || undefined,
    schemaDomain: (schemaDomain as IRAppSchemaDomain | null) || undefined,
    schema: schema || undefined,
    category: category || undefined,
    parameters,
    returnType,
    sourceFile: filePath,
    entitlements: entitlements.length > 0 ? entitlements : undefined,
    infoPlistKeys: Object.keys(infoPlistKeys).length > 0 ? infoPlistKeys : undefined,
    isDiscoverable: isDiscoverable ?? undefined,
    parameterSummary,
    entities: entities.length > 0 ? entities : undefined,
    donateOnPerform: donateOnPerform ?? undefined,
    customResultType: customResultType ?? undefined,
    conformsTo: conformsTo.length > 0 ? (conformsTo as IRIntentConformance[]) : undefined,
    supportedModes: supportedModes || undefined,
    allowedExecutionTargets: allowedExecutionTargets || undefined,
    model,
    evaluation,
    testHarness,
    previewProof,
    imagePlayground,
  };
}

/**
 * Parse a TypeScript source file containing one or more standalone
 * defineEntity() calls. This supports entity-only files used by agents
 * before they wire the entity into an intent.
 */
export function parseEntitySource(
  source: string,
  filePath: string = "<stdin>"
): IREntity[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const entities = parseEntityDefinitions(sourceFile, filePath);
  if (entities.length === 0) {
    throw new ParserError(
      "AX001",
      `No defineEntity() call found in ${filePath}`,
      filePath,
      undefined,
      "Add a top-level `defineEntity({ name, display, properties, query })` call, or compile an intent file that references the entity."
    );
  }
  return entities;
}

function parseEntityDefinitions(sourceFile: ts.SourceFile, filePath: string): IREntity[] {
  return findAllCallExpressions(sourceFile, "defineEntity").map((call) =>
    parseEntityDefinition(call, filePath, sourceFile)
  );
}

// ─── Entity Definition Parsing (kept from AST Walkers section) ───────────────────────────────────────

// ─── Entity Definition Parsing ───────────────────────────────────────

/**
 * Parse a defineEntity() call into an IREntity.
 */
function parseEntityDefinition(
  call: ts.CallExpression,
  filePath: string,
  sourceFile: ts.SourceFile
): IREntity {
  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX015",
      "defineEntity() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineEntity({ name, display, properties, query })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX016",
      "Entity definition missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "Task"'
    );
  }

  const displayNode = props.get("display");
  if (!displayNode || !ts.isObjectLiteralExpression(displayNode)) {
    throw new ParserError(
      "AX017",
      "Entity definition missing required field: display",
      filePath,
      posOf(sourceFile, arg),
      'Add display field: display: { title: "name", subtitle: "status" }'
    );
  }

  const displayProps = propertyMap(displayNode);
  const displayRepresentation: DisplayRepresentation = {
    title: readStringLiteral(displayProps.get("title")) || "name",
    subtitle: readStringLiteral(displayProps.get("subtitle")) || undefined,
    image: readStringLiteral(displayProps.get("image")) || undefined,
  };

  const propertiesNode = props.get("properties");
  const properties = propertiesNode
    ? extractParameters(propertiesNode, filePath, sourceFile)
    : [];

  const queryTypeNode = props.get("query");
  const queryTypeStr = readStringLiteral(queryTypeNode);
  const queryType = validateQueryType(queryTypeStr, filePath, sourceFile, queryTypeNode);
  const schema = readStringLiteral(props.get("schema"));
  const schemaDomain = readStringLiteral(props.get("schemaDomain"));
  const syncable = readBooleanLiteral(props.get("syncable"));
  const indexed = readBooleanLiteral(props.get("indexed"));
  const indexedQuery = readBooleanLiteral(props.get("indexedQuery"));
  const ownership = readStringLiteral(props.get("ownership"));
  const intentValueRepresentation = readStringLiteral(
    props.get("intentValueRepresentation")
  );
  const semanticIndex = parseSemanticIndexConfig(
    props.get("semanticIndex"),
    filePath,
    sourceFile
  );

  return {
    name,
    displayRepresentation,
    properties,
    queryType,
    schema: schema || undefined,
    schemaDomain: (schemaDomain as IRAppSchemaDomain | null) || undefined,
    syncable: syncable ?? undefined,
    indexed: indexed ?? undefined,
    indexedQuery: indexedQuery ?? undefined,
    ownership: (ownership as IREntityOwnership | null) || undefined,
    intentValueRepresentation: intentValueRepresentation || undefined,
    semanticIndex,
  };
}

/**
 * Validate and normalize query type string.
 */
function validateQueryType(
  value: string | null,
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node | undefined
): "all" | "id" | "string" | "property" {
  if (!value) {
    throw new ParserError(
      "AX018",
      "Entity definition missing required field: query",
      filePath,
      node ? posOf(sourceFile, node) : undefined,
      'Add query field: query: "string" (or "all", "id", "property")'
    );
  }
  const valid: Record<string, "all" | "id" | "string" | "property"> = {
    all: "all",
    id: "id",
    string: "string",
    property: "property",
  };
  const narrowed = valid[value];
  if (!narrowed) {
    throw new ParserError(
      "AX019",
      `Invalid query type: "${value}". Must be one of: all, id, string, property`,
      filePath,
      node ? posOf(sourceFile, node) : undefined
    );
  }
  return narrowed;
}

function parseParameterSummaryDefinition(
  node: ts.Node,
  filePath: string,
  sourceFile: ts.SourceFile
): IRParameterSummary {
  const inlineSummary = readStringLiteral(node);
  if (inlineSummary !== null) {
    return {
      kind: "summary",
      template: inlineSummary,
    };
  }

  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX024",
      "parameterSummary must be a string or object literal",
      filePath,
      posOf(sourceFile, node),
      'Use a template string like "Open ${book}" or an object with when/switch blocks.'
    );
  }

  const props = propertyMap(node);
  const whenParam = readStringLiteral(props.get("when"));
  if (whenParam) {
    const thenNode = props.get("then");
    if (!thenNode) {
      throw new ParserError(
        "AX025",
        "parameterSummary.when requires a then branch",
        filePath,
        posOf(sourceFile, node)
      );
    }

    return {
      kind: "when",
      parameter: whenParam,
      then: parseParameterSummaryDefinition(thenNode, filePath, sourceFile),
      otherwise: props.get("otherwise")
        ? parseParameterSummaryDefinition(props.get("otherwise")!, filePath, sourceFile)
        : undefined,
    };
  }

  const switchParam = readStringLiteral(props.get("switch"));
  if (switchParam) {
    const casesNode = props.get("cases");
    if (!casesNode || !ts.isArrayLiteralExpression(casesNode)) {
      throw new ParserError(
        "AX026",
        "parameterSummary.switch requires a cases array",
        filePath,
        posOf(sourceFile, node)
      );
    }

    const cases = casesNode.elements.map((element) => {
      if (!ts.isObjectLiteralExpression(element)) {
        throw new ParserError(
          "AX027",
          "parameterSummary.cases entries must be object literals",
          filePath,
          posOf(sourceFile, element)
        );
      }
      const caseProps = propertyMap(element);
      const valueNode = caseProps.get("value");
      const summaryNode = caseProps.get("summary");
      if (!valueNode || !summaryNode) {
        throw new ParserError(
          "AX028",
          "parameterSummary switch cases require value and summary",
          filePath,
          posOf(sourceFile, element)
        );
      }

      const value = evaluateLiteral(valueNode);
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new ParserError(
          "AX029",
          "parameterSummary switch case values must be string, number, or boolean literals",
          filePath,
          posOf(sourceFile, valueNode)
        );
      }

      return {
        value,
        summary: parseParameterSummaryDefinition(summaryNode, filePath, sourceFile),
      };
    });

    return {
      kind: "switch",
      parameter: switchParam,
      cases,
      default: props.get("default")
        ? parseParameterSummaryDefinition(props.get("default")!, filePath, sourceFile)
        : undefined,
    };
  }

  throw new ParserError(
    "AX030",
    "parameterSummary object must use either when/then or switch/cases",
    filePath,
    posOf(sourceFile, node)
  );
}

function parseFoundationModelConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelConfig | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX031",
      "model must be an object literal",
      filePath,
      posOf(sourceFile, node),
      'Use model: { provider: "apple-on-device", instructions: "..." }.'
    );
  }

  const props = propertyMap(node);
  const provider = readStringLiteral(props.get("provider"));
  if (!provider) {
    throw new ParserError(
      "AX032",
      "model.provider is required",
      filePath,
      posOf(sourceFile, node),
      'Add provider: "apple-on-device", "private-cloud-compute", or "custom-language-model".'
    );
  }
  if (!FOUNDATION_MODEL_PROVIDERS.has(provider)) {
    throw new ParserError(
      "AX042",
      `Invalid model.provider: "${provider}"`,
      filePath,
      posOf(sourceFile, props.get("provider") ?? node),
      'Use provider: "apple-on-device", "private-cloud-compute", or "custom-language-model".'
    );
  }

  return {
    sessionName: readStringLiteral(props.get("sessionName")) || undefined,
    provider: provider as IRFoundationModelProvider,
    useCase: readStringLiteral(props.get("useCase")) || undefined,
    instructions: readStringLiteral(props.get("instructions")) || undefined,
    prompt: readStringLiteral(props.get("prompt")) || undefined,
    promptVersion: readStringLiteral(props.get("promptVersion")) || undefined,
    dynamicProfile: readStringLiteral(props.get("dynamicProfile")) || undefined,
    dynamicProfiles: parseFoundationModelDynamicProfiles(
      props.get("dynamicProfiles"),
      filePath,
      sourceFile
    ),
    guardrails: readStringArray(props.get("guardrails")),
    modalities: parseFoundationModelModalities(
      props.get("modalities"),
      filePath,
      sourceFile
    ),
    imageInputs: parseFoundationModelImageInputs(
      props.get("imageInputs"),
      filePath,
      sourceFile
    ),
    customProvider: parseFoundationModelCustomProvider(
      props.get("customProvider"),
      filePath,
      sourceFile
    ),
    generable: parseFoundationModelGenerable(
      props.get("generable"),
      filePath,
      sourceFile
    ),
    tools: parseFoundationModelTools(props.get("tools"), filePath, sourceFile),
  };
}

function parseFoundationModelGenerable(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelGenerable | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX033",
      "model.generable must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX034",
      "model.generable.name is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    name,
    fields: readStringRecord(props.get("fields")),
  };
}

function parseFoundationModelTools(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelTool[] {
  if (!node) return [];
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX035",
      "model.tools must be an array",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return node.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX036",
        "model.tools entries must be object literals",
        filePath,
        posOf(sourceFile, element)
      );
    }
    const props = propertyMap(element);
    const name = readStringLiteral(props.get("name"));
    const description = readStringLiteral(props.get("description"));
    if (!name || !description) {
      throw new ParserError(
        "AX037",
        "model.tools entries require name and description",
        filePath,
        posOf(sourceFile, element)
      );
    }
    return {
      name,
      description,
      kind:
        (readStringLiteral(props.get("kind")) as IRFoundationModelTool["kind"] | null) ||
        undefined,
      argumentsType: readStringLiteral(props.get("argumentsType")) || undefined,
      outputType: readStringLiteral(props.get("outputType")) || undefined,
    };
  });
}

function parseFoundationModelModalities(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelModality[] | undefined {
  if (!node) return undefined;
  const values = readStringArray(node);
  const allowed = new Set(["text", "image", "audio", "video"]);
  for (const value of values) {
    if (!allowed.has(value)) {
      throw new ParserError(
        "AX043",
        `Invalid model modality: "${value}"`,
        filePath,
        posOf(sourceFile, node),
        'Use modalities like ["text", "image"].'
      );
    }
  }
  return values as IRFoundationModelModality[];
}

function parseFoundationModelImageInputs(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelImageInput[] | undefined {
  if (!node) return undefined;
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX044",
      "model.imageInputs must be an array",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return node.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX045",
        "model.imageInputs entries must be object literals",
        filePath,
        posOf(sourceFile, element)
      );
    }
    const props = propertyMap(element);
    const name = readStringLiteral(props.get("name"));
    const source = readStringLiteral(props.get("source"));
    if (!name || !source) {
      throw new ParserError(
        "AX046",
        "model.imageInputs entries require name and source",
        filePath,
        posOf(sourceFile, element)
      );
    }
    return {
      name,
      source: source as IRFoundationModelImageInput["source"],
      required: readBooleanLiteral(props.get("required")) ?? undefined,
    };
  });
}

function parseFoundationModelCustomProvider(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelCustomProvider | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX047",
      "model.customProvider must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const typeName = readStringLiteral(props.get("typeName"));
  if (!typeName) {
    throw new ParserError(
      "AX048",
      "model.customProvider.typeName is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    packageName: readStringLiteral(props.get("packageName")) || undefined,
    typeName,
    configuration: readStringLiteral(props.get("configuration")) || undefined,
  };
}

function parseFoundationModelDynamicProfiles(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRFoundationModelDynamicProfile[] | undefined {
  if (!node) return undefined;
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX049",
      "model.dynamicProfiles must be an array",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return node.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX050",
        "model.dynamicProfiles entries must be object literals",
        filePath,
        posOf(sourceFile, element)
      );
    }
    const props = propertyMap(element);
    const name = readStringLiteral(props.get("name"));
    if (!name) {
      throw new ParserError(
        "AX051",
        "model.dynamicProfiles entries require name",
        filePath,
        posOf(sourceFile, element)
      );
    }
    return {
      name,
      provider:
        (readStringLiteral(props.get("provider")) as IRFoundationModelProvider | null) ||
        undefined,
      instructions: readStringLiteral(props.get("instructions")) || undefined,
      tools: readStringArray(props.get("tools")),
    };
  });
}

function parseEvaluationConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IREvaluationConfig | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX038",
      "evaluation must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const suite = readStringLiteral(props.get("suite"));
  if (!suite) {
    throw new ParserError(
      "AX039",
      "evaluation.suite is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    suite,
    scenarios: readStringArray(props.get("scenarios")),
    criteria: readStringArray(props.get("criteria")),
    fixtures: readStringArray(props.get("fixtures")),
    metrics: readStringArray(props.get("metrics")),
  };
}

function parseTestHarnessConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRTestHarnessConfig | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX056",
      "testHarness must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  return {
    className: readStringLiteral(props.get("className")) || undefined,
  };
}

function parsePreviewProofConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRPreviewProofConfig | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX040",
      "previewProof must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const view = readStringLiteral(props.get("view"));
  if (!view) {
    throw new ParserError(
      "AX041",
      "previewProof.view is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    view,
    variants: readStringArray(props.get("variants")),
    widgetTimeline: readBooleanLiteral(props.get("widgetTimeline")),
    liveActivityStates: readStringArray(props.get("liveActivityStates")),
  };
}

function parseImagePlaygroundConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRImagePlaygroundConfig | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX052",
      "imagePlayground must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const conceptParam = readStringLiteral(props.get("conceptParam"));
  if (!conceptParam) {
    throw new ParserError(
      "AX053",
      "imagePlayground.conceptParam is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    conceptParam,
    sourceImageParam: readStringLiteral(props.get("sourceImageParam")) || undefined,
    style: readStringLiteral(props.get("style")) || undefined,
    dimensions:
      (readStringLiteral(props.get("dimensions")) as
        | IRImagePlaygroundConfig["dimensions"]
        | null) || undefined,
    mode:
      (readStringLiteral(props.get("mode")) as IRImagePlaygroundConfig["mode"] | null) ||
      undefined,
    privateCloudCompute:
      readBooleanLiteral(props.get("privateCloudCompute")) ?? undefined,
  };
}

function parseSemanticIndexConfig(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IREntity["semanticIndex"] | undefined {
  if (!node) return undefined;
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX054",
      "semanticIndex must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }
  const props = propertyMap(node);
  const contentType = readStringLiteral(props.get("contentType"));
  if (!contentType) {
    throw new ParserError(
      "AX055",
      "semanticIndex.contentType is required",
      filePath,
      posOf(sourceFile, node)
    );
  }
  return {
    contentType,
    searchableByLLM: readBooleanLiteral(props.get("searchableByLLM")) ?? undefined,
    attribution: readStringLiteral(props.get("attribution")) || undefined,
    attributes: readStringArray(props.get("attributes")),
  };
}

// ─── Parameter Extraction ────────────────────────────────────────────

function extractParameters(
  node: ts.Node,
  filePath: string,
  sourceFile: ts.SourceFile
): IRParameter[] {
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX006",
      "`params` must be an object literal",
      filePath,
      posOf(sourceFile, node),
      "Use params: { name: param.string(...), ... }"
    );
  }

  const params: IRParameter[] = [];
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const paramName = propertyKeyName(prop.name);
    if (!paramName) continue;

    const { typeName, description, configObject, callExpr } = extractParamCall(
      prop.initializer,
      filePath,
      sourceFile
    );

    const resolvedType = resolveParamType(typeName, filePath, sourceFile, prop, callExpr);

    const isOptional = configObject
      ? readBooleanLiteral(configObject.get("required")) === false
      : false;

    const defaultExpr = configObject?.get("default");
    const defaultValue = defaultExpr ? evaluateLiteral(defaultExpr) : undefined;

    const titleFromConfig = configObject
      ? readStringLiteral(configObject.get("title"))
      : null;

    const irType: IRType = isOptional
      ? {
          kind: "optional",
          innerType: resolvedType,
        }
      : resolvedType;

    params.push({
      name: paramName,
      type: irType,
      title: titleFromConfig || prettyTitle(paramName),
      description,
      isOptional,
      defaultValue,
    });
  }

  return params;
}

interface ParamCallInfo {
  typeName: string;
  description: string;
  configObject: Map<string, ts.Node> | null;
  callExpr: ts.CallExpression;
}

/**
 * Extract param type, description, and config from a param.* call.
 * For param.entity() and param.dynamicOptions(), the structure is different.
 */
function extractParamCall(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): ParamCallInfo {
  if (!ts.isCallExpression(expr)) {
    throw new ParserError(
      "AX007",
      "Parameter value must be a call to a param.* helper",
      filePath,
      posOf(sourceFile, expr),
      "Use param.string(...), param.int(...), param.date(...), etc."
    );
  }

  // Expect: param.<type>(description?, config?)
  if (
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "param"
  ) {
    throw new ParserError(
      "AX007",
      "Parameter value must be a call to a param.* helper",
      filePath,
      posOf(sourceFile, expr),
      "Use param.string(...), param.int(...), param.date(...), etc."
    );
  }

  const typeName = expr.expression.name.text;

  // For entity, entityCollection, array, and dynamicOptions, the structure differs:
  // - param.entity("EntityName", "description", config?)
  // - param.entityCollection("EntityName", "description", config?)
  // - param.array(param.string(...), "description", config?)
  // - param.dynamicOptions("Provider", param.string(...))
  let descriptionArg: ts.Expression | undefined;
  let configArg: ts.Expression | undefined;

  if (
    (typeName === "entity" || typeName === "entityCollection") &&
    expr.arguments.length >= 2
  ) {
    descriptionArg = expr.arguments[1];
    configArg = expr.arguments[2];
  } else if (typeName === "array" && expr.arguments.length >= 2) {
    descriptionArg = expr.arguments[1];
    configArg = expr.arguments[2];
  } else if (typeName === "dynamicOptions" && expr.arguments.length >= 2) {
    const innerArg = expr.arguments[1];
    if (
      ts.isCallExpression(innerArg) &&
      ts.isPropertyAccessExpression(innerArg.expression) &&
      ts.isIdentifier(innerArg.expression.expression) &&
      innerArg.expression.expression.text === "param"
    ) {
      descriptionArg = innerArg.arguments[0];
      configArg = innerArg.arguments[1];
    } else {
      descriptionArg = expr.arguments[2];
      configArg = expr.arguments[3];
    }
  } else {
    descriptionArg = expr.arguments[0];
    configArg = expr.arguments[1];
  }

  const description = descriptionArg ? readStringLiteral(descriptionArg) : null;
  if (description === null) {
    throw new ParserError(
      "AX008",
      `param.${typeName}() requires a string description`,
      filePath,
      posOf(sourceFile, expr),
      `Example: param.${typeName}("Human-readable description")`
    );
  }

  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg) ? propertyMap(configArg) : null;

  return { typeName, description, configObject, callExpr: expr };
}

/**
 * Resolve a param type name into an IRType.
 * Supports primitives, entity references, and dynamic options.
 */
function resolveParamType(
  typeName: string,
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  callExpr?: ts.CallExpression
): IRType {
  // Primitive types
  if (isPrimitiveType(typeName)) {
    return { kind: "primitive", value: typeName };
  }

  // Legacy aliases
  if (typeName in LEGACY_PARAM_ALIASES) {
    return {
      kind: "primitive",
      value: LEGACY_PARAM_ALIASES[typeName],
    };
  }

  // Entity types: param.entity("EntityName")
  if (typeName === "entity") {
    if (!callExpr || callExpr.arguments.length === 0) {
      throw new ParserError(
        "AX020",
        "param.entity() requires the entity name as the first argument",
        filePath,
        posOf(sourceFile, node),
        'Example: param.entity("Task", "Reference an entity")'
      );
    }
    const entityName = readStringLiteral(callExpr.arguments[0]);
    if (!entityName) {
      throw new ParserError(
        "AX021",
        "param.entity() requires a string entity name",
        filePath,
        posOf(sourceFile, node)
      );
    }
    return {
      kind: "entity",
      entityName,
      properties: [],
    };
  }

  // Entity collection types: param.entityCollection("EntityName")
  if (typeName === "entityCollection") {
    if (!callExpr || callExpr.arguments.length === 0) {
      throw new ParserError(
        "AX024",
        "param.entityCollection() requires the entity name as the first argument",
        filePath,
        posOf(sourceFile, node),
        'Example: param.entityCollection("Task", "Reference multiple entities")'
      );
    }
    const entityName = readStringLiteral(callExpr.arguments[0]);
    if (!entityName) {
      throw new ParserError(
        "AX025",
        "param.entityCollection() requires a string entity name",
        filePath,
        posOf(sourceFile, node)
      );
    }
    return {
      kind: "array",
      elementType: {
        kind: "entity",
        entityName,
        properties: [],
      },
    };
  }

  // Array types: param.array(param.string(...), "Description")
  if (typeName === "array") {
    if (!callExpr || callExpr.arguments.length === 0) {
      throw new ParserError(
        "AX026",
        "param.array() requires an inner param helper as the first argument",
        filePath,
        posOf(sourceFile, node),
        'Example: param.array(param.string("Tag"), "Tags")'
      );
    }
    const innerArg = callExpr.arguments[0];
    if (
      ts.isCallExpression(innerArg) &&
      ts.isPropertyAccessExpression(innerArg.expression) &&
      ts.isIdentifier(innerArg.expression.expression) &&
      innerArg.expression.expression.text === "param"
    ) {
      return {
        kind: "array",
        elementType: resolveParamType(
          innerArg.expression.name.text,
          filePath,
          sourceFile,
          innerArg,
          innerArg
        ),
      };
    }
    throw new ParserError(
      "AX027",
      "param.array() first argument must be a param.* helper",
      filePath,
      posOf(sourceFile, node),
      'Example: param.array(param.entity("Task", "Task"), "Tasks")'
    );
  }

  // Dynamic options: param.dynamicOptions("ProviderName", innerType)
  if (typeName === "dynamicOptions") {
    if (!callExpr || callExpr.arguments.length < 2) {
      throw new ParserError(
        "AX022",
        "param.dynamicOptions() requires (providerName, paramType)",
        filePath,
        posOf(sourceFile, node),
        'Example: param.dynamicOptions("PlaylistProvider", param.string(...))'
      );
    }
    const providerName = readStringLiteral(callExpr.arguments[0]);
    if (!providerName) {
      throw new ParserError(
        "AX023",
        "param.dynamicOptions() provider name must be a string",
        filePath,
        posOf(sourceFile, node)
      );
    }
    // Extract inner param type from the second argument (e.g. param.string(...))
    const innerArg = callExpr.arguments[1];
    let valueType: IRType;
    if (
      ts.isCallExpression(innerArg) &&
      ts.isPropertyAccessExpression(innerArg.expression) &&
      ts.isIdentifier(innerArg.expression.expression) &&
      innerArg.expression.expression.text === "param"
    ) {
      const innerTypeName = innerArg.expression.name.text;
      valueType = resolveParamType(
        innerTypeName,
        filePath,
        sourceFile,
        innerArg,
        innerArg
      );
    } else {
      // Fall back to string if the inner arg isn't a recognizable param call
      valueType = { kind: "primitive", value: "string" };
    }
    return {
      kind: "dynamicOptions",
      valueType,
      providerName,
    };
  }

  throw new ParserError(
    "AX005",
    `Unknown param type: param.${typeName}`,
    filePath,
    posOf(sourceFile, node),
    `Supported types: ${[...PARAM_TYPES].join(", ")}, entity, entityCollection, array, dynamicOptions`
  );
}

// ─── Return-Type Inference ───────────────────────────────────────────

function inferReturnType(performNode: ts.Node | undefined): IRType {
  // Default when we can't infer anything.
  const defaultType: IRType = { kind: "primitive", value: "string" };
  if (!performNode) return defaultType;

  // Handle method shorthand: perform() { ... }
  if (ts.isMethodDeclaration(performNode)) {
    return inferFromReturnStatements(performNode.body);
  }

  // Handle arrow function: perform: async () => { ... }
  if (ts.isArrowFunction(performNode)) {
    if (performNode.body && ts.isBlock(performNode.body)) {
      return inferFromReturnStatements(performNode.body);
    }
    // Single-expression arrow: perform: async (p) => "literal"
    // body is ConciseBody = Block | Expression — Block handled above
    return ts.isExpression(performNode.body)
      ? inferFromExpression(performNode.body)
      : defaultType;
  }

  // Handle function expression: perform: async function() { ... }
  if (ts.isFunctionExpression(performNode)) {
    return inferFromReturnStatements(performNode.body);
  }

  return defaultType;
}

function inferFromReturnStatements(block: ts.Block | undefined): IRType {
  const defaultType: IRType = { kind: "primitive", value: "string" };
  if (!block) return defaultType;

  let inferred: IRType | undefined;
  const visit = (n: ts.Node): void => {
    if (inferred) return;
    if (ts.isReturnStatement(n) && n.expression) {
      inferred = inferFromExpression(n.expression);
      return;
    }
    // Don't walk into nested functions — only the top-level perform() body.
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n)
    ) {
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(block);
  return inferred ?? defaultType;
}

function inferFromExpression(expr: ts.Expression): IRType {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return { kind: "primitive", value: "string" };
  }
  if (ts.isNumericLiteral(expr)) {
    return expr.text.includes(".")
      ? { kind: "primitive", value: "double" }
      : { kind: "primitive", value: "int" };
  }
  if (
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword
  ) {
    return { kind: "primitive", value: "boolean" };
  }
  // Handle array literals
  if (ts.isArrayLiteralExpression(expr) && expr.elements.length > 0) {
    const elementType = inferFromExpression(expr.elements[0]);
    return { kind: "array", elementType };
  }
  // Handle template literals
  if (ts.isTemplateExpression(expr)) {
    return { kind: "primitive", value: "string" };
  }
  return { kind: "primitive", value: "string" };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function prettyTitle(name: string): string {
  const spaced = name.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ─── Error Class ─────────────────────────────────────────────────────

export class ParserError extends Error {
  constructor(
    public code: string,
    message: string,
    public file: string,
    public line?: number,
    public suggestion?: string
  ) {
    super(message);
    this.name = "ParserError";
  }

  format(): string {
    let output = `\n  error[${this.code}]: ${this.message}\n`;
    if (this.file) output += `    --> ${this.file}`;
    if (this.line) output += `:${this.line}`;
    output += "\n";
    if (this.suggestion) {
      output += `    = help: ${this.suggestion}\n`;
    }
    return output;
  }
}
