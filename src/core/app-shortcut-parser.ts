/**
 * Axint App Shortcut Parser
 *
 * Parses a `defineAppShortcut()` call into an `IRAppShortcut`. The
 * emitted Swift is a `struct <Name>: AppShortcutsProvider` with a
 * static `@AppShortcutsBuilder` body — the single entry point Apple
 * requires for App Shortcuts exposure to Shortcuts and Siri.
 *
 * Diagnostic codes AX800–AX809 are reserved for this surface and are
 * documented in `docs/ERRORS.md`.
 */

import ts from "typescript";
import type { IRAppShortcut, IRAppShortcutEntry } from "./types.js";
import { ParserError } from "./parser.js";
import {
  findCallExpression,
  posOf,
  propertyMap,
  readStringArray,
  readStringLiteral,
} from "./parser-utils.js";

export function parseAppShortcutSource(
  source: string,
  filePath: string = "<stdin>"
): IRAppShortcut {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findCallExpression(sourceFile, "defineAppShortcut");
  if (!call) {
    throw new ParserError(
      "AX800",
      `No defineAppShortcut() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineAppShortcut({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX800",
      "defineAppShortcut() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineAppShortcut({ name, shortcuts })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX801",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "PizzaShortcuts"'
    );
  }

  const shortcuts = parseShortcuts(props.get("shortcuts"), filePath, sourceFile);

  return {
    name,
    shortcuts,
    sourceFile: filePath,
  };
}

function parseShortcuts(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRAppShortcutEntry[] {
  if (!node) {
    throw new ParserError(
      "AX802",
      "Missing required field: shortcuts",
      filePath,
      undefined,
      "Add a shortcuts array: shortcuts: [{ intent, phrases, shortTitle, systemImageName }]"
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX803",
      "`shortcuts` must be an array literal",
      filePath,
      posOf(sourceFile, node),
      'shortcuts: [{ intent: "OrderPizza", phrases: [...], shortTitle: "Order", systemImageName: "fork.knife" }]'
    );
  }

  const out: IRAppShortcutEntry[] = [];
  for (const element of node.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX804",
        "Each shortcut must be an object literal",
        filePath,
        posOf(sourceFile, element),
        '{ intent: "OrderPizza", phrases: [...], shortTitle: "Order", systemImageName: "fork.knife" }'
      );
    }

    const entryProps = propertyMap(element);

    const intent = readStringLiteral(entryProps.get("intent"));
    if (!intent) {
      throw new ParserError(
        "AX805",
        "Each shortcut must declare a string `intent`",
        filePath,
        posOf(sourceFile, element),
        'intent: "OrderPizza"'
      );
    }

    const phrasesNode = entryProps.get("phrases");
    if (!phrasesNode) {
      throw new ParserError(
        "AX806",
        `Shortcut "${intent}" is missing a phrases array`,
        filePath,
        posOf(sourceFile, element),
        'phrases: ["Order pizza with ${applicationName}"]'
      );
    }
    if (!ts.isArrayLiteralExpression(phrasesNode)) {
      throw new ParserError(
        "AX809",
        `Shortcut "${intent}" phrases must be an array literal of strings`,
        filePath,
        posOf(sourceFile, phrasesNode),
        'phrases: ["Order pizza with ${applicationName}"]'
      );
    }
    const phrases = readStringArray(phrasesNode);

    const shortTitle = readStringLiteral(entryProps.get("shortTitle"));
    if (!shortTitle) {
      throw new ParserError(
        "AX807",
        `Shortcut "${intent}" is missing a string \`shortTitle\``,
        filePath,
        posOf(sourceFile, element),
        'shortTitle: "Order Pizza"'
      );
    }

    const systemImageName = readStringLiteral(entryProps.get("systemImageName"));
    if (!systemImageName) {
      throw new ParserError(
        "AX808",
        `Shortcut "${intent}" is missing a string \`systemImageName\``,
        filePath,
        posOf(sourceFile, element),
        'systemImageName: "fork.knife"'
      );
    }

    out.push({ intent, phrases, shortTitle, systemImageName });
  }

  return out;
}
