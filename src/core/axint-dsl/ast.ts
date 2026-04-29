/**
 * Axint DSL — AST nodes
 *
 * One node per production in spec/language/grammar.md. The parser emits a
 * tree of these; the lowering stage walks the tree and produces IRIntent /
 * IREntity (see spec/language/ir-mapping.md). Every node carries a span so
 * diagnostics can point to any subtree.
 *
 * Shape rule: fields that are syntactically required live as non-optional
 * properties; fields that are syntactically optional are typed as `T | undefined`
 * via the `?:` modifier. This makes the parser's output self-documenting —
 * if a required field is missing, the parser didn't produce an AST node at
 * all and surfaced a diagnostic instead.
 */

import type { TokenSpan } from "./token.js";

// ─── File ────────────────────────────────────────────────────────────

export interface FileNode {
  readonly kind: "File";
  readonly span: TokenSpan;
  readonly declarations: readonly TopLevelDecl[];
}

export type TopLevelDecl = IntentDecl | EntityDecl | EnumDecl | PageDecl;

// ─── Identifier ──────────────────────────────────────────────────────

export interface Ident {
  readonly kind: "Ident";
  readonly span: TokenSpan;
  readonly name: string;
}

// ─── Literals ────────────────────────────────────────────────────────

export type LiteralNode =
  | StringLiteral
  | IntegerLiteral
  | DecimalLiteral
  | BooleanLiteral
  | IdentLiteral;

export interface StringLiteral {
  readonly kind: "StringLiteral";
  readonly span: TokenSpan;
  /** Decoded value with escapes applied. */
  readonly value: string;
}

export interface IntegerLiteral {
  readonly kind: "IntegerLiteral";
  readonly span: TokenSpan;
  readonly value: number;
}

export interface DecimalLiteral {
  readonly kind: "DecimalLiteral";
  readonly span: TokenSpan;
  readonly value: number;
}

export interface BooleanLiteral {
  readonly kind: "BooleanLiteral";
  readonly span: TokenSpan;
  readonly value: boolean;
}

/**
 * An identifier used as a literal. Grammar rule: only valid as a `case`
 * value in a `summary switch` where it refers to an enum case. An unknown
 * enum case is rejected at validation time as AX106 (replace_literal).
 * AX109 is a different diagnostic — it fires when a switch is missing a
 * default or is non-exhaustive over the enum.
 */
export interface IdentLiteral {
  readonly kind: "IdentLiteral";
  readonly span: TokenSpan;
  readonly name: string;
}

// ─── Types ───────────────────────────────────────────────────────────

export type TypeNode = PrimitiveType | ArrayType | NamedType | OptionalType;

export type PrimitiveKind =
  | "string"
  | "int"
  | "double"
  | "float"
  | "boolean"
  | "date"
  | "duration"
  | "url";

export interface PrimitiveType {
  readonly kind: "PrimitiveType";
  readonly span: TokenSpan;
  readonly primitive: PrimitiveKind;
}

export interface ArrayType {
  readonly kind: "ArrayType";
  readonly span: TokenSpan;
  readonly element: TypeNode;
}

/** Reference to a declared entity or enum in the same file. */
export interface NamedType {
  readonly kind: "NamedType";
  readonly span: TokenSpan;
  readonly name: string;
}

export interface OptionalType {
  readonly kind: "OptionalType";
  readonly span: TokenSpan;
  readonly inner: TypeNode;
}

/**
 * Narrower than `TypeNode` — `returns: T?` is forbidden in v1 (see
 * grammar.md on `return-type`). An array wraps a single atom; no nested
 * arrays, no optionals.
 */
export type ReturnTypeNode = PrimitiveType | NamedType | ReturnArrayType;

export interface ReturnArrayType {
  readonly kind: "ReturnArrayType";
  readonly span: TokenSpan;
  readonly element: PrimitiveType | NamedType;
}

// ─── Enum ────────────────────────────────────────────────────────────

export interface EnumDecl {
  readonly kind: "EnumDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly cases: readonly Ident[];
}

// ─── Entity ──────────────────────────────────────────────────────────

export interface EntityDecl {
  readonly kind: "EntityDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly display: DisplayBlock;
  readonly properties: readonly PropertyDecl[];
  readonly query: QueryClause;
}

export interface DisplayBlock {
  readonly kind: "DisplayBlock";
  readonly span: TokenSpan;
  readonly title: DisplayPropertyRef;
  readonly subtitle?: DisplayPropertyRef;
  readonly image?: DisplayImage;
}

/** `title: propName` or `subtitle: propName`. Target is a bare identifier. */
export interface DisplayPropertyRef {
  readonly kind: "DisplayPropertyRef";
  readonly span: TokenSpan;
  readonly field: "title" | "subtitle";
  readonly property: Ident;
}

