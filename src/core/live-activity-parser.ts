/**
 * Axint Live Activity Parser
 *
 * Parses a `defineLiveActivity()` call into an `IRLiveActivity`. The
 * shape mirrors what ActivityKit needs: an `attributes` block of
 * immutable fields, a `contentState` block of mutable fields, a
 * lock-screen view body, and four (plus one optional) Dynamic Island
 * regions.
 *
 * Diagnostic codes AX750–AX763 are reserved for this surface and are
 * documented in `docs/ERRORS.md`.
 */

import ts from "typescript";
import type {
  IRActivityStateField,
  IRDynamicIsland,
  IRLiveActivity,
  IRPrimitiveType,
  IRType,
  ViewBodyNode,
} from "./types.js";
import { PARAM_TYPES } from "./types.js";
import { ParserError } from "./parser.js";
import {
  evaluateLiteral,
  findCallExpression,
  posOf,
  propertyKeyName,
  propertyMap,
  readStringLiteral,
} from "./parser-utils.js";
import { parseViewBodyArray } from "./view-body-parser.js";

export function parseLiveActivitySource(
  source: string,
  filePath: string = "<stdin>"
): IRLiveActivity {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findCallExpression(sourceFile, "defineLiveActivity");
  if (!call) {
    throw new ParserError(
      "AX750",
      `No defineLiveActivity() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineLiveActivity({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX750",
      "defineLiveActivity() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineLiveActivity({ name, attributes, contentState, lockScreen, dynamicIsland })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX751",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "PizzaDelivery"'
    );
  }

  const attributes = parseFieldBlock(
    props.get("attributes"),
    "attributes",
    filePath,
    sourceFile
  );
  const contentState = parseFieldBlock(
    props.get("contentState"),
    "contentState",
    filePath,
    sourceFile
  );

  if (contentState.length === 0) {
    throw new ParserError(
      "AX752",
      "Live Activity must declare at least one contentState field",
      filePath,
      posOf(sourceFile, arg),
      "Add a mutable field: contentState: { progress: activityState.double(...) }"
    );
  }

  const lockScreen = parseViewBodyArray(
    props.get("lockScreen"),
    "lockScreen",
    filePath,
    sourceFile,
    "AX753"
  );
  if (lockScreen.length === 0) {
    throw new ParserError(
      "AX753",
      "Live Activity must define a non-empty lockScreen body",
      filePath,
      posOf(sourceFile, arg),
      'lockScreen: [view.text("Order in progress")]'
    );
  }

  const dynamicIsland = parseDynamicIsland(
    props.get("dynamicIsland"),
    filePath,
    sourceFile
  );

  return {
    name,
    attributes,
    contentState,
    lockScreen,
    dynamicIsland,
    sourceFile: filePath,
  };
}

// ─── Field Block (attributes / contentState) ───────────────────────

function parseFieldBlock(
  node: ts.Node | undefined,
  label: "attributes" | "contentState",
  filePath: string,
  sourceFile: ts.SourceFile
): IRActivityStateField[] {
  if (!node) return [];
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX754",
      `\`${label}\` must be an object literal`,
      filePath,
      posOf(sourceFile, node),
      `${label}: { progress: activityState.double(...) }`
    );
  }

  const out: IRActivityStateField[] = [];
  const seen = new Set<string>();
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const fieldName = propertyKeyName(p.name);
    if (!fieldName) continue;

    if (seen.has(fieldName)) {
      throw new ParserError(
        "AX755",
        `Duplicate ${label} field: ${fieldName}`,
        filePath,
        posOf(sourceFile, p)
      );
    }
    seen.add(fieldName);

    const { typeName, configObject } = readActivityStateCall(
      p.initializer,
      label,
      filePath,
      sourceFile
    );
    const defaultExpr = configObject?.get("default");
    out.push({
      name: fieldName,
      type: resolvePrimitiveType(typeName),
      defaultValue: defaultExpr ? evaluateLiteral(defaultExpr) : undefined,
    });
  }
  return out;
}

