/**
 * Axint Parser
 *
 * Parses TypeScript intent definitions (using the defineIntent() API)
 * into the Axint Intermediate Representation (IR).
 *
 * Approach: We read the TypeScript source, look for `defineIntent({...})`
 * calls, and extract the name, title, description, domain, and params
 * from the object literal argument.
 */

import type { IRIntent, IRParameter, IRType, IRPrimitiveType } from "./types.js";

/** Supported param.* type names */
const PARAM_TYPE_SET = new Set<string>([
  "string",
  "number",
  "boolean",
  "date",
  "duration",
  "url",
]);

/**
 * Parse a TypeScript source file containing a defineIntent() call
 * and return the IR representation.
 */
export function parseIntentSource(
  source: string,
  filePath: string = "<stdin>"
): IRIntent {
  // Extract the object literal passed to defineIntent({...})
  const defineMatch = source.match(
    /defineIntent\s*\(\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/m
  );
  if (!defineMatch) {
    throw new ParserError(
      "AX001",
      `No defineIntent() call found in ${filePath}`,
      filePath,
      undefined,
      "Ensure your file exports a defineIntent({...}) call."
    );
  }

  const body = defineMatch[1];

  // Extract simple string fields
  const name = extractStringField(body, "name");
  const title = extractStringField(body, "title");
  const description = extractStringField(body, "description");
  const domain = extractStringField(body, "domain", false);
  const category = extractStringField(body, "category", false);

  if (!name) {
    throw new ParserError(
      "AX002",
      "Missing required field: name",
      filePath,
      undefined,
      'Add a name field: name: "MyIntent"'
    );
  }
  if (!title) {
    throw new ParserError(
      "AX003",
      "Missing required field: title",
      filePath,
      undefined,
      'Add a title field: title: "My Intent Title"'
    );
  }
  if (!description) {
    throw new ParserError(
      "AX004",
      "Missing required field: description",
      filePath,
      undefined,
      'Add a description field: description: "What this intent does"'
    );
  }

  // Extract params block
  const parameters = extractParams(body, filePath);

  return {
    name,
    title,
    description,
    domain: domain || undefined,
    category: category || undefined,
    parameters,
    returnType: { kind: "primitive", value: "string" },
    sourceFile: filePath,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractStringField(
  body: string,
  field: string,
  required: boolean = true
): string | null {
  // Match: fieldName: "value" — handle each quote type separately to allow
  // the other quote types inside the string (e.g., apostrophes in double-quoted strings)
  const doubleQuoteRegex = new RegExp(`${field}\\s*:\\s*"([^"]*)"` );
  const singleQuoteRegex = new RegExp(`${field}\\s*:\\s*'([^']*)'`);
  const backtickRegex = new RegExp(`${field}\\s*:\\s*\`([^\`]*)\``);

  const match =
    body.match(doubleQuoteRegex) ||
    body.match(singleQuoteRegex) ||
    body.match(backtickRegex);
  return match ? match[1] : null;
}

function extractParams(body: string, filePath: string): IRParameter[] {
  // Find the params: { ... } block
  const paramsMatch = body.match(/params\s*:\s*\{([\s\S]*?)\}\s*,?\s*(?:perform|$)/);
  if (!paramsMatch) return [];

  const paramsBody = paramsMatch[1];
  const params: IRParameter[] = [];

  // Match each param: param.type("description", { ...config })
  const paramRegex =
    /(\w+)\s*:\s*param\.(\w+)\s*\(\s*["'`]([^"'`]*)["'`](?:\s*,\s*\{([^}]*)\})?\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(paramsBody)) !== null) {
    const [, paramName, typeName, desc, configStr] = match;

    if (!PARAM_TYPE_SET.has(typeName)) {
      throw new ParserError(
        "AX005",
        `Unknown param type: param.${typeName}`,
        filePath,
        undefined,
        `Supported types: ${[...PARAM_TYPE_SET].join(", ")}`
      );
    }

    const isOptional = configStr
      ? /required\s*:\s*false/.test(configStr)
      : false;

    const defaultMatch = configStr?.match(/default\s*:\s*(.+?)(?:,|\s*$)/);
    const defaultValue = defaultMatch ? parseDefault(defaultMatch[1].trim()) : undefined;

    const irType: IRType = isOptional
      ? { kind: "optional", innerType: { kind: "primitive", value: typeName as IRPrimitiveType } }
      : { kind: "primitive", value: typeName as IRPrimitiveType };

    params.push({
      name: paramName,
      type: irType,
      title: capitalize(paramName.replace(/([A-Z])/g, " $1").trim()),
      description: desc,
      isOptional,
      defaultValue,
    });
  }

  return params;
}

function parseDefault(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Strip quotes for string defaults
  const strMatch = value.match(/^["'`](.*)["'`]$/);
  if (strMatch) return strMatch[1];
  return value;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Error Class ─────────────────────────────────────────────────────

export class ParserError extends Error {
  constructor(
    public code: string,
    message: string,
    public file: string,
    public line?: number,
    public suggestion?: string
  ) {
    super(message);
    this.name = "ParserError";
  }

  format(): string {
    let output = `\n  error[${this.code}]: ${this.message}\n`;
    if (this.file) output += `    --> ${this.file}`;
    if (this.line) output += `:${this.line}`;
    output += "\n";
    if (this.suggestion) {
      output += `    = help: ${this.suggestion}\n`;
    }
    return output;
  }
}
