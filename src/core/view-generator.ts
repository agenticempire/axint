/**
 * Axint SwiftUI View Generator
 *
 * Transforms IRView into clean, idiomatic SwiftUI source code.
 * Follows the same string-template approach as the intent generator
 * for consistency and readability.
 */

import type { IRView, IRViewProp, IRViewState, ViewBodyNode } from "./types.js";
import { irTypeToSwift } from "./types.js";
import { escapeSwiftString, generatedFileHeader } from "./generator.js";

/**
 * Generate a SwiftUI view source file from an IRView.
 */
export function generateSwiftUIView(view: IRView): string {
  const lines: string[] = [];

  lines.push(...generatedFileHeader(`${view.name}.swift`));
  lines.push(``);
  lines.push(`import SwiftUI`);
  lines.push(``);

  lines.push(`struct ${view.name}: View {`);

  // Props (let bindings from parent)
  for (const p of view.props) {
    const swift = irTypeToSwift(p.type);
    const decl = p.isOptional ? `${swift}?` : swift;
    if (p.defaultValue !== undefined) {
      lines.push(`    var ${p.name}: ${decl} = ${formatLiteral(p.defaultValue, p.type)}`);
    } else {
      lines.push(`    var ${p.name}: ${decl}`);
    }
  }

  if (view.props.length > 0 && view.state.length > 0) {
    lines.push(``);
  }

  // State properties
  for (const s of view.state) {
    lines.push(generateStateProperty(s));
  }

  if (view.props.length > 0 || view.state.length > 0) {
    lines.push(``);
  }

  // Body
  lines.push(`    var body: some View {`);
  for (const node of view.body) {
    const nodeLines = generateBodyNode(node, 2);
    lines.push(...nodeLines);
  }
  lines.push(`    }`);

  lines.push(`}`);
  lines.push(``);

  // Preview
  lines.push(`#Preview {`);
  if (view.props.length > 0) {
    const previewArgs = view.props
      .filter((p) => !p.isOptional && p.defaultValue === undefined)
      .map((p) => `${p.name}: ${previewDefault(p)}`)
      .join(", ");
    lines.push(`    ${view.name}(${previewArgs})`);
  } else {
    lines.push(`    ${view.name}()`);
  }
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

function generateStateProperty(s: IRViewState): string {
  const swift = irTypeToSwift(s.type);

  switch (s.kind) {
    case "binding":
      return `    @Binding var ${s.name}: ${swift}`;
    case "environment":
      return `    @Environment(${s.environmentKey ?? `\\.${s.name}`}) var ${s.name}`;
    case "observed":
      return `    @ObservedObject var ${s.name}: ${swift}`;
    case "state":
    default: {
      if (s.defaultValue !== undefined) {
        return `    @State private var ${s.name}: ${swift} = ${formatLiteral(s.defaultValue, s.type)}`;
      }
      return `    @State private var ${s.name}: ${swift}`;
    }
  }
}

function generateBodyNode(node: ViewBodyNode, depth: number): string[] {
  const indent = "    ".repeat(depth);
  const lines: string[] = [];

  switch (node.kind) {
    case "text":
      lines.push(`${indent}Text("${escapeSwiftString(node.content)}")`);
      break;

    case "image":
      if (node.systemName) {
        lines.push(`${indent}Image(systemName: "${escapeSwiftString(node.systemName)}")`);
      } else if (node.name) {
        lines.push(`${indent}Image("${escapeSwiftString(node.name)}")`);
      }
      break;

    case "button":
      if (node.action) {
        lines.push(`${indent}Button("${escapeSwiftString(node.label)}") {`);
        lines.push(`${indent}    ${node.action}`);
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}Button("${escapeSwiftString(node.label)}") { }`);
      }
      break;

    case "spacer":
      lines.push(`${indent}Spacer()`);
      break;

    case "divider":
      lines.push(`${indent}Divider()`);
      break;

    case "vstack":
    case "hstack":
    case "zstack": {
      const container =
        node.kind === "vstack" ? "VStack" : node.kind === "hstack" ? "HStack" : "ZStack";
      const args: string[] = [];
      if ("alignment" in node && node.alignment)
        args.push(`alignment: .${node.alignment}`);
      if ("spacing" in node && node.spacing !== undefined)
        args.push(`spacing: ${node.spacing}`);
      const argStr = args.length > 0 ? `(${args.join(", ")})` : "";

      lines.push(`${indent}${container}${argStr} {`);
      for (const child of node.children) {
        lines.push(...generateBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;
    }

    case "foreach":
      lines.push(
        `${indent}ForEach(${node.collection}, id: \\.self) { ${node.itemName} in`
      );
      for (const child of node.body) {
        lines.push(...generateBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "conditional":
      lines.push(`${indent}if ${node.condition} {`);
      for (const child of node.then) {
        lines.push(...generateBodyNode(child, depth + 1));
      }
      if (node.else && node.else.length > 0) {
        lines.push(`${indent}} else {`);
        for (const child of node.else) {
          lines.push(...generateBodyNode(child, depth + 1));
        }
      }
      lines.push(`${indent}}`);
      break;

    case "navigationLink":
      lines.push(`${indent}NavigationLink(destination: ${node.destination}()) {`);
      for (const child of node.label) {
        lines.push(...generateBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "list":
      lines.push(`${indent}List {`);
      for (const child of node.children) {
        lines.push(...generateBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "raw":
      for (const rawLine of normalizedRawLines(node.swift)) {
        lines.push(rawLine ? `${indent}${rawLine}` : "");
      }
      break;
  }

  return lines;
}

function normalizedRawLines(source: string): string[] {
  const lines = source.replace(/\t/g, "    ").split("\n");
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();

  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0;
  if (commonIndent > 0) {
    return lines.map((line) => (line.trim() ? line.slice(commonIndent) : ""));
  }

  const positiveIndents = indents.filter((indent) => indent > 0);
  const minPositiveIndent = positiveIndents.length > 0 ? Math.min(...positiveIndents) : 0;
  const extraNestedIndent =
    minPositiveIndent >= 8 && indents[0] === 0 ? minPositiveIndent : 0;
  return lines.map((line) => {
    if (!line.trim()) return "";
    const indent = line.match(/^ */)?.[0].length ?? 0;
    return indent > 0 ? line.slice(Math.min(indent, extraNestedIndent)) : line;
  });
}

function formatLiteral(value: unknown, type: { kind: string; value?: string }): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (type.kind === "primitive") {
      if (type.value === "int" && /^[-+]?\d+$/.test(trimmed)) return trimmed;
      if (
        (type.value === "double" || type.value === "float") &&
        /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)
      ) {
        return type.value === "float" ? `Float(${trimmed})` : trimmed;
      }
      if (type.value === "boolean" && /^(true|false)$/i.test(trimmed)) {
        return trimmed.toLowerCase();
      }
      if (type.value === "url") {
        return `URL(string: "${escapeSwiftString(value)}")!`;
      }
      if (type.value === "date" && trimmed === "Date()") {
        return "Date()";
      }
      if (type.value === "duration" && /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
        return `Measurement(value: ${trimmed}, unit: UnitDuration.seconds)`;
      }
    }
    return `"${escapeSwiftString(value)}"`;
  }
  if (typeof value === "number") {
    if (type.kind === "primitive" && type.value === "duration") {
      return `Measurement(value: ${value}, unit: UnitDuration.seconds)`;
    }
    return `${value}`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return `"${escapeSwiftString(String(value))}"`;
}

function previewDefault(p: IRViewProp): string {
  if (p.type.kind === "primitive") {
    switch (p.type.value) {
      case "string":
        return `"Preview"`;
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
        return `Measurement(value: 0, unit: UnitDuration.seconds)`;
      case "url":
        return `URL(string: "https://example.com")! // TODO: Replace with your URL`;
      default:
        return `""`;
    }
  }
  return `""`;
}
