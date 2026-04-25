/**
 * Axint WidgetKit Widget Generator
 *
 * Transforms IRWidget into clean, idiomatic Swift WidgetKit source code.
 * Generates TimelineEntry, TimelineProvider, Widget struct, and Preview.
 */

import type { IRWidget, IRType, ViewBodyNode } from "./types.js";
import { irTypeToSwift } from "./types.js";
import { escapeSwiftString, generatedFileHeader } from "./generator.js";

/**
 * Generate a WidgetKit widget source file from an IRWidget.
 */
export function generateSwiftWidget(widget: IRWidget): string {
  const lines: string[] = [];
  const entryFields = normalizeEntryFields(widget.entry);

  lines.push(...generatedFileHeader(`${widget.name}Widget.swift`));
  lines.push(``);
  lines.push(`import WidgetKit`);
  lines.push(`import SwiftUI`);
  lines.push(``);

  // Timeline entry struct
  lines.push(`struct ${widget.name}Entry: TimelineEntry {`);
  lines.push(`    let date: Date`);
  for (const entry of entryFields) {
    const swift = irTypeToSwift(entry.type);
    if (entry.defaultValue !== undefined) {
      lines.push(
        `    let ${entry.name}: ${swift} = ${formatLiteral(entry.defaultValue, entry.type)}`
      );
    } else {
      lines.push(`    let ${entry.name}: ${swift}`);
    }
  }
  lines.push(`}`);
  lines.push(``);

  // Timeline provider
  lines.push(`struct ${widget.name}Provider: TimelineProvider {`);
  lines.push(`    func placeholder(in context: Context) -> ${widget.name}Entry {`);
  const placeholderFields = entryFields
    .map((e) => `${e.name}: ${getDefaultValue(e.defaultValue, e.type)}`)
    .join(", ");
  lines.push(
    `        ${widget.name}Entry(date: Date()${placeholderFields ? ", " + placeholderFields : ""})`
  );
  lines.push(`    }`);
  lines.push(``);

  lines.push(
    `    func getSnapshot(in context: Context, completion: @escaping (${widget.name}Entry) -> Void) {`
  );
  lines.push(
    `        let entry = ${widget.name}Entry(date: Date()${placeholderFields ? ", " + placeholderFields : ""})`
  );
  lines.push(`        completion(entry)`);
  lines.push(`    }`);
  lines.push(``);

  lines.push(
    `    func getTimeline(in context: Context, completion: @escaping (Timeline<${widget.name}Entry>) -> Void) {`
  );
  lines.push(
    `        let entry = ${widget.name}Entry(date: Date()${placeholderFields ? ", " + placeholderFields : ""})`
  );

  // Refresh policy
  let nextRefresh: string;
  if (widget.refreshPolicy === "never") {
    nextRefresh = "Calendar.current.date(byAdding: .day, value: 365, to: Date())!";
  } else if (widget.refreshPolicy === "after" && widget.refreshInterval) {
    nextRefresh = `Calendar.current.date(byAdding: .minute, value: ${widget.refreshInterval}, to: Date())!`;
  } else {
    nextRefresh = `Calendar.current.date(byAdding: .hour, value: 1, to: Date())!`;
  }

  lines.push(
    `        let timeline = Timeline(entries: [entry], policy: .after(${nextRefresh}))`
  );
  lines.push(`        completion(timeline)`);
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);

  // Widget view
  lines.push(`struct ${widget.name}EntryView: View {`);
  lines.push(`    var entry: ${widget.name}Provider.Entry`);
  lines.push(``);
  lines.push(`    var body: some View {`);
  for (const node of widget.body) {
    const nodeLines = generateBodyNode(node, 2);
    lines.push(...nodeLines);
  }
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);

  // Widget struct
  lines.push(`struct ${widget.name}Widget: Widget {`);
  lines.push(`    let kind: String = "${widget.name}"`);
  lines.push(``);
  lines.push(`    var body: some WidgetConfiguration {`);
  lines.push(`        StaticConfiguration(`);
  lines.push(`            kind: kind,`);
  lines.push(`            provider: ${widget.name}Provider()`);
  lines.push(`        ) { entry in`);
  lines.push(`            ${widget.name}EntryView(entry: entry)`);
  lines.push(`        }`);
  lines.push(
    `        .configurationDisplayName("${escapeSwiftString(widget.displayName)}")`
  );
  lines.push(`        .description("${escapeSwiftString(widget.description)}")`);
  lines.push(`        .supportedFamilies(${familiesArray(widget.families)})`);
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);

  // Preview
  lines.push(`#Preview(as: .systemSmall) {`);
  lines.push(`    ${widget.name}Widget()`);
  lines.push(`} timeline: {`);
  const previewEntry = entryFields
    .map((e) => `${e.name}: ${getDefaultValue(e.defaultValue, e.type)}`)
    .join(", ");
  lines.push(
    `    ${widget.name}Entry(date: Date()${previewEntry ? ", " + previewEntry : ""})`
  );
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────

function normalizeEntryFields(entries: IRWidget["entry"]): IRWidget["entry"] {
  const seen = new Set<string>(["date"]);
  const normalized: IRWidget["entry"] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    normalized.push(entry);
  }
  return normalized;
}

function familiesArray(families: string[]): string {
  const mapped = families.map((f) => `.${f}`);
  return `[${mapped.join(", ")}]`;
}

function formatLiteral(value: unknown, type?: IRType): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const primitive = type?.kind === "primitive" ? type.value : undefined;
    if (primitive === "int" && /^[-+]?\d+$/.test(trimmed)) return trimmed;
    if (
      (primitive === "double" || primitive === "float") &&
      /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)
    ) {
      return primitive === "float" ? `Float(${trimmed})` : trimmed;
    }
    if (primitive === "boolean" && /^(true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (primitive === "url") {
      return `URL(string: "${escapeSwiftString(value)}")!`;
    }
    if (primitive === "date" && trimmed === "Date()") {
      return "Date()";
    }
    if (primitive === "duration" && /^[-+]?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
      return `Measurement(value: ${trimmed}, unit: UnitDuration.seconds)`;
    }
    return `"${escapeSwiftString(value)}"`;
  }
  if (typeof value === "number") {
    if (type?.kind === "primitive" && type.value === "duration") {
      return `Measurement(value: ${value}, unit: UnitDuration.seconds)`;
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null) {
    return "nil";
  }
  if (Array.isArray(value)) {
    const elements = value.map((v) => formatLiteral(v));
    return `[${elements.join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `"${escapeSwiftString(k)}": ${formatLiteral(v)}`
    );
    return `[${entries.join(", ")}]`;
  }
  return "nil";
}

function getDefaultValue(value: unknown, type?: IRType): string {
  if (value !== undefined) {
    return formatLiteral(value, type);
  }
  if (!type) return `nil`;
  if (type.kind === "array") return `[]`;
  if (type.kind === "optional") return `nil`;
  const swift = irTypeToSwift(type);
  if (swift === "String") return `""`;
  if (swift === "Int") return `0`;
  if (swift === "Double" || swift === "Float") return `0.0`;
  if (swift === "Bool") return `false`;
  if (swift === "Date") return `Date()`;
  if (swift === "Measurement<UnitDuration>")
    return `Measurement(value: 0, unit: UnitDuration.seconds)`;
  if (swift === "URL")
    return `URL(string: "https://example.com")! // TODO: Replace with your URL`;
  return `nil`;
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
