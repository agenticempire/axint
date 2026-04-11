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
import {
  propertyMap,
  propertyKeyName,
  readStringLiteral,
  evaluateLiteral,
  posOf,
  findCallExpression,
} from "./parser-utils.js";

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

  const call = findCallExpression(sourceFile, "defineApp");
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

  const argProps = propertyMap(arg);
  const scenesProp = argProps.get("scenes");
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
  const storageProp = argProps.get("appStorage");
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
          defaultValue = evaluateLiteral(args[1]);
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



function extractStringProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
  _sourceFile: ts.SourceFile,
  _filePath: string
): string | undefined {
  const props = propertyMap(obj);
  const val = props.get(name);
  return val ? readStringLiteral(val) ?? undefined : undefined;
}