/** `image: "sf.symbol.name"`. Target is a quoted string literal. */
export interface DisplayImage {
  readonly kind: "DisplayImage";
  readonly span: TokenSpan;
  readonly asset: StringLiteral;
}

export interface PropertyDecl {
  readonly kind: "PropertyDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly type: TypeNode;
  readonly description: StringLiteral;
}

export interface QueryClause {
  readonly kind: "QueryClause";
  readonly span: TokenSpan;
  readonly queryKind: "all" | "id" | "string" | "property";
}

// ─── Public Page ─────────────────────────────────────────────────────

/**
 * A custom front-facing project/profile page. This is intentionally a safe
 * manifest, not arbitrary web code: authors declare modules and fields that a
 * host app can render inside its own sandbox.
 */
export interface PageDecl {
  readonly kind: "PageDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly fields: readonly PageFieldDecl[];
  readonly modules: readonly PageModuleDecl[];
}

export interface PageFieldDecl {
  readonly kind: "PageFieldDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly value: LiteralNode;
}

export interface PageModuleDecl {
  readonly kind: "PageModuleDecl";
  readonly span: TokenSpan;
  readonly id: Ident;
  readonly title: StringLiteral;
  readonly fields: readonly PageFieldDecl[];
}

// ─── Intent ──────────────────────────────────────────────────────────

export interface IntentDecl {
  readonly kind: "IntentDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly title: StringLiteral;
  readonly description: StringLiteral;
  readonly meta: readonly MetaClause[];
  readonly params: readonly ParamDecl[];
  readonly summary?: SummaryDecl;
  readonly returns?: ReturnsClause;
  readonly entitlements?: EntitlementsBlock;
  readonly infoPlistKeys?: InfoPlistBlock;
}

export type MetaClause =
  | {
      readonly kind: "DomainMeta";
      readonly span: TokenSpan;
      readonly value: StringLiteral;
    }
  | {
      readonly kind: "CategoryMeta";
      readonly span: TokenSpan;
      readonly value: StringLiteral;
    }
  | {
      readonly kind: "DiscoverableMeta";
      readonly span: TokenSpan;
      readonly value: BooleanLiteral;
    }
  | {
      readonly kind: "DonateOnPerformMeta";
      readonly span: TokenSpan;
      readonly value: BooleanLiteral;
    };

export interface ParamDecl {
  readonly kind: "ParamDecl";
  readonly span: TokenSpan;
  readonly name: Ident;
  readonly type: TypeNode;
  readonly description: StringLiteral;
  readonly defaultValue?: LiteralNode;
  readonly options?: DynamicOptions;
}

export interface DynamicOptions {
  readonly kind: "DynamicOptions";
  readonly span: TokenSpan;
  readonly provider: Ident;
}

export interface ReturnsClause {
  readonly kind: "ReturnsClause";
  readonly span: TokenSpan;
  readonly type: ReturnTypeNode;
}

export interface EntitlementsBlock {
  readonly kind: "EntitlementsBlock";
  readonly span: TokenSpan;
  readonly values: readonly StringLiteral[];
}

export interface InfoPlistBlock {
  readonly kind: "InfoPlistBlock";
  readonly span: TokenSpan;
  readonly entries: readonly InfoPlistEntry[];
}

export interface InfoPlistEntry {
  readonly kind: "InfoPlistEntry";
  readonly span: TokenSpan;
  readonly key: StringLiteral;
  readonly value: StringLiteral;
}

// ─── Summary ─────────────────────────────────────────────────────────

export type SummaryDecl = SummaryTemplate | SummaryWhen | SummarySwitch;

export interface SummaryTemplate {
  readonly kind: "SummaryTemplate";
  readonly span: TokenSpan;
  readonly template: StringLiteral;
}

export interface SummaryWhen {
  readonly kind: "SummaryWhen";
  readonly span: TokenSpan;
  readonly param: Ident;
  readonly then: SummaryValue;
  readonly otherwise?: SummaryValue;
}

export interface SummarySwitch {
  readonly kind: "SummarySwitch";
  readonly span: TokenSpan;
  readonly param: Ident;
  readonly cases: readonly SummaryCase[];
  readonly default?: SummaryValue;
}

export interface SummaryCase {
  readonly kind: "SummaryCase";
  readonly span: TokenSpan;
  readonly value:
    | StringLiteral
    | IntegerLiteral
    | DecimalLiteral
    | BooleanLiteral
    | IdentLiteral;
  readonly body: SummaryValue;
}

/** Leaf string template, or a nested summary declaration. */
export type SummaryValue = StringLiteral | SummaryDecl;
