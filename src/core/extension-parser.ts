/**
 * Axint App Extension Parser
 *
 * Parses a `defineExtension()` call into an `IRExtension`. Each target
 * in the `targets` array compiles to its own Swift principal class plus
 * an `NSExtensionPointIdentifier`-shaped Info.plist fragment — the two
 * things Apple requires to register an app extension bundle.
 *
 * Diagnostic codes AX820–AX829 are reserved for this surface and are
 * documented in `docs/ERRORS.md`.
 */

import ts from "typescript";
import type { IRExtension, IRExtensionKind, IRExtensionTarget } from "./types.js";
import { ParserError } from "./parser.js";
import {
  findCallExpression,
  posOf,
  propertyMap,
  readStringArray,
  readStringLiteral,
} from "./parser-utils.js";

const EXTENSION_KINDS: ReadonlySet<IRExtensionKind> = new Set<IRExtensionKind>([
  "share",
  "action",
  "notificationService",
  "notificationContent",
]);

export function parseExtensionSource(
  source: string,
  filePath: string = "<stdin>"
): IRExtension {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findCallExpression(sourceFile, "defineExtension");
  if (!call) {
    throw new ParserError(
      "AX820",
      `No defineExtension() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineExtension({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX820",
      "defineExtension() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineExtension({ name, targets })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX821",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "MyExtensions"'
    );
  }

  const targets = parseTargets(props.get("targets"), filePath, sourceFile);

  return {
    name,
    targets,
    sourceFile: filePath,
  };
}

function parseTargets(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRExtensionTarget[] {
  if (!node) {
    throw new ParserError(
      "AX822",
      "Missing required field: targets",
      filePath,
      undefined,
      "Add a targets array: targets: [{ principalClass, kind, displayName }]"
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX823",
      "`targets` must be an array literal",
      filePath,
      posOf(sourceFile, node),
      'targets: [{ principalClass: "ShareHandler", kind: "share", displayName: "Share" }]'
    );
  }

  const out: IRExtensionTarget[] = [];
  for (const element of node.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX824",
        "Each target must be an object literal",
        filePath,
        posOf(sourceFile, element),
        '{ principalClass: "ShareHandler", kind: "share", displayName: "Share" }'
      );
    }

    const entryProps = propertyMap(element);

    const principalClass = readStringLiteral(entryProps.get("principalClass"));
    if (!principalClass) {
      throw new ParserError(
        "AX825",
        "Each target must declare a string `principalClass`",
        filePath,
        posOf(sourceFile, element),
        'principalClass: "ShareHandler"'
      );
    }

    const kindRaw = readStringLiteral(entryProps.get("kind"));
    if (!kindRaw) {
      throw new ParserError(
        "AX826",
        `Target "${principalClass}" is missing a string \`kind\``,
        filePath,
        posOf(sourceFile, element),
        'kind: "share" | "action" | "notificationService" | "notificationContent"'
      );
    }
    if (!(EXTENSION_KINDS as ReadonlySet<string>).has(kindRaw)) {
      throw new ParserError(
        "AX827",
        `Target "${principalClass}" has unknown kind "${kindRaw}"`,
        filePath,
        posOf(sourceFile, element),
        "Supported kinds: share, action, notificationService, notificationContent"
      );
    }
    const kind = kindRaw as IRExtensionKind;

    const displayName = readStringLiteral(entryProps.get("displayName"));
    if (!displayName) {
      throw new ParserError(
        "AX828",
        `Target "${principalClass}" is missing a string \`displayName\``,
        filePath,
        posOf(sourceFile, element),
        'displayName: "Share with MyApp"'
      );
    }

    const maxItemCount = readNumericLiteral(entryProps.get("maxItemCount"));

    const activationNode = entryProps.get("activationTypes");
    if (activationNode && !ts.isArrayLiteralExpression(activationNode)) {
      throw new ParserError(
        "AX829",
        `Target "${principalClass}" activationTypes must be an array of strings`,
        filePath,
        posOf(sourceFile, activationNode),
        'activationTypes: ["NSExtensionActivationSupportsImageWithMaxCount"]'
      );
    }
    const activationTypes = activationNode ? readStringArray(activationNode) : undefined;

    out.push({
      principalClass,
      kind,
      displayName,
      ...(maxItemCount !== undefined ? { maxItemCount } : {}),
      ...(activationTypes ? { activationTypes } : {}),
    });
  }

  return out;
}

function readNumericLiteral(node: ts.Node | undefined): number | undefined {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return undefined;
}
