import { describe, expect, it } from "vitest";
import { tokenize } from "../../../src/core/axint-dsl/index.js";

describe("axint-dsl lexer", () => {
  it("skips whitespace and line comments", () => {
    const { tokens, diagnostics } = tokenize(`# leading
intent  Foo  { }  # trailing
`);
    expect(diagnostics).toHaveLength(0);
    expect(tokens.map((t) => t.kind)).toEqual([
      "INTENT",
      "IDENTIFIER",
      "LBRACE",
      "RBRACE",
      "EOF",
    ]);
  });

  it("emits all six punctuation kinds", () => {
    const { tokens } = tokenize("{ } [ ] : ?");
    expect(tokens.slice(0, 6).map((t) => t.kind)).toEqual([
      "LBRACE",
      "RBRACE",
      "LBRACKET",
      "RBRACKET",
      "COLON",
      "QUESTION",
    ]);
  });

  it("distinguishes keywords from identifiers by exact spelling", () => {
    const { tokens } = tokenize("intent intents Intent domain domains");
    expect(tokens.map((t) => t.kind).slice(0, 5)).toEqual([
      "INTENT",
      "IDENTIFIER",
      "IDENTIFIER",
      "DOMAIN",
      "IDENTIFIER",
    ]);
  });

  it("classifies numbers, decimals, and negatives", () => {
    const { tokens } = tokenize("42 3.14 -7 -0.5");
    const real = tokens.filter((t) => t.kind !== "EOF");
    expect(real.map((t) => [t.kind, t.value])).toEqual([
      ["INTEGER_LITERAL", "42"],
      ["DECIMAL_LITERAL", "3.14"],
      ["INTEGER_LITERAL", "-7"],
      ["DECIMAL_LITERAL", "-0.5"],
    ]);
  });

  it("decodes string escapes and strips outer quotes", () => {
    const { tokens, diagnostics } = tokenize(String.raw`"a\nb\t\"c\\"`);
    expect(diagnostics).toHaveLength(0);
    expect(tokens[0]?.kind).toBe("STRING_LITERAL");
    expect(tokens[0]?.value).toBe('a\nb\t"c\\');
  });

  it("reports unterminated string literals as AX007", () => {
    const { tokens, diagnostics } = tokenize('"oops');
    expect(tokens[0]?.kind).toBe("STRING_LITERAL");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("AX007");
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.fix).toBeNull();
  });

  it("reports unknown escapes as AX007 but keeps the char for recovery", () => {
    const { tokens, diagnostics } = tokenize(String.raw`"bad \q esc"`);
    expect(tokens[0]?.value).toBe("bad q esc");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("AX007");
  });

  it("emits UNKNOWN tokens for unrecognized bytes without throwing", () => {
    const { tokens, diagnostics } = tokenize("@");
    expect(tokens[0]?.kind).toBe("UNKNOWN");
    expect(diagnostics[0]?.code).toBe("AX007");
  });

  it("tracks line and column across newlines", () => {
    const { tokens } = tokenize("foo\n  bar");
    const foo = tokens.find((t) => t.value === "foo")!;
    const bar = tokens.find((t) => t.value === "bar")!;
    expect(foo.span.startLine).toBe(1);
    expect(foo.span.startColumn).toBe(1);
    expect(bar.span.startLine).toBe(2);
    expect(bar.span.startColumn).toBe(3);
    expect(bar.span.endColumn).toBe(6);
  });

  it("always terminates with a zero-width EOF token", () => {
    const { tokens } = tokenize("");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe("EOF");
    const span = tokens[0]!.span;
    expect(span.startByte).toBe(span.endByte);
    expect(span.startLine).toBe(span.endLine);
    expect(span.startColumn).toBe(span.endColumn);
  });

  it("skips a leading UTF-8 BOM", () => {
    const { tokens, diagnostics } = tokenize("\uFEFFintent");
    expect(diagnostics).toHaveLength(0);
    expect(tokens[0]?.kind).toBe("INTENT");
  });
});
