/**
 * Axint View Parser
 *
 * Parses TypeScript view definitions (using the defineView() API)
 * into the Axint IRView representation.
 *
 * Same approach as the intent parser: real TS compiler API AST walker.
 */

import ts from "typescript";
import type {
  IRView,
  IRViewProp,
  IRViewState,
  IRType,
  IRPrimitiveType,
  ViewBodyNode,
  ViewStateKind,
} from "./types.js";
import { PARAM_TYPES } from "./types.js";
import { ParserError } from "./parser.js";

/**
 * Parse a TypeScript source file containing a defineView() call
 * and return the IRView representation.
 */
export function parseViewSource(source: string, filePath: string = "<stdin>"): IRView {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findDefineViewCall(sourceFile);
  if (!call) {
    throw new ParserError(
      "AX301",
      `No defineView() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineView({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX301",
      "defineView() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineView({ name, body, ... })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX302",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "ProfileCard"'
    );
  }

  const viewProps = extractViewProps(props.get("props"), filePath, sourceFile);
  const viewState = extractViewState(props.get("state"), filePath, sourceFile);
  const body = extractViewBody(props.get("body"), filePath, sourceFile);

  return {
    name,
    props: viewProps,
    state: viewState,
    body,
    sourceFile: filePath,
  };
}

// ─── AST Walkers ────────────────────────────────────────────────────

function findDefineViewCall(node: ts.Node): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "defineView"
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// ─── Prop Extraction ────────────────────────────────────────────────

function extractViewProps(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRViewProp[] {
  if (!node) return [];
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX303",
      "`props` must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const result: IRViewProp[] = [];
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const propName = propertyKeyName(p.name);
    if (!propName) continue;

    const { typeName, configObject } = extractPropCall(
      p.initializer,
      filePath,
      sourceFile
    );
    const type = resolvePrimitiveType(typeName);
    const isOptional = configObject
      ? readBooleanLiteral(configObject.get("required")) === false
      : false;
    const defaultExpr = configObject?.get("default");
    const defaultValue = defaultExpr ? evaluateLiteral(defaultExpr) : undefined;
    const descExpr = configObject?.get("description");
    const description = descExpr ? readStringLiteral(descExpr) : undefined;

    result.push({
      name: propName,
      type: isOptional ? { kind: "optional", innerType: type } : type,
      isOptional,
      defaultValue,
      description: description ?? undefined,
    });
  }
  return result;
}

interface PropCallInfo {
  typeName: string;
  configObject: Map<string, ts.Expression> | null;
}

function extractPropCall(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): PropCallInfo {
  if (
    !ts.isCallExpression(expr) ||
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "prop"
  ) {
    throw new ParserError(
      "AX304",
      "View prop must use a prop.* helper",
      filePath,
      posOf(sourceFile, expr),
      "Use prop.string(...), prop.int(...), etc."
    );
  }

  const typeName = expr.expression.name.text;
  const configArg = expr.arguments[1];
  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg) ? propertyMap(configArg) : null;

  return { typeName, configObject };
}

// ─── State Extraction ───────────────────────────────────────────────

function extractViewState(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRViewState[] {
  if (!node) return [];
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX305",
      "`state` must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const result: IRViewState[] = [];
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const stateName = propertyKeyName(p.name);
    if (!stateName) continue;

    const { typeName, configObject } = extractStateCall(
      p.initializer,
      filePath,
      sourceFile
    );

    let type: IRType;
    if (typeName === "array") {
      const elementTypeExpr = ts.isCallExpression(p.initializer)
        ? p.initializer.arguments[0]
        : undefined;
      const elementTypeName = elementTypeExpr
        ? readStringLiteral(elementTypeExpr)
        : "string";
      type = {
        kind: "array",
        elementType: resolvePrimitiveType(elementTypeName ?? "string"),
      };
    } else {
      type = resolvePrimitiveType(typeName);
    }

    const kindExpr = configObject?.get("kind");
    const kindStr = kindExpr ? readStringLiteral(kindExpr) : null;
    const kind: ViewStateKind = (kindStr as ViewStateKind) ?? "state";

    const defaultExpr = configObject?.get("default");
    const defaultValue = defaultExpr ? evaluateLiteral(defaultExpr) : undefined;

    const envKeyExpr = configObject?.get("environmentKey");
    const environmentKey = envKeyExpr ? readStringLiteral(envKeyExpr) : undefined;

    result.push({
      name: stateName,
      type,
      kind,
      defaultValue,
      environmentKey: environmentKey ?? undefined,
    });
  }
  return result;
}

interface StateCallInfo {
  typeName: string;
  configObject: Map<string, ts.Expression> | null;
}

function extractStateCall(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): StateCallInfo {
  if (
    !ts.isCallExpression(expr) ||
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "state"
  ) {
    throw new ParserError(
      "AX306",
      "View state must use a state.* helper",
      filePath,
      posOf(sourceFile, expr),
      "Use state.string(...), state.int(...), state.boolean(...), etc."
    );
  }

  const typeName = expr.expression.name.text;

  // For state.array, the first arg is the element type string, second is description, third is config
  let configArg: ts.Expression | undefined;
  if (typeName === "array") {
    configArg = expr.arguments[2];
  } else {
    configArg = expr.arguments[1];
  }

  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg) ? propertyMap(configArg) : null;

  return { typeName, configObject };
}

// ─── Body Extraction ────────────────────────────────────────────────

function extractViewBody(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): ViewBodyNode[] {
  if (!node) {
    throw new ParserError(
      "AX307",
      "Missing required field: body",
      filePath,
      undefined,
      "Add a body array: body: [view.vstack([view.text('Hello')])]"
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX307",
      "`body` must be an array literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  return node.elements.map((el) => parseViewElement(el, filePath, sourceFile));
}

function parseViewElement(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): ViewBodyNode {
  if (!ts.isCallExpression(expr)) {
    throw new ParserError(
      "AX308",
      "View body element must be a view.* helper call",
      filePath,
      posOf(sourceFile, expr)
    );
  }

  // Expect view.<type>(...)
  if (
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "view"
  ) {
    throw new ParserError(
      "AX308",
      "View body element must be a view.* helper call",
      filePath,
      posOf(sourceFile, expr),
      "Use view.text(...), view.vstack([...]), view.button(...), etc."
    );
  }

  const kind = expr.expression.name.text;
  const args = expr.arguments;

  switch (kind) {
    case "text": {
      const content = readStringLiteral(args[0]) ?? "";
      return { kind: "text", content };
    }

    case "image": {
      if (args[0] && ts.isObjectLiteralExpression(args[0])) {
        const imgProps = propertyMap(args[0]);
        return {
          kind: "image",
          systemName: readStringLiteral(imgProps.get("systemName")) ?? undefined,
          name: readStringLiteral(imgProps.get("name")) ?? undefined,
        };
      }
      return { kind: "image" };
    }

    case "button": {
      const label = readStringLiteral(args[0]) ?? "Button";
      const action = args[1] ? readStringLiteral(args[1]) : undefined;
      return { kind: "button", label, action: action ?? undefined };
    }

    case "spacer":
      return { kind: "spacer" };

    case "divider":
      return { kind: "divider" };

    case "vstack":
    case "hstack":
    case "zstack": {
      const children =
        args[0] && ts.isArrayLiteralExpression(args[0])
          ? args[0].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : [];
      let spacing: number | undefined;
      let alignment: string | undefined;
      if (args[1] && ts.isObjectLiteralExpression(args[1])) {
        const opts = propertyMap(args[1]);
        const spacingExpr = opts.get("spacing");
        if (spacingExpr && ts.isNumericLiteral(spacingExpr)) {
          spacing = Number(spacingExpr.text);
        }
        alignment = readStringLiteral(opts.get("alignment")) ?? undefined;
      }
      if (kind === "zstack") {
        return { kind: "zstack", alignment, children };
      }
      return { kind, spacing, alignment, children };
    }

    case "foreach": {
      const collection = readStringLiteral(args[0]) ?? "";
      const itemName = readStringLiteral(args[1]) ?? "item";
      const body =
        args[2] && ts.isArrayLiteralExpression(args[2])
          ? args[2].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : [];
      return { kind: "foreach", collection, itemName, body };
    }

    case "conditional": {
      const condition = readStringLiteral(args[0]) ?? "true";
      const then =
        args[1] && ts.isArrayLiteralExpression(args[1])
          ? args[1].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : [];
      const elseChildren =
        args[2] && ts.isArrayLiteralExpression(args[2])
          ? args[2].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : undefined;
      return { kind: "conditional", condition, then, else: elseChildren };
    }

    case "navigationLink": {
      const destination = readStringLiteral(args[0]) ?? "EmptyView";
      const label =
        args[1] && ts.isArrayLiteralExpression(args[1])
          ? args[1].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : [];
      return { kind: "navigationLink", destination, label };
    }

    case "list": {
      const children =
        args[0] && ts.isArrayLiteralExpression(args[0])
          ? args[0].elements.map((el) => parseViewElement(el, filePath, sourceFile))
          : [];
      return { kind: "list", children };
    }

    case "raw": {
      const swift = readStringLiteral(args[0]) ?? "";
      return { kind: "raw", swift };
    }

    default:
      throw new ParserError(
        "AX309",
        `Unknown view element: view.${kind}`,
        filePath,
        posOf(sourceFile, expr),
        "Supported: text, image, button, spacer, divider, vstack, hstack, zstack, foreach, conditional, navigationLink, list, raw"
      );
  }
}

// ─── Shared Helpers ─────────────────────────────────────────────────

function resolvePrimitiveType(name: string): IRType {
  if (PARAM_TYPES.has(name as IRPrimitiveType)) {
    return { kind: "primitive", value: name as IRPrimitiveType };
  }
  return { kind: "primitive", value: "string" };
}

function propertyMap(obj: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p)) {
      const key = propertyKeyName(p.name);
      if (key) map.set(key, p.initializer);
    } else if (ts.isShorthandPropertyAssignment(p)) {
      map.set(p.name.text, p.name);
    }
  }
  return map;
}

function propertyKeyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function readStringLiteral(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function readBooleanLiteral(node: ts.Expression | undefined): boolean | undefined {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

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

function posOf(sourceFile: ts.SourceFile, node: ts.Node): number | undefined {
  try {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1;
  } catch {
    return undefined;
  }
}
