/**
 * Axint DSL — Tokens
 *
 * The .axint authoring surface compiles to the same IR as the TS and Python
 * SDKs. The lexer produces the flat token stream defined here; the parser
 * consumes it. Whitespace (spaces, tabs, newlines) is never significant.
 *
 * Spans here are the *internal* form: byte offsets for fast source slicing
 * plus full start/end line/column pairs. The external protocol span shape
 * that the JSON diagnostic surface emits lives in `diagnostic.ts`; converting
 * between the two is a pure field-rename and happens at the diagnostic
 * boundary. Keeping the internal form lets the formatter, the error-snippet
 * printer, and the lowering stage work in byte offsets without going through
 * protocol-shape objects on every access.
 *
 * Every reserved word in grammar.md gets its own `TokenKind` so the parser
 * can branch on kind without re-checking lexemes.
 */

/** Every discrete kind the lexer can emit. */
export type TokenKind =
  // Structural punctuation
  | "LBRACE" // {
  | "RBRACE" // }
  | "LBRACKET" // [
  | "RBRACKET" // ]
  | "COLON" // :
  | "QUESTION" // ?

  // Top-level declaration keywords
  | "INTENT"
  | "ENTITY"
  | "ENUM"

  // Intent body keywords
  | "TITLE"
  | "DESCRIPTION"
  | "DOMAIN"
  | "CATEGORY"
  | "DISCOVERABLE"
  | "DONATE_ON_PERFORM"
  | "PARAM"
  | "SUMMARY"
  | "RETURNS"
  | "ENTITLEMENTS"
  | "INFO_PLIST_KEYS"

  // Entity body keywords
  | "DISPLAY"
  | "PROPERTY"
  | "QUERY"
  | "SUBTITLE"
  | "IMAGE"

  // Param / property body keywords
  | "DEFAULT"
  | "OPTIONS"
  | "DYNAMIC"

  // Summary keywords
  | "WHEN"
  | "THEN"
  | "OTHERWISE"
  | "SWITCH"
  | "CASE"

  // Reserved for v0.5 cross-file composition (grammar.md §Keywords)
  | "USE"
  | "FROM"

  // Primitive type keywords
  | "TYPE_STRING"
  | "TYPE_INT"
  | "TYPE_DOUBLE"
  | "TYPE_FLOAT"
  | "TYPE_BOOLEAN"
  | "TYPE_DATE"
  | "TYPE_DURATION"
  | "TYPE_URL"

  // Literals
  | "STRING_LITERAL"
  | "INTEGER_LITERAL"
  | "DECIMAL_LITERAL"
  | "TRUE"
  | "FALSE"

  // Identifiers (everything that isn't a keyword and matches the identifier
  // production).
  | "IDENTIFIER"

  // End of input.
  | "EOF"

  // Lexical failure: a character or sequence the lexer could not classify.
  // The lexer emits an UNKNOWN token with a span covering the offending
  // bytes and continues scanning. The parser treats it like a skipped
  // token and re-syncs at the next recovery boundary.
  | "UNKNOWN";

/**
 * Internal span used by every token and AST node.
 *
 * Byte offsets drive source slicing (error snippets, formatter round-trips).
 * Line/column pairs match what the protocol span exposes — emitting a
 * diagnostic is a shape-only transform: `{ start: { line: startLine, column:
 * startColumn }, end: { line: endLine, column: endColumn } }`.
 *
 * Line and column are 1-indexed. `endByte` and the end position are
 * exclusive — a zero-width span (start == end) marks an insertion point.
 */
export interface TokenSpan {
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface Token {
  readonly kind: TokenKind;
  readonly span: TokenSpan;
  /**
   * The lexeme, normalized where helpful:
   *   - STRING_LITERAL: decoded, escapes applied, outer quotes stripped.
   *   - INTEGER_LITERAL / DECIMAL_LITERAL: the raw numeric text (the
   *     parser knows the target type and does the coercion).
   *   - IDENTIFIER: the identifier text.
   *   - Everything else: the source lexeme (e.g. "{", "intent").
   */
  readonly value: string;
}

/**
 * Every lexeme that is a keyword rather than an identifier. Keys are the
 * source text; values are the token kind the lexer emits. Every entry is
 * pinned to the authoritative list in spec/language/grammar.md §Keywords.
 */
export const KEYWORDS: Readonly<Record<string, TokenKind>> = {
  intent: "INTENT",
  entity: "ENTITY",
  enum: "ENUM",

  title: "TITLE",
  description: "DESCRIPTION",
  domain: "DOMAIN",
  category: "CATEGORY",
  discoverable: "DISCOVERABLE",
  donateOnPerform: "DONATE_ON_PERFORM",
  param: "PARAM",
  summary: "SUMMARY",
  returns: "RETURNS",
  entitlements: "ENTITLEMENTS",
  infoPlistKeys: "INFO_PLIST_KEYS",

  display: "DISPLAY",
  property: "PROPERTY",
  query: "QUERY",
  subtitle: "SUBTITLE",
  image: "IMAGE",

  default: "DEFAULT",
  options: "OPTIONS",
  dynamic: "DYNAMIC",

  when: "WHEN",
  then: "THEN",
  otherwise: "OTHERWISE",
  switch: "SWITCH",
  case: "CASE",

  use: "USE",
  from: "FROM",

  string: "TYPE_STRING",
  int: "TYPE_INT",
  double: "TYPE_DOUBLE",
  float: "TYPE_FLOAT",
  boolean: "TYPE_BOOLEAN",
  date: "TYPE_DATE",
  duration: "TYPE_DURATION",
  url: "TYPE_URL",

  true: "TRUE",
  false: "FALSE",
};

/** Token kinds that correspond to a primitive type. */
export const PRIMITIVE_TYPE_KINDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "TYPE_STRING",
  "TYPE_INT",
  "TYPE_DOUBLE",
  "TYPE_FLOAT",
  "TYPE_BOOLEAN",
  "TYPE_DATE",
  "TYPE_DURATION",
  "TYPE_URL",
]);
