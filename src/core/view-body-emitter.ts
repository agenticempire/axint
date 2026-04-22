/**
 * Shared SwiftUI body emitter.
 *
 * Turns a ViewBodyNode tree into indented Swift lines. Extracted so
 * surfaces that embed a view body (Live Activities today, widgets and
 * standalone views in a future cleanup pass) share a single source of
 * truth for SwiftUI codegen.
 */

import type { ViewBodyNode } from "./types.js";
import { escapeSwiftString } from "./generator.js";

export function emitBodyNode(node: ViewBodyNode, depth: number): string[] {
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
        lines.push(...emitBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;
    }

    case "foreach":
      lines.push(
        `${indent}ForEach(${node.collection}, id: \\.self) { ${node.itemName} in`
      );
      for (const child of node.body) {
        lines.push(...emitBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "conditional":
      lines.push(`${indent}if ${node.condition} {`);
      for (const child of node.then) {
        lines.push(...emitBodyNode(child, depth + 1));
      }
      if (node.else && node.else.length > 0) {
        lines.push(`${indent}} else {`);
        for (const child of node.else) {
          lines.push(...emitBodyNode(child, depth + 1));
        }
      }
      lines.push(`${indent}}`);
      break;

    case "navigationLink":
      lines.push(`${indent}NavigationLink(destination: ${node.destination}()) {`);
      for (const child of node.label) {
        lines.push(...emitBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "list":
      lines.push(`${indent}List {`);
      for (const child of node.children) {
        lines.push(...emitBodyNode(child, depth + 1));
      }
      lines.push(`${indent}}`);
      break;

    case "raw":
      lines.push(`${indent}${node.swift}`);
      break;
  }

  return lines;
}