interface ActivityStateCall {
  typeName: string;
  configObject: Map<string, ts.Node> | null;
}

function readActivityStateCall(
  expr: ts.Node,
  label: "attributes" | "contentState",
  filePath: string,
  sourceFile: ts.SourceFile
): ActivityStateCall {
  if (
    !ts.isCallExpression(expr) ||
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "activityState"
  ) {
    throw new ParserError(
      "AX756",
      `${label} field must use an activityState.* helper`,
      filePath,
      posOf(sourceFile, expr),
      "Use activityState.string(...), activityState.int(...), activityState.date(...), etc."
    );
  }

  const typeName = expr.expression.name.text;
  const configArg = expr.arguments[1];
  const configObject =
    configArg && ts.isObjectLiteralExpression(configArg) ? propertyMap(configArg) : null;

  return { typeName, configObject };
}

// ─── Dynamic Island ────────────────────────────────────────────────

function parseDynamicIsland(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRDynamicIsland {
  if (!node) {
    throw new ParserError(
      "AX757",
      "Missing required field: dynamicIsland",
      filePath,
      undefined,
      "Every Live Activity needs a dynamicIsland block with expanded, compactLeading, compactTrailing, and minimal regions."
    );
  }
  if (!ts.isObjectLiteralExpression(node)) {
    throw new ParserError(
      "AX757",
      "`dynamicIsland` must be an object literal",
      filePath,
      posOf(sourceFile, node)
    );
  }

  const regions = propertyMap(node);

  const expanded = parseViewBodyArray(
    regions.get("expanded"),
    "dynamicIsland.expanded",
    filePath,
    sourceFile,
    "AX758"
  );
  const compactLeading = parseViewBodyArray(
    regions.get("compactLeading"),
    "dynamicIsland.compactLeading",
    filePath,
    sourceFile,
    "AX759"
  );
  const compactTrailing = parseViewBodyArray(
    regions.get("compactTrailing"),
    "dynamicIsland.compactTrailing",
    filePath,
    sourceFile,
    "AX760"
  );
  const minimal = parseViewBodyArray(
    regions.get("minimal"),
    "dynamicIsland.minimal",
    filePath,
    sourceFile,
    "AX761"
  );

  const bottomNode = regions.get("bottom");
  const bottom = bottomNode
    ? parseViewBodyArray(bottomNode, "dynamicIsland.bottom", filePath, sourceFile, "AX758")
    : undefined;

  if (expanded.length === 0) {
    throw new ParserError(
      "AX758",
      "dynamicIsland.expanded must have at least one view",
      filePath,
      posOf(sourceFile, node),
      'expanded: [view.hstack([view.text("Order")])]'
    );
  }
  if (compactLeading.length === 0) {
    throw new ParserError(
      "AX759",
      "dynamicIsland.compactLeading must have at least one view",
      filePath,
      posOf(sourceFile, node),
      'compactLeading: [view.image({ systemName: "truck.fill" })]'
    );
  }
  if (compactTrailing.length === 0) {
    throw new ParserError(
      "AX760",
      "dynamicIsland.compactTrailing must have at least one view",
      filePath,
      posOf(sourceFile, node),
      'compactTrailing: [view.text("12m")]'
    );
  }
  if (minimal.length === 0) {
    throw new ParserError(
      "AX761",
      "dynamicIsland.minimal must have at least one view",
      filePath,
      posOf(sourceFile, node),
      'minimal: [view.image({ systemName: "truck.fill" })]'
    );
  }

  return { expanded, compactLeading, compactTrailing, minimal, bottom };
}

// ─── Helpers ───────────────────────────────────────────────────────

function resolvePrimitiveType(name: string): IRType {
  if (PARAM_TYPES.has(name as IRPrimitiveType)) {
    return { kind: "primitive", value: name as IRPrimitiveType };
  }
  return { kind: "primitive", value: "string" };
}

/* istanbul ignore next -- exported so downstream helpers don't lose the type. */
export type { IRLiveActivity, ViewBodyNode };
