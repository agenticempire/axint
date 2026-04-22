/**
 * Axint App Enum Parser
 *
 * Parses a `defineAppEnum()` call into an `IRAppEnum`. App Enums
 * become Swift `enum: String, AppEnum` with a matching
 * `typeDisplayRepresentation` and `caseDisplayRepresentations` —
 * the shape Apple requires for Shortcuts and Siri parameter types.
 *
 * Diagnostic codes AX780–AX789 are reserved for this surface and are
 * documented in `docs/ERRORS.md`.
 */

import ts from "typescript";
import type { IRAppEnum, IRAppEnumCase } from "./types.js";
import { ParserError } from "./parser.js";
import {
  findCallExpression,
  posOf,
  propertyMap,
  readStringLiteral,
} from "./parser-utils.js";

export function parseAppEnumSource(
  source: string,
  filePath: string = "<stdin>"
): IRAppEnum {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const call = findCallExpression(sourceFile, "defineAppEnum");
  if (!call) {
    throw new ParserError(
      "AX780",
      `No defineAppEnum() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file contains a `defineAppEnum({ ... })` call."
    );
  }

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new ParserError(
      "AX780",
      "defineAppEnum() must be called with an object literal",
      filePath,
      posOf(sourceFile, call),
      "Pass an object: defineAppEnum({ name, title, cases })"
    );
  }

  const props = propertyMap(arg);

  const name = readStringLiteral(props.get("name"));
  if (!name) {
    throw new ParserError(
      "AX781",
      "Missing required field: name",
      filePath,
      posOf(sourceFile, arg),
      'Add a name field: name: "PizzaSize"'
    );
  }

  const title = readStringLiteral(props.get("title")) ?? name;
  const cases = parseCases(props.get("cases"), filePath, sourceFile);

  if (cases.length === 0) {
    throw new ParserError(
      "AX782",
      "App Enum must declare at least one case",
      filePath,
      posOf(sourceFile, arg),
      'cases: [{ value: "small", title: "Small" }]'
    );
  }

  return {
    name,
    title,
    cases,
    sourceFile: filePath,
  };
}

function parseCases(
  node: ts.Node | undefined,
  filePath: string,
  sourceFile: ts.SourceFile
): IRAppEnumCase[] {
  if (!node) {
    throw new ParserError(
      "AX783",
      "Missing required field: cases",
      filePath,
      undefined,
      "Add a cases array: cases: [{ value, title }, ...]"
    );
  }
  if (!ts.isArrayLiteralExpression(node)) {
    throw new ParserError(
      "AX783",
      "`cases` must be an array literal",
      filePath,
      posOf(sourceFile, node),
      'cases: [{ value: "small", title: "Small" }]'
    );
  }

  const out: IRAppEnumCase[] = [];
  for (const element of node.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new ParserError(
        "AX784",
        "Each case must be an object literal",
        filePath,
        posOf(sourceFile, element),
        '{ value: "small", title: "Small" }'
      );
    }

    const caseProps = propertyMap(element);
    const value = readStringLiteral(caseProps.get("value"));
    if (!value) {
      throw new ParserError(
        "AX785",
        "Each case must have a string `value`",
        filePath,
        posOf(sourceFile, element),
        'value: "small"'
      );
    }

    const title = readStringLiteral(caseProps.get("title"));
    if (!title) {
      throw new ParserError(
        "AX786",
        `Case "${value}" is missing a string \`title\``,
        filePath,
        posOf(sourceFile, element),
        'title: "Small"'
      );
    }

    const image = readStringLiteral(caseProps.get("image")) ?? undefined;
    out.push({ value, title, ...(image ? { image } : {}) });
  }

  return out;
}
