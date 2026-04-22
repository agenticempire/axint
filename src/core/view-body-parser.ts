/**
 * Shared `view.*` helper parsing for surfaces that embed a view body
 * inside a bigger DSL object (currently Live Activities, and eventually
 * the rest of the surfaces once this consolidation lands).
 *
 * Produces `ViewBodyNode[]` so the output plugs straight into the
 * existing SwiftUI generator helpers.
 */

import ts from "typescript";
import type { ViewBodyNode } from "./types.js";
import { ParserError } from "./parser.js";
import { posOf, propertyMap, readStringLiteral } from "./parser-utils.js";

export function parseViewBodyArray(
  node: ts.Node | undefined,
  label: string,
  filePath: string,
  sourceFile: ts.SourceFile,
  missingCode: string
): ViewBodyNode[] {
  if (!node) return [];
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      missingCode,
      `\`${label}\` must be an array literal`,
      filePath,
      posOf(sourceFile, node)
    );
  }
  return node.elements.map((el) => parseViewHelper(el, label, filePath, sourceFile));
}

function parseViewHelper(
  expr: ts.Expression,
  label: string,
  filePath: string,
  sourceFile: ts.SourceFile
): ViewBodyNode {
  if (
    !ts.isCallExpression(expr) ||
    !ts.isPropertyAccessExpression(expr.expression) ||
    !ts.isIdentifier(expr.expression.expression) ||
    expr.expression.expression.text !== "view"
  ) {
    throw new ParserError(
      "AX762",
      `${label} entries must use view.* helpers`,
      filePath,
      posOf(sourceFile, expr),
      "Use view.text(...), view.vstack([...]), view.hstack([...]), view.image({...}), etc."
    );
  }

  const kind = expr.expression.name.text;
  const args = expr.arguments;

  switch (kind) {
    case "text": {
      return { kind: "text", content: readStringLiteral(args[0]) ?? "" };
    }

    case "image": {
      if (args[0] && ts.isObjectLiteralExpression(args[0])) {
        const imgProps = propertyMap(args[0]);
        return {
          kind: "image",
          systemName: readStringLiteral(imgProps.get("systemName")) ?? undefined,
          name: readStringLiteral(imgProps.get("name")) ?? undefined,
        };
      }
      return { kind: "image" };
    }

    case "button": {
      const buttonLabel = readStringLiteral(args[0]) ?? "Button";
      const action = args[1] ? readStringLiteral(args[1]) : undefined;
      return { kind: "button", label: buttonLabel, action: action ?? undefined };
    }

    case "spacer":
      return { kind: "spacer" };

    case "divider":
      return { kind: "divider" };

    case "vstack":
    case "hstack":
    case "zstack": {
      const children =
        args[0] && ts.isArrayLiteralExpression(args[0])
          ? args[0].elements.map((el) => parseViewHelper(el, label, filePath, sourceFile))
          : [];
      let spacing: number | undefined;
      let alignment: string | undefined;
      if (args[1] && ts.isObjectLiteralExpression(args[1])) {
        const opts = propertyMap(args[1]);
        const spacingExpr = opts.get("spacing");
        if (spacingExpr && ts.isNumericLiteral(spacingExpr)) {
          spacing = Number(spacingExpr.text);
        }
        alignment = readStringLiteral(opts.get("alignment")) ?? undefined;
      }
      if (kind === "zstack") {
        return { kind: "zstack", alignment, children };
      }
      return { kind, spacing, alignment, children };
    }

    case "foreach": {
      const collection = readStringLiteral(args[0]) ?? "";
      const itemName = readStringLiteral(args[1]) ?? "item";
      const body =
        args[2] && ts.isArrayLiteralExpression(args[2])
          ? args[2].elements.map((el) => parseViewHelper(el, label, filePath, sourceFile))
          : [];
      return { kind: "foreach", collection, itemName, body };
    }

    case "conditional": {
      const condition = readStringLiteral(args[0]) ?? "true";
      const then =
        args[1] && ts.isArrayLiteralExpression(args[1])
          ? args[1].elements.map((el) => parseViewHelper(el, label, filePath, sourceFile))
          : [];
      const elseChildren =
        args[2] && ts.isArrayLiteralExpression(args[2])
          ? args[2].elements.map((el) => parseViewHelper(el, label, filePath, sourceFile))
          : undefined;
      return { kind: "conditional", condition, then, else: elseChildren };
    }

    case "raw": {
      return { kind: "raw", swift: readStringLiteral(args[0]) ?? "" };
    }

    default:
      throw new ParserError(
        "AX763",
        `Unknown view helper: view.${kind}`,
        filePath,
        posOf(sourceFile, expr),
        "Supported here: text, image, button, spacer, divider, vstack, hstack, zstack, foreach, conditional, raw"
      );
  }
}
