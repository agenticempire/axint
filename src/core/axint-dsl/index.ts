/**
 * Axint DSL — public entry point
 *
 * The `.axint` authoring surface. One call takes source text and returns
 * an AST plus a flat diagnostic stream; downstream the AST lowers to the
 * same IRIntent / IREntity shape the TS and Python SDKs produce.
 *
 * See spec/language/ under the repo root for the full specification.
 */

export { parse } from "./parser.js";
export type { ParseResult, ParseOptions } from "./parser.js";

export { tokenize } from "./lexer.js";
export type { LexResult } from "./lexer.js";

export type { Token, TokenKind, TokenSpan } from "./token.js";
export { KEYWORDS, PRIMITIVE_TYPE_KINDS } from "./token.js";

export type {
  Diagnostic,
  DiagnosticSeverity,
  Fix,
  FixKind,
  Position,
  Span,
} from "./diagnostic.js";
export { DIAGNOSTIC_SCHEMA_VERSION } from "./diagnostic.js";

export type {
  // File + declarations
  FileNode,
  TopLevelDecl,
  // Identifiers + literals
  Ident,
  LiteralNode,
  StringLiteral,
  IntegerLiteral,
  DecimalLiteral,
  BooleanLiteral,
  IdentLiteral,
  // Types
  TypeNode,
  PrimitiveType,
  PrimitiveKind,
  ArrayType,
  NamedType,
  OptionalType,
  ReturnTypeNode,
  ReturnArrayType,
  // Enum
  EnumDecl,
  // Entity
  EntityDecl,
  DisplayBlock,
  DisplayPropertyRef,
  DisplayImage,
  PropertyDecl,
  QueryClause,
  // Intent
  IntentDecl,
  MetaClause,
  ParamDecl,
  DynamicOptions,
  ReturnsClause,
  EntitlementsBlock,
  InfoPlistBlock,
  InfoPlistEntry,
  // Summary
  SummaryDecl,
  SummaryTemplate,
  SummaryWhen,
  SummarySwitch,
  SummaryCase,
  SummaryValue,
} from "./ast.js";
