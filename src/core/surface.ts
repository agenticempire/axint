/**
 * Detects which Apple surface a TypeScript source file targets by
 * scanning for its top-level `define*` call. One surface per file is
 * the documented contract — if a file accidentally mixes two, the
 * first one encountered wins and the rest are reported separately by
 * each parser's own diagnostics.
 */

import ts from "typescript";

export type Surface = "intent" | "view" | "widget" | "app" | "liveActivity" | "appEnum";

const DEFINE_TO_SURFACE: Readonly<Record<string, Surface>> = {
  defineIntent: "intent",
  defineView: "view",
  defineWidget: "widget",
  defineApp: "app",
  defineLiveActivity: "liveActivity",
  defineAppEnum: "appEnum",
};

export function detectSurface(
  source: string,
  fileName: string = "<stdin>"
): Surface | null {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let surface: Surface | null = null;

  const visit = (node: ts.Node): void => {
    if (surface) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const match = DEFINE_TO_SURFACE[node.expression.text];
      if (match) {
        surface = match;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return surface;
}
