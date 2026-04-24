import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { escapeSwiftString } from "../core/generator.js";

export type TokenOutputFormat = "swift" | "json" | "markdown";

export interface TokenIngestArgs {
  source?: string;
  sourcePath?: string;
  namespace?: string;
  format?: TokenOutputFormat;
}

interface TokenRecord {
  path: string[];
  name: string;
  swiftName: string;
  kind: "color" | "layout" | "spacing" | "radius" | "typography" | "shadow" | "value";
  value: string | number | boolean;
}

export function handleTokenIngest(args: TokenIngestArgs) {
  const { source, fileName } = readTokenSource(args);
  const namespace = sanitizeTypeName(args.namespace || "AxintDesignTokens");
  const value = parseTokenSource(source, fileName);
  const records = flattenTokens(value).map((record) => ({
    ...record,
    kind: classifyToken(record),
  }));

  const result = {
    namespace,
    source: fileName,
    count: records.length,
    tokens: records,
    swift: renderSwiftTokens(namespace, records),
    usage: [
      `Save the Swift output as ${namespace}.swift in the app target.`,
      `Pass tokenNamespace: "${namespace}" to axint.feature or axint.schema.compile so generated views reference the token enum.`,
      "Use generated Layout tokens for fixed Swarm shell dimensions like sidebarRail and channelsColumn.",
    ],
  };

  const format = args.format ?? "swift";
  const text =
    format === "json"
      ? JSON.stringify(result, null, 2)
      : format === "markdown"
        ? renderMarkdown(result)
        : result.swift;

  return {
    content: [{ type: "text" as const, text }],
  };
}

function readTokenSource(args: TokenIngestArgs): { source: string; fileName: string } {
  if (args.source !== undefined) {
    return { source: args.source, fileName: args.sourcePath || "<tokens>" };
  }
  if (!args.sourcePath) {
    throw new Error("axint.tokens.ingest requires either source or sourcePath.");
  }
  const path = resolve(args.sourcePath);
  if (!existsSync(path)) throw new Error(`Token file not found: ${path}`);
  return { source: readFileSync(path, "utf-8"), fileName: path };
}

function parseTokenSource(source: string, fileName: string): unknown {
  const trimmed = source.trim();
  if (trimmed.startsWith("{") || fileName.endsWith(".json")) {
    return JSON.parse(trimmed);
  }

  const cssVars = parseCssVariables(source);
  if (Object.keys(cssVars).length > 0) return cssVars;

  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const expr = findTokenObjectExpression(sourceFile);
  if (!expr) {
    throw new Error(
      "Could not find a token object. Use JSON, CSS variables, export default, module.exports, or a const object."
    );
  }
  return literalFromExpression(expr);
}

function parseCssVariables(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(re)) {
    out[match[1]!] = match[2]!.trim();
  }
  return out;
}

function findTokenObjectExpression(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression | undefined {
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) &&
      ts.isObjectLiteralExpression(statement.expression)
    ) {
      return statement.expression;
    }
    if (ts.isExpressionStatement(statement)) {
      const expression = statement.expression;
      if (
        ts.isBinaryExpression(expression) &&
        ts.isObjectLiteralExpression(expression.right)
      ) {
        return expression.right;
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          return decl.initializer;
        }
      }
    }
  }

  let found: ts.ObjectLiteralExpression | undefined;
  sourceFile.forEachChild(function visit(node) {
    if (!found && ts.isObjectLiteralExpression(node)) found = node;
    if (!found) node.forEachChild(visit);
  });
  return found;
}

function literalFromExpression(expr: ts.Expression): unknown {
  if (ts.isObjectLiteralExpression(expr)) {
    const out: Record<string, unknown> = {};
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = propertyName(prop.name);
      if (!name) continue;
      out[name] = literalFromExpression(prop.initializer as ts.Expression);
    }
    return out;
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((item) => literalFromExpression(item as ts.Expression));
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
    return expr.text;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand)) {
    return expr.operator === ts.SyntaxKind.MinusToken
      ? -Number(expr.operand.text)
      : Number(expr.operand.text);
  }
  return expr.getText();
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function flattenTokens(value: unknown, path: string[] = []): Omit<TokenRecord, "kind">[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenTokens(child, [...path, key])
    );
  }
  if (Array.isArray(value)) {
    return [
      {
        path,
        name: path.join("."),
        swiftName: swiftIdentifier(path),
        value: value.join(", "),
      },
    ];
  }
  return [
    {
      path,
      name: path.join("."),
      swiftName: swiftIdentifier(path),
      value:
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
          ? value
          : String(value),
    },
  ];
}

