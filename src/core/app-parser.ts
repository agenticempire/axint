/**
 * Axint App Parser
 *
 * Parses TypeScript app definitions (using the defineApp() API)
 * into the Axint IRApp representation.
 *
 * Same approach as the view/widget parsers: real TS compiler API AST walker.
 */

import ts from "typescript";
import type { IRApp, IRScene, IRPrimitiveType, SceneKind } from "./types.js";
import { ParserError } from "./parser.js";

/**
 * Parse a TypeScript source file containing a defineApp() call
 * and return the IRApp representation.
 */
export function parseAppSource(source: string, filePath: string = "<stdin>"): IRApp {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findDefineAppCall(sourceFile);
  if (!call) {
    throw new ParserError(
      "AX501",
      `No defineApp() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineApp({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX501",
      "defineApp() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineApp({ name, scenes: [...] })"
    );
  }

  const name = extractStringProp(arg, "name", sourceFile, filePath);
  if (!name) {
    throw new ParserError(
      "AX502",
      "defineApp() requires a `name` property",
      filePath,
      posOf(sourceFile, arg),
      'Add a name: defineApp({ name: "MyApp", ... })'
    );
  }

  const scenesProp = findProp(arg, "scenes");
  if (!scenesProp || !ts.isArrayLiteralExpression(scenesProp)) {
    throw new ParserError(
      "AX503",
      "defineApp() requires a `scenes` array",
      filePath,
      posOf(sourceFile, arg),
      "Add scenes: defineApp({ name, scenes: [scene.windowGroup(...)] })"
    );
  }

  const scenes = parseScenes(scenesProp, sourceFile, filePath);

  // Parse optional appStorage
  const storageProp = findProp(arg, "appStorage");
  let appStorage: IRApp["appStorage"];
  if (storageProp && ts.isObjectLiteralExpression(storageProp)) {
    appStorage = parseAppStorage(storageProp, sourceFile, filePath);
  }

  return {
    name,
    scenes,
    appStorage,
    sourceFile: filePath,
  };
}

function parseScenes(
  arr: ts.ArrayLiteralExpression,
  sourceFile: ts.SourceFile,
  filePath: string
): IRScene[] {
  const scenes: IRScene[] = [];

  for (const element of arr.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX504",
        "Each scene must be an object literal",
        filePath,
        posOf(sourceFile, element),
        "Use: { kind: 'windowGroup', view: 'ContentView' }"
      );
    }

    const kind = extractStringProp(element, "kind", sourceFile, filePath) as
      | SceneKind
      | undefined;
    if (!kind || !isValidSceneKind(kind)) {
      throw new ParserError(
        "AX505",
        `Invalid scene kind: "${kind}". Must be one of: windowGroup, window, documentGroup, settings`,
        filePath,
        posOf(sourceFile, element),
        'Use kind: "windowGroup" or kind: "settings"'
      );
    }

    const rootView = extractStringProp(element, "view", sourceFile, filePath);
    if (!rootView) {
      throw new ParserError(
        "AX506",
        "Each scene requires a `view` property referencing the root SwiftUI view",
        filePath,
        posOf(sourceFile, element),
        'Add view: "ContentView"'
      );
    }

    const title = extractStringProp(element, "title", sourceFile, filePath);
    const sceneName = extractStringProp(element, "name", sourceFile, filePath);
    const platformGuard = extractStringProp(element, "platform", sourceFile, filePath) as
      | "macOS"
      | "iOS"
      | "visionOS"
      | undefined;

    scenes.push({
      sceneKind: kind,
      rootView,
      title,
      name: sceneName,
      platformGuard,
      isDefault: scenes.length === 0 && kind === "windowGroup",
    });
  }

  return scenes;
}

function parseAppStorage(
  obj: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  _filePath: string
): IRApp["appStorage"] {
  const storage: NonNullable<IRApp["appStorage"]> = [];

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

    const name = prop.name.text;

    if (ts.isCallExpression(prop.initializer)) {
      const callText = prop.initializer.expression.getText(sourceFile);
      const typeMatch = callText.match(
        /storage\.(string|int|double|float|boolean|date|url)/
      );
      if (typeMatch) {
        const typeStr = typeMatch[1] as IRPrimitiveType;
        const args = prop.initializer.arguments;
        const key = args.length > 0 && ts.isStringLiteral(args[0]) ? args[0].text : name;
        let defaultValue: unknown;
        if (args.length > 1) {
          defaultValue = evalLiteral(args[1]);
        }

        storage.push({
          name,
          key,
          type: { kind: "primitive", value: typeStr },
          defaultValue,
        });
      }
    }
  }

  return storage.length > 0 ? storage : undefined;
}

function isValidSceneKind(kind: string): kind is SceneKind {
  return ["windowGroup", "window", "documentGroup", "settings"].includes(kind);
}

// ─── AST Helpers ────────────────────────────────────────────────────

function findDefineAppCall(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
  let result: ts.CallExpression | undefined;

  function visit(node: ts.Node) {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "defineApp"
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return result;
}

function findProp(
  obj: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === name
    ) {
      return prop.initializer;
    }
  }
  return undefined;
}

function extractStringProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
  _sourceFile: ts.SourceFile,
  _filePath: string
): string | undefined {
  const init = findProp(obj, name);
  if (!init) return undefined;
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    return init.text;
  }
  return undefined;
}

function posOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function evalLiteral(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}
