/**
 * Parser for defineUnionValue() definitions.
 *
 * A UnionValue compiles to Apple's @UnionValue enum surface, used by
 * App Intents when one parameter can accept several concrete value types.
 */

import ts from "typescript";
import type { IRUnionValue, IRUnionValueCase } from "./types.js";
import { ParserError } from "./parser.js";
import {
  findCallExpression,
  posOf,
  propertyMap,
  readStringLiteral,
} from "./parser-utils.js";

export function parseUnionValueSource(
  source: string,
  filePath: string = "<stdin>"
): IRUnionValue {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findCallExpression(sourceFile, "defineUnionValue");
  if (!call) {
    throw new ParserError(
      "AX810",
      `No defineUnionValue() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineUnionValue({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX810",
      "defineUnionValue() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineUnionValue({ name, title, cases })"
    );
  }

  const props = propertyMap(arg);
  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX811",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "SearchTarget"'
    );
  }

  return {
    name,
    title: readStringLiteral(props.get("title")) ?? undefined,
    cases: parseCases(props.get("cases"), filePath, sourceFile),
    sourceFile: filePath,
  };
}

function parseCases(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRUnionValueCase[] {
  if (!node) {
    throw new ParserError(
      "AX812",
      "Missing required field: cases",
      filePath,
      undefined,
      'Add cases: [{ name: "query", type: "String", title: "Query" }]'
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX812",
      "`cases` must be an array literal",
      filePath,
      posOf(sourceFile, node),
      'cases: [{ name: "query", type: "String", title: "Query" }]'
    );
  }

  return node.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX813",
        "Each UnionValue case must be an object literal",
        filePath,
        posOf(sourceFile, element)
      );
    }

    const props = propertyMap(element);
    const name = readStringLiteral(props.get("name"));
    const swiftType = readStringLiteral(props.get("type"));
    const title = readStringLiteral(props.get("title"));
    if (!name || !swiftType || !title) {
      throw new ParserError(
        "AX814",
        "Each UnionValue case requires string name, type, and title fields",
        filePath,
        posOf(sourceFile, element)
      );
    }

    const image = readStringLiteral(props.get("image")) ?? undefined;
    return { name, swiftType, title, ...(image ? { image } : {}) };
  });
}
