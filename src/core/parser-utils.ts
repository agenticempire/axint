/**
 * Shared AST utilities for all Axint parsers.
 * Single source of truth — parser.ts, view-parser.ts, widget-parser.ts,
 * and app-parser.ts all import from here.
 */

import ts from "typescript";

export function propertyMap(obj: ts.ObjectLiteralExpression): Map<string, ts.Node> {
  const map = new Map<string, ts.Node>();
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyKeyName(prop.name);
      if (key) map.set(key, prop.initializer);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      map.set(prop.name.text, prop.name);
    } else if (ts.isMethodDeclaration(prop)) {
      const key = propertyKeyName(prop.name);
      if (key) map.set(key, prop);
    }
  }
  return map;
}

export function propertyKeyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

export function readStringLiteral(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

export function readBooleanLiteral(node: ts.Node | undefined): boolean | undefined {
  if (!node) return undefined;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

export function readStringArray(node: ts.Node | undefined): string[] {
  if (!node || !ts.isArrayLiteralExpression(node)) return [];
  const out: string[] = [];
  for (const el of node.elements) {
    const s = readStringLiteral(el);
    if (s !== null) out.push(s);
  }
  return out;
}

export function readStringRecord(node: ts.Node | undefined): Record<string, string> {
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

export function evaluateLiteral(node: ts.Node): unknown {
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
  // Handle array literals
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => evaluateLiteral(el));
  }
  // Handle object literals
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = propertyKeyName(prop.name);
        if (key) result[key] = evaluateLiteral(prop.initializer);
      }
    }
    return result;
  }
  return undefined;
}

export function posOf(sourceFile: ts.SourceFile, node: ts.Node): number | undefined {
  try {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1;
  } catch {
    return undefined;
  }
}

/**
 * Find a call expression matching a specific function name in the AST.
 */
export function findCallExpression(
  node: ts.Node,
  functionName: string
): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === functionName
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Find all call expressions matching a specific function name in the AST.
 */
export function findAllCallExpressions(
  node: ts.Node,
  functionName: string
): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === functionName
    ) {
      found.push(n);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}