function classifyToken(record: Omit<TokenRecord, "kind">): TokenRecord["kind"] {
  const name = record.name.toLowerCase();
  const value = String(record.value).trim();
  if (
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^(rgb|rgba|hsl|hsla)\(/i.test(value)
  ) {
    return "color";
  }
  if (/\b(color|brand|accent|background|surface|text|border|fill)\b/.test(name))
    return "color";
  if (/\b(sidebar|rail|column|width|height|size|layout)\b/.test(name)) return "layout";
  if (/\b(space|spacing|gap|padding|margin|inset)\b/.test(name)) return "spacing";
  if (/\b(radius|radii|corner|rounded)\b/.test(name)) return "radius";
  if (
    /\b(font|type|text|lineheight|letter|weight)\b/.test(name) &&
    typeof record.value === "number"
  )
    return "typography";
  if (/\b(shadow|elevation|blur)\b/.test(name)) return "shadow";
  return "value";
}

function renderSwiftTokens(namespace: string, records: TokenRecord[]): string {
  const groups = {
    Colors: records.filter((r) => r.kind === "color"),
    Layout: records.filter((r) => r.kind === "layout"),
    Spacing: records.filter((r) => r.kind === "spacing"),
    Radii: records.filter((r) => r.kind === "radius"),
    Typography: records.filter((r) => r.kind === "typography"),
    Shadows: records.filter((r) => r.kind === "shadow"),
    Values: records.filter((r) => r.kind === "value"),
  };

  const lines: string[] = [
    "// Generated by Axint tokens ingest.",
    "import SwiftUI",
    "",
    `enum ${namespace} {`,
  ];

  for (const [group, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(`    enum ${group} {`);
    for (const item of dedupeSwiftNames(
      items.map((record) => withGroupSwiftName(record))
    )) {
      lines.push(`        static let ${item.swiftName} = ${swiftLiteral(item)}`);
    }
    lines.push("    }", "");
  }

  lines.push("}");
  if (groups.Colors.length > 0) {
    lines.push(
      "",
      "private extension Color {",
      "    init(hex: String) {",
      "        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)",
      "        var int: UInt64 = 0",
      "        Scanner(string: cleaned).scanHexInt64(&int)",
      "        let red, green, blue, alpha: UInt64",
      "        switch cleaned.count {",
      "        case 3:",
      "            red = (int >> 8) * 17; green = ((int >> 4) & 0xF) * 17; blue = (int & 0xF) * 17; alpha = 255",
      "        case 6:",
      "            red = int >> 16; green = (int >> 8) & 0xFF; blue = int & 0xFF; alpha = 255",
      "        case 8:",
      "            red = (int >> 24) & 0xFF; green = (int >> 16) & 0xFF; blue = (int >> 8) & 0xFF; alpha = int & 0xFF",
      "        default:",
      "            red = 0; green = 0; blue = 0; alpha = 255",
      "        }",
      "        self.init(.sRGB, red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255, opacity: Double(alpha) / 255)",
      "    }",
      "}"
    );
  }
  return lines.join("\n");
}

function swiftLiteral(record: TokenRecord): string {
  if (record.kind === "color") return colorLiteral(String(record.value));
  if (typeof record.value === "number") return `CGFloat(${record.value})`;
  if (typeof record.value === "boolean") return record.value ? "true" : "false";
  const raw = String(record.value);
  const px = raw.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (
    px &&
    (record.kind === "layout" || record.kind === "spacing" || record.kind === "radius")
  ) {
    return `CGFloat(${px[1]})`;
  }
  return `"${escapeSwiftString(raw)}"`;
}

function colorLiteral(value: string): string {
  if (value.startsWith("#")) return `Color(hex: "${escapeSwiftString(value)}")`;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(value)) return `"${escapeSwiftString(value)}"`;
  return `"${escapeSwiftString(value)}"`;
}

function renderMarkdown(result: {
  namespace: string;
  source: string;
  count: number;
  tokens: TokenRecord[];
  usage: string[];
}): string {
  return [
    `# Axint Tokens: ${result.namespace}`,
    "",
    `- Source: ${result.source}`,
    `- Tokens: ${result.count}`,
    "",
    "## Usage",
    ...result.usage.map((item) => `- ${item}`),
    "",
    "## Tokens",
    ...result.tokens.map((t) => `- ${t.name} → ${t.kind} → ${String(t.value)}`),
  ].join("\n");
}

function dedupeSwiftNames(records: TokenRecord[]): TokenRecord[] {
  const seen = new Map<string, number>();
  return records.map((record) => {
    const count = seen.get(record.swiftName) ?? 0;
    seen.set(record.swiftName, count + 1);
    return count === 0
      ? record
      : { ...record, swiftName: `${record.swiftName}${count + 1}` };
  });
}

function withGroupSwiftName(record: TokenRecord): TokenRecord {
  const [first, ...rest] = record.path;
  const normalized = first?.toLowerCase();
  const stripFirst =
    (record.kind === "color" && ["color", "colors"].includes(normalized ?? "")) ||
    (record.kind === "layout" && normalized === "layout") ||
    (record.kind === "spacing" && ["space", "spacing"].includes(normalized ?? "")) ||
    (record.kind === "radius" &&
      ["radius", "radii", "corner"].includes(normalized ?? "")) ||
    (record.kind === "typography" &&
      ["font", "fonts", "type", "typography"].includes(normalized ?? "")) ||
    (record.kind === "shadow" &&
      ["shadow", "shadows", "elevation"].includes(normalized ?? ""));
  const path = stripFirst && rest.length > 0 ? rest : record.path;
  return { ...record, swiftName: swiftIdentifier(path) };
}

function swiftIdentifier(path: string[]): string {
  const parts = path.filter(Boolean);
  const raw = parts
    .map((part, index) => {
      const clean = part.replace(/[^A-Za-z0-9]+/g, " ").trim();
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length === 0) return "";
      const pascal = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
      return index === 0 ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : pascal;
    })
    .join("");
  return sanitizeIdentifier(raw || "token");
}

function sanitizeIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "");
  const safe = cleaned.length > 0 ? cleaned : "token";
  return /^[A-Za-z_]/.test(safe) ? safe : `token${safe}`;
}

function sanitizeTypeName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "");
  const safe = cleaned.length > 0 ? cleaned : "AxintDesignTokens";
  const first = /^[A-Za-z_]/.test(safe) ? safe : `Tokens${safe}`;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
