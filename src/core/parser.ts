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
  IRPrimitiveType,
} from "./types.js";
import { PARAM_TYPES, LEGACY_PARAM_ALIASES } from "./types.js";

/**
 * Parse a TypeScript source file containing a defineIntent() call
 * and return the IR representation.
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

  const defineIntentCall = findDefineIntentCall(sourceFile);
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
  const category = readStringLiteral(props.get("category"));
  const isDiscoverable = readBooleanLiteral(props.get("isDiscoverable"));

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

  // Return-type inference from the perform() function signature.
  const performNode = props.get("perform");
  const returnType = inferReturnType(performNode);

  // Entitlements (optional array of strings)
  const entitlementsNode = props.get("entitlements");
  const entitlements = readStringArray(entitlementsNode);

  // Info.plist keys (optional object literal of { key: "description" })
  const infoPlistNode = props.get("infoPlistKeys");
  const infoPlistKeys = readStringRecord(infoPlistNode);

  return {
    name,
    title,
    description,
    domain: domain || undefined,
    category: category || undefined,
    parameters,
    returnType,
    sourceFile: filePath,
    entitlements: entitlements.length > 0 ? entitlements : undefined,
    infoPlistKeys:
      Object.keys(infoPlistKeys).length > 0 ? infoPlistKeys : undefined,
    isDiscoverable: isDiscoverable ?? undefined,
  };
}

// ─── AST Walkers ─────────────────────────────────────────────────────

function findDefineIntentCall(
  node: ts.Node
): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "defineIntent"
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function propertyMap(
  obj: ts.ObjectLiteralExpression
): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyKeyName(prop.name);
      if (key) map.set(key, prop.initializer);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      map.set(prop.name.text, prop.name);
    } else if (ts.isMethodDeclaration(prop)) {
      const key = propertyKeyName(prop.name);
      if (key) map.set(key, prop as unknown as ts.Expression);
    }
  }
  return map;
}

function propertyKeyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function readStringLiteral(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function readBooleanLiteral(
  node: ts.Expression | undefined
): boolean | undefined {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function readStringArray(node: ts.Expression | undefined): string[] {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  const out: string[] = [];
  for (const el of node.elements) {
    const s = readStringLiteral(el);
    if (s !== null) out.push(s);
  }
  return out;
}

function readStringRecord(
  node: ts.Expression | undefined
): Record<string, string> {
  if (!node || !ts.isObjectLiteralExpression(node)) return {};
  const rec: Record<string, string> = {};
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyKeyName(prop.name);
    const val = readStringLiteral(prop.initializer);
    if (key && val !== null) rec[key] = val;
  }
  return rec;
}

// ─── Parameter Extraction ────────────────────────────────────────────

function extractParameters(
  node: ts.Expression,
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

    const { typeName, description, configObject } = extractParamCall(
      prop.initializer,
      filePath,
      sourceFile
    );

    const resolvedType = resolveParamType(typeName, filePath, sourceFile, prop);

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
          innerType: { kind: "primitive", value: resolvedType },
        }
      : { kind: "primitive", value: resolvedType };

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
  configObject: Map<string, ts.Expression> | null;
}

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

  // Expect: param.<type>(description, config?)
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
  const descriptionArg = expr.arguments[0];
  const configArg = expr.arguments[1];

  const description = descriptionArg ? readStringLiteral(descriptionArg) : null;
  if (description === null) {
    throw new ParserError(
      "AX008",
      `param.${typeName}() requires a string description as the first argument`,
      filePath,
      posOf(sourceFile, expr),
      `Example: param.${typeName}("Human-readable description")`
    );
  }

  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg)
      ? propertyMap(configArg)
      : null;

  return { typeName, description, configObject };
}

function resolveParamType(
  typeName: string,
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node
): IRPrimitiveType {
  if (PARAM_TYPES.has(typeName as IRPrimitiveType)) {
    return typeName as IRPrimitiveType;
  }
  if (typeName in LEGACY_PARAM_ALIASES) {
    return LEGACY_PARAM_ALIASES[typeName];
  }
  throw new ParserError(
    "AX005",
    `Unknown param type: param.${typeName}`,
    filePath,
    posOf(sourceFile, node),
    `Supported types: ${[...PARAM_TYPES].join(", ")}`
  );
}

// ─── Literal Evaluation ──────────────────────────────────────────────

function evaluateLiteral(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return undefined;
}

// ─── Return-Type Inference ───────────────────────────────────────────

function inferReturnType(performNode: ts.Expression | undefined): IRType {
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
    return inferFromExpression(performNode.body as ts.Expression);
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
  // Default fallback
  return { kind: "primitive", value: "string" };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function prettyTitle(name: string): string {
  const spaced = name.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function posOf(
  sourceFile: ts.SourceFile,
  node: ts.Node
): number | undefined {
  try {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1;
  } catch {
    return undefined;
  }
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
