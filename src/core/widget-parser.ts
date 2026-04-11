/**
 * Axint Widget Parser
 *
 * Parses TypeScript widget definitions (using the defineWidget() API)
 * into the Axint IRWidget representation.
 *
 * Same approach as the view parser: real TS compiler API AST walker.
 */

import ts from "typescript";
import type {
  IRWidget,
  IRWidgetEntry,
  IRType,
  IRPrimitiveType,
  ViewBodyNode,
  WidgetFamily,
  WidgetRefreshPolicy,
} from "./types.js";
import { PARAM_TYPES } from "./types.js";
import { ParserError } from "./parser.js";

/**
 * Parse a TypeScript source file containing a defineWidget() call
 * and return the IRWidget representation.
 */
export function parseWidgetSource(
  source: string,
  filePath: string = "<stdin>"
): IRWidget {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findDefineWidgetCall(sourceFile);
  if (!call) {
    throw new ParserError(
      "AX401",
      `No defineWidget() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineWidget({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX401",
      "defineWidget() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineWidget({ name, displayName, ... })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX402",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "StepCounter"'
    );
  }

  const displayName = readStringLiteral(props.get("displayName"));
  if (!displayName) {
    throw new ParserError(
      "AX402",
      "Missing required field: displayName",
      filePath,
      posOf(sourceFile, arg),
      'Add a displayName field: displayName: "Step Counter"'
    );
  }

  const description = readStringLiteral(props.get("description")) ?? "";
  const families = extractWidgetFamilies(props.get("families"), filePath, sourceFile);
  const entry = extractWidgetEntry(props.get("entry"), filePath, sourceFile);
  const body = extractWidgetBody(props.get("body"), filePath, sourceFile);

  const refreshPolicyExpr = props.get("refreshPolicy");
  const refreshPolicy: WidgetRefreshPolicy = refreshPolicyExpr
    ? ((readStringLiteral(refreshPolicyExpr) as WidgetRefreshPolicy) ?? "atEnd")
    : "atEnd";

  const refreshIntervalExpr = props.get("refreshInterval");
  const refreshInterval =
    refreshIntervalExpr && ts.isNumericLiteral(refreshIntervalExpr)
      ? Number(refreshIntervalExpr.text)
      : undefined;

  return {
    name,
    displayName,
    description,
    families,
    entry,
    body,
    refreshInterval,
    refreshPolicy,
    sourceFile: filePath,
  };
}

// ─── AST Walkers ────────────────────────────────────────────────────

function findDefineWidgetCall(node: ts.Node): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "defineWidget"
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// ─── Families Extraction ────────────────────────────────────────────

function extractWidgetFamilies(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): WidgetFamily[] {
  if (!node) {
    throw new ParserError(
      "AX402",
      "Missing required field: families",
      filePath,
      undefined,
      'Add families array: families: ["systemSmall", "systemMedium"]'
    );
  }

  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX403",
      "`families` must be an array literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const families: WidgetFamily[] = [];
  for (const el of node.elements) {
    const fam = readStringLiteral(el);
    if (fam && isValidWidgetFamily(fam)) {
      families.push(fam as WidgetFamily);
    } else if (fam) {
      throw new ParserError(
        "AX411",
        `Invalid widget family: ${fam}`,
        filePath,
        posOf(sourceFile, el),
        "Valid families: systemSmall, systemMedium, systemLarge, systemExtraLarge, accessoryCircular, accessoryRectangular, accessoryInline"
      );
    }
  }

  return families;
}

function isValidWidgetFamily(family: string): boolean {
  return [
    "systemSmall",
    "systemMedium",
    "systemLarge",
    "systemExtraLarge",
    "accessoryCircular",
    "accessoryRectangular",
    "accessoryInline",
  ].includes(family);
}

// ─── Entry Extraction ───────────────────────────────────────────────

function extractWidgetEntry(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRWidgetEntry[] {
  if (!node) return [];
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX404",
      "`entry` must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const result: IRWidgetEntry[] = [];
  const seenNames = new Set<string>();

  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const entryName = propertyKeyName(p.name);
    if (!entryName) continue;

    if (seenNames.has(entryName)) {
      throw new ParserError(
        "AX414",
        `Duplicate entry field: ${entryName}`,
        filePath,
        posOf(sourceFile, p)
      );
    }
    seenNames.add(entryName);

    const { typeName, configObject } = extractEntryCall(
      p.initializer,
      filePath,
      sourceFile
    );
    const type = resolvePrimitiveType(typeName);
    const defaultExpr = configObject?.get("default");
    const defaultValue = defaultExpr ? evaluateLiteral(defaultExpr) : undefined;

    result.push({
      name: entryName,
      type,
      defaultValue,
    });
  }
  return result;
}

interface EntryCallInfo {
  typeName: string;
  configObject: Map<string, ts.Expression> | null;
}

function extractEntryCall(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): EntryCallInfo {
  if (
    !ts.isCallExpression(expr) ||
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "entry"
  ) {
    throw new ParserError(
      "AX405",
      "Widget entry field must use an entry.* helper",
      filePath,
      posOf(sourceFile, expr),
      "Use entry.string(...), entry.int(...), entry.date(...), etc."
    );
  }

  const typeName = expr.expression.name.text;
  const configArg = expr.arguments[1];
  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg) ? propertyMap(configArg) : null;

  return { typeName, configObject };
}

// ─── Body Extraction ────────────────────────────────────────────────

function extractWidgetBody(
  node: ts.Expression | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): ViewBodyNode[] {
  if (!node) {
    throw new ParserError(
      "AX402",
      "Missing required field: body",
      filePath,
      undefined,
      "Add a body array: body: [view.vstack([view.text('Hello')])]"
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX412",
      "`body` must be an array literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const body: ViewBodyNode[] = [];
  for (const el of node.elements) {
    body.push(parseViewElement(el, filePath, sourceFile));
  }

  return body;
}

function parseViewElement(
  expr: ts.Expression,
  filePath: string,
  sourceFile: ts.SourceFile
): ViewBodyNode {
  if (!ts.isCallExpression(expr)) {
    throw new ParserError(
      "AX408",
      "Widget body element must be a view.* helper call",
      filePath,
      posOf(sourceFile, expr)
    );
  }

  if (
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "view"
  ) {
    throw new ParserError(
      "AX408",
      "Widget body element must be a view.* helper call",
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
        "AX409",
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
