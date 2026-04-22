import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  KEYWORDS,
  PRIMITIVE_TYPE_KINDS,
  parse,
  tokenize,
} from "../../../src/core/axint-dsl/index.js";

describe("axint-dsl skeleton", () => {
  it("pins diagnostic schema to version 1", () => {
    expect(DIAGNOSTIC_SCHEMA_VERSION).toBe(1);
  });

  it("registers every keyword from grammar.md", () => {
    // Every reserved word in spec/language/grammar.md §Keywords. A missing
    // entry means the lexer would parse that word as an identifier.
    const expected = [
      "intent",
      "entity",
      "enum",
      "param",
      "property",
      "summary",
      "display",
      "query",
      "title",
      "description",
      "domain",
      "category",
      "default",
      "options",
      "dynamic",
      "case",
      "when",
      "then",
      "otherwise",
      "switch",
      "string",
      "int",
      "double",
      "float",
      "boolean",
      "date",
      "duration",
      "url",
      "true",
      "false",
      "entitlements",
      "infoPlistKeys",
      "discoverable",
      "donateOnPerform",
      "returns",
      "subtitle",
      "image",
      "use",
      "from",
    ] as const;

    for (const word of expected) {
      expect(KEYWORDS[word], `missing keyword: ${word}`).toBeDefined();
    }
  });

  it("classifies every primitive type keyword", () => {
    const primitives = [
      "TYPE_STRING",
      "TYPE_INT",
      "TYPE_DOUBLE",
      "TYPE_FLOAT",
      "TYPE_BOOLEAN",
      "TYPE_DATE",
      "TYPE_DURATION",
      "TYPE_URL",
    ] as const;
    for (const kind of primitives) {
      expect(PRIMITIVE_TYPE_KINDS.has(kind)).toBe(true);
    }
  });

  it("tokenizes a trivial intent header to EOF", () => {
    const { tokens, diagnostics } = tokenize("intent Foo {}");
    expect(diagnostics).toHaveLength(0);
    expect(tokens.map((t) => t.kind)).toEqual([
      "INTENT",
      "IDENTIFIER",
      "LBRACE",
      "RBRACE",
      "EOF",
    ]);
  });

  it("returns an empty file with zero diagnostics for an empty source", () => {
    const { file, diagnostics } = parse("");
    expect(file.declarations).toHaveLength(0);
    expect(diagnostics).toHaveLength(0);
  });
});
