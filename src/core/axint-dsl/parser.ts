/**
 * Axint DSL — Parser
 *
 * Recursive-descent single-pass parser. Produces a best-effort AST and a
 * flat diagnostic stream from one call. Parse errors are data: the parser
 * records them, skips to the nearest structural recovery boundary defined
 * in spec/language/parser-recovery.md, and keeps going.
 *
 * Recovery boundaries (closed set — changing this bumps the parser-recovery
 * protocol line):
 *   1. the closing `}` of the current block
 *   2. the next top-level keyword (`intent` / `entity` / `enum`)
 *   3. the next field-start keyword for the current block kind
 *   4. end-of-line, when the error is contained to a single field
 *
 * Invariant: every reachable code path either produces an AST node or emits
 * at least one diagnostic. A silent drop is a parser bug.
 */

import type {
  ArrayType,
  BooleanLiteral,
  DecimalLiteral,
  DisplayBlock,
  DisplayImage,
  DisplayPropertyRef,
  DynamicOptions,
  EntitlementsBlock,
  EntityDecl,
  EnumDecl,
  FileNode,
  Ident,
  IdentLiteral,
  InfoPlistBlock,
  InfoPlistEntry,
  IntegerLiteral,
  IntentDecl,
  LiteralNode,
  MetaClause,
  NamedType,
  OptionalType,
  ParamDecl,
  PrimitiveKind,
  PrimitiveType,
  PropertyDecl,
  QueryClause,
  ReturnArrayType,
  ReturnTypeNode,
  ReturnsClause,
  StringLiteral,
  SummaryCase,
  SummaryDecl,
  SummarySwitch,
  SummaryValue,
  SummaryWhen,
  TopLevelDecl,
  TypeNode,
} from "./ast.js";
import type { Diagnostic, Fix } from "./diagnostic.js";
import type { Token, TokenKind, TokenSpan } from "./token.js";
import { toProtocolSpan, tokenize } from "./lexer.js";

export interface ParseResult {
  /**
   * Best-effort AST. On a completely empty or unsalvageable file the `File`
   * node is still returned with an empty `declarations` array — callers get
   * a stable shape in every error case.
   */
  readonly file: FileNode;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ParseOptions {
  /**
   * Logical file path reported on every diagnostic emitted by this parse.
   * Defaults to "<anonymous>" so callers can parse in-memory strings without
   * threading a path.
   */
  readonly sourceFile?: string;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const file = options.sourceFile ?? "<anonymous>";
  const { tokens, diagnostics: lexerDiagnostics } = tokenize(source, {
    sourceFile: file,
  });
  const parser = new Parser(tokens, file);
  const fileNode = parser.parseFile();
  return {
    file: fileNode,
    diagnostics: [...lexerDiagnostics, ...parser.diagnostics],
  };
}

// ─── Internals ───────────────────────────────────────────────────────

const TOP_LEVEL_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "INTENT",
  "ENTITY",
  "ENUM",
]);

const INTENT_META_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "DOMAIN",
  "CATEGORY",
  "DISCOVERABLE",
  "DONATE_ON_PERFORM",
]);

const INTENT_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "TITLE",
  "DESCRIPTION",
  "DOMAIN",
  "CATEGORY",
  "DISCOVERABLE",
  "DONATE_ON_PERFORM",
  "PARAM",
  "SUMMARY",
  "RETURNS",
  "ENTITLEMENTS",
  "INFO_PLIST_KEYS",
]);

const ENTITY_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "DISPLAY",
  "PROPERTY",
  "QUERY",
]);

const PARAM_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "DESCRIPTION",
  "DEFAULT",
  "OPTIONS",
]);

const PROPERTY_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "DESCRIPTION",
]);

const DISPLAY_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "TITLE",
  "SUBTITLE",
  "IMAGE",
]);

const SWITCH_BODY_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "CASE",
  "DEFAULT",
]);

const PRIMITIVE_KIND_BY_TOKEN: ReadonlyMap<TokenKind, PrimitiveKind> = new Map([
  ["TYPE_STRING", "string"],
  ["TYPE_INT", "int"],
  ["TYPE_DOUBLE", "double"],
  ["TYPE_FLOAT", "float"],
  ["TYPE_BOOLEAN", "boolean"],
  ["TYPE_DATE", "date"],
  ["TYPE_DURATION", "duration"],
  ["TYPE_URL", "url"],
]);

const QUERY_KINDS: ReadonlySet<string> = new Set(["all", "id", "string", "property"]);

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly file: string
  ) {}

  // ─── Entry ─────────────────────────────────────────────────────────

  parseFile(): FileNode {
    const startSpan = this.peek().span;
    const declarations: TopLevelDecl[] = [];

    while (!this.atEnd()) {
      const decl = this.parseTopLevelDecl();
      if (decl !== null) {
        declarations.push(decl);
      } else {
        // parseTopLevelDecl emitted a diagnostic and did not consume — force
        // progress so we can't loop forever on garbage.
        if (!this.recoverToTopLevel()) {
          break;
        }
      }
    }

    const endSpan = this.tokens[this.tokens.length - 1]!.span;

    // Empty files emit AX001 per spec. An empty file means zero top-level
    // declarations — comments, whitespace, and lexer noise don't count.
    if (declarations.length === 0 && this.diagnostics.length === 0) {
      const span = this.tokens[0]?.span ?? endSpan;
      this.emit({
        code: "AX001",
        message: "expected `intent`, `entity`, or `enum` declaration",
        span,
        fix: null,
      });
    }

    return {
      kind: "File",
      span: spanBetween(startSpan, endSpan),
      declarations,
    };
  }

  private parseTopLevelDecl(): TopLevelDecl | null {
    const kind = this.peekKind();
    switch (kind) {
      case "INTENT":
        return this.parseIntentDecl();
      case "ENTITY":
        return this.parseEntityDecl();
      case "ENUM":
        return this.parseEnumDecl();
      default: {
        this.emit({
          code: "AX001",
          message: `unexpected ${describeToken(this.peek())} at top level, expected \`intent\`, \`entity\`, or \`enum\``,
          span: this.peek().span,
          fix: null,
        });
        return null;
      }
    }
  }

  // ─── Enum ──────────────────────────────────────────────────────────

  private parseEnumDecl(): EnumDecl | null {
    const start = this.consume(); // ENUM
    const name = this.expectIdent("AX002", "enum name");
    if (!name) {
      this.recoverToTopLevel();
      return null;
    }

    const lbrace = this.expectPunctuation("LBRACE", "`{` to start enum body");
    if (!lbrace) {
      this.recoverToTopLevel();
      return null;
    }

    const cases: Ident[] = [];
    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const caseIdent = this.expectIdent("AX007", "enum case");
      if (caseIdent) {
        cases.push(caseIdent);
      } else {
        // expectIdent already emitted a diagnostic; advance past the bad token
        // to avoid an infinite loop.
        if (this.peekKind() !== "RBRACE") this.advance();
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close enum body");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "EnumDecl",
      span: spanBetween(start.span, endSpan),
      name,
      cases,
    };
  }

  // ─── Entity ────────────────────────────────────────────────────────

  private parseEntityDecl(): EntityDecl | null {
    const start = this.consume(); // ENTITY
    const name = this.expectIdent("AX002", "entity name");
    if (!name) {
      this.recoverToTopLevel();
      return null;
    }

    const lbrace = this.expectPunctuation("LBRACE", "`{` to start entity body");
    if (!lbrace) {
      this.recoverToTopLevel();
      return null;
    }

    let display: DisplayBlock | undefined;
    const properties: PropertyDecl[] = [];
    let query: QueryClause | undefined;

    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const kind = this.peekKind();
      if (kind === "DISPLAY") {
        const block = this.parseDisplayBlock();
        if (block && !display) display = block;
      } else if (kind === "PROPERTY") {
        const prop = this.parsePropertyDecl();
        if (prop) properties.push(prop);
      } else if (kind === "QUERY") {
        const q = this.parseQueryClause();
        if (q && !query) query = q;
      } else {
        this.emit({
          code: "AX007",
          message: `unexpected ${describeToken(this.peek())} in entity body`,
          span: this.peek().span,
          fix: null,
        });
        this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close entity body");
    const endSpan = rbrace?.span ?? this.previousSpan();
    const entitySpan = spanBetween(start.span, endSpan);

    if (!display) {
      this.emit({
        code: "AX015",
        message: "entity is missing `display` block",
        span: this.zeroWidthAfter(lbrace.span),
        fix: {
          kind: "insert_required_clause",
          targetSpan: toProtocolSpan(this.zeroWidthAfter(lbrace.span)),
          suggestedEdit: {
            text: '\n  display {\n    title: name\n    image: "square.stack.fill"\n  }\n',
          },
        },
      });
      display = {
        kind: "DisplayBlock",
        span: this.zeroWidthAfter(lbrace.span),
        title: placeholderDisplayRef("title", this.zeroWidthAfter(lbrace.span)),
      };
    }

    if (!query) {
      this.emit({
        code: "AX017",
        message: "entity is missing `query` clause",
        span: this.zeroWidthBefore(endSpan),
        fix: {
          kind: "insert_required_clause",
          targetSpan: toProtocolSpan(this.zeroWidthBefore(endSpan)),
          suggestedEdit: { text: "\n  query: all\n" },
        },
      });
      query = {
        kind: "QueryClause",
        span: this.zeroWidthBefore(endSpan),
        queryKind: "all",
      };
    }

    return {
      kind: "EntityDecl",
      span: entitySpan,
      name,
      display,
      properties,
      query,
    };
  }

  private parseDisplayBlock(): DisplayBlock | null {
    const start = this.consume(); // DISPLAY
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start display block");
    if (!lbrace) {
      this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      return null;
    }

    let title: DisplayPropertyRef | undefined;
    let subtitle: DisplayPropertyRef | undefined;
    let image: DisplayImage | undefined;

    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const kind = this.peekKind();
      if (kind === "TITLE" || kind === "SUBTITLE") {
        const ref = this.parseDisplayPropertyRef();
        if (ref) {
          if (ref.field === "title" && !title) title = ref;
          else if (ref.field === "subtitle" && !subtitle) subtitle = ref;
        }
      } else if (kind === "IMAGE") {
        const img = this.parseDisplayImage();
        if (img && !image) image = img;
      } else {
        this.emit({
          code: "AX007",
          message: `unexpected ${describeToken(this.peek())} in display block`,
          span: this.peek().span,
          fix: null,
        });
        this.recoverToFieldOrBlockEnd(DISPLAY_BODY_KEYWORDS);
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close display block");
    const endSpan = rbrace?.span ?? this.previousSpan();

    if (!title) {
      this.emit({
        code: "AX016",
        message: "display block is missing `title`",
        span: this.zeroWidthAfter(lbrace.span),
        fix: {
          kind: "insert_required_clause",
          targetSpan: toProtocolSpan(this.zeroWidthAfter(lbrace.span)),
          suggestedEdit: { text: "\n    title: name" },
        },
      });
      title = placeholderDisplayRef("title", this.zeroWidthAfter(lbrace.span));
    }

    return {
      kind: "DisplayBlock",
      span: spanBetween(start.span, endSpan),
      title,
      subtitle,
      image,
    };
  }

  private parseDisplayPropertyRef(): DisplayPropertyRef | null {
    const keyword = this.consume();
    const field = keyword.kind === "TITLE" ? "title" : "subtitle";
    if (!this.expectPunctuation("COLON", `\`:\` after \`${field}\``)) {
      this.recoverToEndOfLine(keyword.span.startLine);
      return null;
    }
    const ident = this.expectIdent("AX007", "property reference");
    if (!ident) {
      this.recoverToEndOfLine(keyword.span.startLine);
      return null;
    }
    return {
      kind: "DisplayPropertyRef",
      span: spanBetween(keyword.span, ident.span),
      field,
      property: ident,
    };
  }

  private parseDisplayImage(): DisplayImage | null {
    const start = this.consume(); // IMAGE
    if (!this.expectPunctuation("COLON", "`:` after `image`")) {
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }
    const str = this.expectStringLiteral("image asset name");
    if (!str) {
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }
    return {
      kind: "DisplayImage",
      span: spanBetween(start.span, str.span),
      asset: str,
    };
  }

  private parsePropertyDecl(): PropertyDecl | null {
    const start = this.consume(); // PROPERTY
    const name = this.expectIdent("AX007", "property name");
    if (!name) {
      this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      return null;
    }
    if (!this.expectPunctuation("COLON", "`:` after property name")) {
      this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      return null;
    }
    const type = this.parseType();
    if (!type) {
      this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      return null;
    }
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start property body");
    if (!lbrace) {
      this.recoverToFieldOrBlockEnd(ENTITY_BODY_KEYWORDS);
      return null;
    }

    const description = this.parseRequiredDescription("property", lbrace.span);

    // Property body in v1 only accepts `description`. Anything else is AX007.
    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      this.emit({
        code: "AX007",
        message: `unexpected ${describeToken(this.peek())} in property body — only \`description\` is allowed`,
        span: this.peek().span,
        fix: null,
      });
      this.recoverToFieldOrBlockEnd(PROPERTY_BODY_KEYWORDS);
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close property body");
    const endSpan = rbrace?.span ?? this.previousSpan();

    return {
      kind: "PropertyDecl",
      span: spanBetween(start.span, endSpan),
      name,
      type,
      description,
    };
  }

  private parseQueryClause(): QueryClause | null {
    const start = this.consume(); // QUERY
    if (!this.expectPunctuation("COLON", "`:` after `query`")) {
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }

    // Grammar: query-kind = "all" | "id" | "string" | "property"
    // `string` and `property` lex as keyword tokens, `all` and `id` as identifiers.
    const next = this.peek();
    const kindHoldsQueryValue =
      next.kind === "IDENTIFIER" ||
      next.kind === "TYPE_STRING" ||
      next.kind === "PROPERTY";
    if (!kindHoldsQueryValue) {
      this.emit({
        code: "AX018",
        message: `expected query kind, got ${describeToken(next)}`,
        span: next.span,
        fix: null,
      });
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }

    const tok = this.consume();
    if (!QUERY_KINDS.has(tok.value)) {
      this.emit({
        code: "AX018",
        message: `unknown query kind \`${tok.value}\``,
        span: tok.span,
        fix: {
          kind: "replace_literal",
          targetSpan: toProtocolSpan(tok.span),
          candidates: [...QUERY_KINDS],
        },
      });
      return {
        kind: "QueryClause",
        span: spanBetween(start.span, tok.span),
        queryKind: "all",
      };
    }

    return {
      kind: "QueryClause",
      span: spanBetween(start.span, tok.span),
      queryKind: tok.value as QueryClause["queryKind"],
    };
  }

  // ─── Intent ────────────────────────────────────────────────────────

  private parseIntentDecl(): IntentDecl | null {
    const start = this.consume(); // INTENT
    const name = this.expectIdent("AX002", "intent name");
    if (!name) {
      this.recoverToTopLevel();
      return null;
    }

    const lbrace = this.expectPunctuation("LBRACE", "`{` to start intent body");
    if (!lbrace) {
      this.recoverToTopLevel();
      return null;
    }

    const title = this.parseRequiredStringField("TITLE", "title", "AX003", lbrace.span);
    const description = this.parseRequiredStringField(
      "DESCRIPTION",
      "description",
      "AX004",
      lbrace.span
    );

    const meta: MetaClause[] = [];
    while (!this.atEnd() && INTENT_META_KEYWORDS.has(this.peekKind())) {
      const clause = this.parseMetaClause();
      if (clause) meta.push(clause);
    }

    const params: ParamDecl[] = [];
    while (!this.atEnd() && this.peekKind() === "PARAM") {
      const param = this.parseParamDecl();
      if (param) params.push(param);
    }

    let summary: SummaryDecl | undefined;
    if (this.peekKind() === "SUMMARY") {
      summary = this.parseSummary() ?? undefined;
    }

    let returns: ReturnsClause | undefined;
    if (this.peekKind() === "RETURNS") {
      returns = this.parseReturnsClause() ?? undefined;
    }

    let entitlements: EntitlementsBlock | undefined;
    if (this.peekKind() === "ENTITLEMENTS") {
      entitlements = this.parseEntitlements() ?? undefined;
    }

    let infoPlistKeys: InfoPlistBlock | undefined;
    if (this.peekKind() === "INFO_PLIST_KEYS") {
      infoPlistKeys = this.parseInfoPlistKeys() ?? undefined;
    }

    // After the ordered pass, anything left in the body is out-of-order or
    // unknown. Per parser-recovery.md example #3, an unexpected top-level
    // keyword here means a missing `}` — resync at the next top-level.
    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      if (TOP_LEVEL_KEYWORDS.has(this.peekKind())) {
        this.emit({
          code: "AX001",
          message: `unexpected ${describeToken(this.peek())} inside intent body, expected \`}\``,
          span: this.zeroWidthBefore(this.peek().span),
          fix: {
            kind: "insert_required_clause",
            targetSpan: toProtocolSpan(this.zeroWidthBefore(this.peek().span)),
            suggestedEdit: { text: "}\n" },
          },
        });
        return {
          kind: "IntentDecl",
          span: spanBetween(start.span, this.previousSpan()),
          name,
          title,
          description,
          meta,
          params,
          summary,
          returns,
          entitlements,
          infoPlistKeys,
        };
      }

      this.emit({
        code: "AX007",
        message: `unexpected ${describeToken(this.peek())} in intent body`,
        span: this.peek().span,
        fix: null,
      });
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close intent body");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "IntentDecl",
      span: spanBetween(start.span, endSpan),
      name,
      title,
      description,
      meta,
      params,
      summary,
      returns,
      entitlements,
      infoPlistKeys,
    };
  }

  private parseRequiredStringField(
    keyword: TokenKind,
    keywordText: string,
    missingCode: string,
    anchor: TokenSpan
  ): StringLiteral {
    if (this.peekKind() !== keyword) {
      const insertSpan = this.zeroWidthAfter(anchor);
      this.emit({
        code: missingCode,
        message: `intent is missing \`${keywordText}\` clause`,
        span: insertSpan,
        fix: {
          kind: "insert_required_clause",
          targetSpan: toProtocolSpan(insertSpan),
          suggestedEdit: { text: `\n  ${keywordText}: ""` },
        },
      });
      return emptyStringLiteral(insertSpan);
    }

    const kw = this.consume();
    if (!this.expectPunctuation("COLON", `\`:\` after \`${keywordText}\``)) {
      this.recoverToEndOfLine(kw.span.startLine);
      return emptyStringLiteral(kw.span);
    }
    const value = this.expectStringLiteral(keywordText);
    if (!value) {
      this.recoverToEndOfLine(kw.span.startLine);
      return emptyStringLiteral(kw.span);
    }
    return value;
  }

  private parseMetaClause(): MetaClause | null {
    const kw = this.consume();
    const kind = kw.kind;
    if (!this.expectPunctuation("COLON", `\`:\` after \`${kw.value}\``)) {
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }

    if (kind === "DOMAIN" || kind === "CATEGORY") {
      const value = this.expectStringLiteral(`${kw.value} value`);
      if (!value) {
        this.recoverToEndOfLine(kw.span.startLine);
        return null;
      }
      return kind === "DOMAIN"
        ? { kind: "DomainMeta", span: spanBetween(kw.span, value.span), value }
        : { kind: "CategoryMeta", span: spanBetween(kw.span, value.span), value };
    }

    // DISCOVERABLE / DONATE_ON_PERFORM
    const bool = this.expectBooleanLiteral(`${kw.value} value`);
    if (!bool) {
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }
    return kind === "DISCOVERABLE"
      ? { kind: "DiscoverableMeta", span: spanBetween(kw.span, bool.span), value: bool }
      : {
          kind: "DonateOnPerformMeta",
          span: spanBetween(kw.span, bool.span),
          value: bool,
        };
  }

  private parseParamDecl(): ParamDecl | null {
    const start = this.consume(); // PARAM
    const name = this.expectIdent("AX007", "param name");
    if (!name) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }
    if (!this.expectPunctuation("COLON", "`:` after param name")) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }
    const type = this.parseType();
    if (!type) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start param body");
    if (!lbrace) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }

    const description = this.parseRequiredDescription("param", lbrace.span);
    let defaultValue: LiteralNode | undefined;
    let options: DynamicOptions | undefined;

    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const kind = this.peekKind();
      if (kind === "DEFAULT") {
        const def = this.parseDefaultValue();
        if (def && !defaultValue) defaultValue = def;
      } else if (kind === "OPTIONS") {
        const opt = this.parseDynamicOptions();
        if (opt && !options) options = opt;
      } else {
        this.emit({
          code: "AX007",
          message: `unexpected ${describeToken(this.peek())} in param body`,
          span: this.peek().span,
          fix: null,
        });
        this.recoverToFieldOrBlockEnd(PARAM_BODY_KEYWORDS);
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close param body");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "ParamDecl",
      span: spanBetween(start.span, endSpan),
      name,
      type,
      description,
      defaultValue,
      options,
    };
  }

  private parseRequiredDescription(context: string, anchor: TokenSpan): StringLiteral {
    if (this.peekKind() !== "DESCRIPTION") {
      const insertSpan = this.zeroWidthAfter(anchor);
      this.emit({
        code: "AX104",
        message: `${context} body is missing required \`description\` field`,
        span: insertSpan,
        fix: {
          kind: "insert_required_clause",
          targetSpan: toProtocolSpan(insertSpan),
          suggestedEdit: { text: '\n    description: ""' },
        },
      });
      return emptyStringLiteral(insertSpan);
    }
    const kw = this.consume();
    if (!this.expectPunctuation("COLON", "`:` after `description`")) {
      this.recoverToEndOfLine(kw.span.startLine);
      return emptyStringLiteral(kw.span);
    }
    const value = this.expectStringLiteral("description value");
    if (!value) {
      this.recoverToEndOfLine(kw.span.startLine);
      return emptyStringLiteral(kw.span);
    }
    return value;
  }

  private parseDefaultValue(): LiteralNode | null {
    const kw = this.consume(); // DEFAULT
    if (!this.expectPunctuation("COLON", "`:` after `default`")) {
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }
    return this.parseLiteral();
  }

  private parseDynamicOptions(): DynamicOptions | null {
    const kw = this.consume(); // OPTIONS
    if (!this.expectPunctuation("COLON", "`:` after `options`")) {
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }
    if (this.peekKind() !== "DYNAMIC") {
      this.emit({
        code: "AX007",
        message: `expected \`dynamic\` after \`options:\`, got ${describeToken(this.peek())}`,
        span: this.peek().span,
        fix: null,
      });
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }
    this.consume(); // DYNAMIC
    const provider = this.expectIdent("AX007", "options provider");
    if (!provider) {
      this.recoverToEndOfLine(kw.span.startLine);
      return null;
    }
    return {
      kind: "DynamicOptions",
      span: spanBetween(kw.span, provider.span),
      provider,
    };
  }

  private parseReturnsClause(): ReturnsClause | null {
    const start = this.consume(); // RETURNS
    if (!this.expectPunctuation("COLON", "`:` after `returns`")) {
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }
    const type = this.parseReturnType();
    if (!type) {
      this.recoverToEndOfLine(start.span.startLine);
      return null;
    }
    return {
      kind: "ReturnsClause",
      span: spanBetween(start.span, type.span),
      type,
    };
  }

  private parseEntitlements(): EntitlementsBlock | null {
    const start = this.consume(); // ENTITLEMENTS
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start entitlements block");
    if (!lbrace) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }

    const values: StringLiteral[] = [];
    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      if (this.peekKind() === "STRING_LITERAL") {
        values.push(this.consumeStringLiteral());
      } else {
        this.emit({
          code: "AX007",
          message: `expected string literal in entitlements block, got ${describeToken(this.peek())}`,
          span: this.peek().span,
          fix: null,
        });
        this.advance();
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close entitlements block");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "EntitlementsBlock",
      span: spanBetween(start.span, endSpan),
      values,
    };
  }

  private parseInfoPlistKeys(): InfoPlistBlock | null {
    const start = this.consume(); // INFO_PLIST_KEYS
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start infoPlistKeys block");
    if (!lbrace) {
      this.recoverToFieldOrBlockEnd(INTENT_BODY_KEYWORDS);
      return null;
    }

    const entries: InfoPlistEntry[] = [];
    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      if (this.peekKind() !== "STRING_LITERAL") {
        this.emit({
          code: "AX007",
          message: `expected key string in infoPlistKeys block, got ${describeToken(this.peek())}`,
          span: this.peek().span,
          fix: null,
        });
        this.advance();
        continue;
      }
      const key = this.consumeStringLiteral();
      if (!this.expectPunctuation("COLON", "`:` between infoPlistKeys key and value")) {
        this.recoverToEndOfLine(key.span.startLine);
        continue;
      }
      const value = this.expectStringLiteral("infoPlistKeys value");
      if (!value) {
        this.recoverToEndOfLine(key.span.startLine);
        continue;
      }
      entries.push({
        kind: "InfoPlistEntry",
        span: spanBetween(key.span, value.span),
        key,
        value,
      });
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close infoPlistKeys block");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "InfoPlistBlock",
      span: spanBetween(start.span, endSpan),
      entries,
    };
  }

  // ─── Summary ───────────────────────────────────────────────────────

  private parseSummary(): SummaryDecl | null {
    const start = this.consume(); // SUMMARY
    return this.parseSummaryForm(start.span);
  }

  private parseSummaryForm(startSpan: TokenSpan): SummaryDecl | null {
    const kind = this.peekKind();
    if (kind === "COLON") {
      this.consume();
      const template = this.expectStringLiteral("summary template");
      if (!template) return null;
      return {
        kind: "SummaryTemplate",
        span: spanBetween(startSpan, template.span),
        template,
      };
    }
    if (kind === "WHEN") {
      return this.parseSummaryWhen(startSpan);
    }
    if (kind === "SWITCH") {
      return this.parseSummarySwitch(startSpan);
    }
    this.emit({
      code: "AX007",
      message: `expected \`:\`, \`when\`, or \`switch\` after \`summary\`, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  private parseSummaryWhen(summaryStart: TokenSpan): SummaryWhen | null {
    this.consume(); // WHEN
    const param = this.expectIdent("AX007", "param name");
    if (!param) return null;
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start summary when body");
    if (!lbrace) return null;

    let then: SummaryValue | undefined;
    let otherwise: SummaryValue | undefined;

    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const kind = this.peekKind();
      if (kind === "THEN") {
        const kw = this.consume();
        if (!this.expectPunctuation("COLON", "`:` after `then`")) {
          this.recoverToFieldOrBlockEnd(new Set<TokenKind>(["THEN", "OTHERWISE"]));
          continue;
        }
        const value = this.parseSummaryValue();
        if (value && !then) then = value;
        else if (!value) this.recoverToEndOfLine(kw.span.startLine);
      } else if (kind === "OTHERWISE") {
        const kw = this.consume();
        if (!this.expectPunctuation("COLON", "`:` after `otherwise`")) {
          this.recoverToFieldOrBlockEnd(new Set<TokenKind>(["THEN", "OTHERWISE"]));
          continue;
        }
        const value = this.parseSummaryValue();
        if (value && !otherwise) otherwise = value;
        else if (!value) this.recoverToEndOfLine(kw.span.startLine);
      } else {
        this.emit({
          code: "AX007",
          message: `unexpected ${describeToken(this.peek())} in summary when body`,
          span: this.peek().span,
          fix: null,
        });
        this.recoverToFieldOrBlockEnd(new Set<TokenKind>(["THEN", "OTHERWISE"]));
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close summary when body");
    const endSpan = rbrace?.span ?? this.previousSpan();

    if (!then) {
      this.emit({
        code: "AX007",
        message: "summary `when` is missing `then` branch",
        span: this.zeroWidthAfter(lbrace.span),
        fix: null,
      });
      then = emptyStringLiteral(this.zeroWidthAfter(lbrace.span));
    }

    return {
      kind: "SummaryWhen",
      span: spanBetween(summaryStart, endSpan),
      param,
      then,
      otherwise,
    };
  }

  private parseSummarySwitch(summaryStart: TokenSpan): SummarySwitch | null {
    this.consume(); // SWITCH
    const param = this.expectIdent("AX007", "param name");
    if (!param) return null;
    const lbrace = this.expectPunctuation("LBRACE", "`{` to start summary switch body");
    if (!lbrace) return null;

    const cases: SummaryCase[] = [];
    let defaultValue: SummaryValue | undefined;

    while (!this.atEnd() && this.peekKind() !== "RBRACE") {
      const kind = this.peekKind();
      if (kind === "CASE") {
        const c = this.parseSummaryCase();
        if (c) cases.push(c);
      } else if (kind === "DEFAULT") {
        const kw = this.consume();
        if (!this.expectPunctuation("COLON", "`:` after `default`")) {
          this.recoverToFieldOrBlockEnd(SWITCH_BODY_KEYWORDS);
          continue;
        }
        const value = this.parseSummaryValue();
        if (value && !defaultValue) defaultValue = value;
        else if (!value) this.recoverToEndOfLine(kw.span.startLine);
      } else {
        this.emit({
          code: "AX007",
          message: `unexpected ${describeToken(this.peek())} in summary switch body`,
          span: this.peek().span,
          fix: null,
        });
        this.recoverToFieldOrBlockEnd(SWITCH_BODY_KEYWORDS);
      }
    }

    const rbrace = this.expectPunctuation("RBRACE", "`}` to close summary switch body");
    const endSpan = rbrace?.span ?? this.previousSpan();
    return {
      kind: "SummarySwitch",
      span: spanBetween(summaryStart, endSpan),
      param,
      cases,
      default: defaultValue,
    };
  }

  private parseSummaryCase(): SummaryCase | null {
    const start = this.consume(); // CASE
    const literal = this.parseLiteral();
    if (!literal) return null;
    const caseValue = literal as SummaryCase["value"];
    if (!this.expectPunctuation("COLON", "`:` after case literal")) {
      this.recoverToFieldOrBlockEnd(SWITCH_BODY_KEYWORDS);
      return null;
    }
    const body = this.parseSummaryValue();
    if (!body) return null;
    return {
      kind: "SummaryCase",
      span: spanBetween(start.span, body.span),
      value: caseValue,
      body,
    };
  }

  private parseSummaryValue(): SummaryValue | null {
    if (this.peekKind() === "STRING_LITERAL") {
      return this.consumeStringLiteral();
    }
    if (this.peekKind() === "SUMMARY") {
      const start = this.consume();
      return this.parseSummaryForm(start.span);
    }
    this.emit({
      code: "AX007",
      message: `expected string template or nested \`summary\`, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  // ─── Types ─────────────────────────────────────────────────────────

  private parseType(): TypeNode | null {
    const atom = this.parseTypeAtom();
    if (!atom) return null;
    if (this.peekKind() === "QUESTION") {
      const q = this.consume();
      const optional: OptionalType = {
        kind: "OptionalType",
        span: spanBetween(atom.span, q.span),
        inner: atom,
      };
      return optional;
    }
    return atom;
  }

  private parseTypeAtom(): TypeNode | null {
    const kind = this.peekKind();
    const primitive = PRIMITIVE_KIND_BY_TOKEN.get(kind);
    if (primitive) {
      const tok = this.consume();
      return { kind: "PrimitiveType", span: tok.span, primitive };
    }
    if (kind === "LBRACKET") {
      const start = this.consume();
      const element = this.parseType();
      if (!element) return null;
      const end = this.expectPunctuation("RBRACKET", "`]` to close array type");
      if (!end) return null;
      const array: ArrayType = {
        kind: "ArrayType",
        span: spanBetween(start.span, end.span),
        element,
      };
      return array;
    }
    if (kind === "IDENTIFIER") {
      const tok = this.consume();
      const named: NamedType = { kind: "NamedType", span: tok.span, name: tok.value };
      return named;
    }

    this.emit({
      code: "AX005",
      message: `expected type, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  private parseReturnType(): ReturnTypeNode | null {
    const kind = this.peekKind();
    if (kind === "LBRACKET") {
      const start = this.consume();
      const atom = this.parseReturnAtom();
      if (!atom) return null;
      const end = this.expectPunctuation("RBRACKET", "`]` to close return array type");
      if (!end) return null;
      const wrapped: ReturnArrayType = {
        kind: "ReturnArrayType",
        span: spanBetween(start.span, end.span),
        element: atom,
      };
      return wrapped;
    }
    return this.parseReturnAtom();
  }

  private parseReturnAtom(): PrimitiveType | NamedType | null {
    const kind = this.peekKind();
    const primitive = PRIMITIVE_KIND_BY_TOKEN.get(kind);
    if (primitive) {
      const tok = this.consume();
      return { kind: "PrimitiveType", span: tok.span, primitive };
    }
    if (kind === "IDENTIFIER") {
      const tok = this.consume();
      return { kind: "NamedType", span: tok.span, name: tok.value };
    }
    this.emit({
      code: "AX005",
      message: `expected return type, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  // ─── Literals ──────────────────────────────────────────────────────

  private parseLiteral(): LiteralNode | null {
    const tok = this.peek();
    switch (tok.kind) {
      case "STRING_LITERAL":
        this.advance();
        return { kind: "StringLiteral", span: tok.span, value: tok.value };
      case "INTEGER_LITERAL": {
        this.advance();
        const value: IntegerLiteral = {
          kind: "IntegerLiteral",
          span: tok.span,
          value: Number.parseInt(tok.value, 10),
        };
        return value;
      }
      case "DECIMAL_LITERAL": {
        this.advance();
        const value: DecimalLiteral = {
          kind: "DecimalLiteral",
          span: tok.span,
          value: Number.parseFloat(tok.value),
        };
        return value;
      }
      case "TRUE":
      case "FALSE": {
        this.advance();
        const bool: BooleanLiteral = {
          kind: "BooleanLiteral",
          span: tok.span,
          value: tok.kind === "TRUE",
        };
        return bool;
      }
      case "IDENTIFIER": {
        this.advance();
        const ident: IdentLiteral = {
          kind: "IdentLiteral",
          span: tok.span,
          name: tok.value,
        };
        return ident;
      }
      default:
        this.emit({
          code: "AX007",
          message: `expected literal, got ${describeToken(tok)}`,
          span: tok.span,
          fix: null,
        });
        return null;
    }
  }

  // ─── Token utilities ───────────────────────────────────────────────

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]!;
    }
    return this.tokens[idx]!;
  }

  private peekKind(offset = 0): TokenKind {
    return this.peek(offset).kind;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]!;
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return tok;
  }

  private consume(): Token {
    return this.advance();
  }

  private atEnd(): boolean {
    return this.peekKind() === "EOF";
  }

  private previousSpan(): TokenSpan {
    const idx = Math.max(0, this.pos - 1);
    return this.tokens[idx]!.span;
  }

  private expectPunctuation(kind: TokenKind, description: string): Token | null {
    if (this.peekKind() === kind) return this.consume();
    this.emit({
      code: "AX007",
      message: `expected ${description}, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  private expectIdent(code: string, description: string): Ident | null {
    if (this.peekKind() === "IDENTIFIER") {
      const tok = this.consume();
      return { kind: "Ident", span: tok.span, name: tok.value };
    }
    this.emit({
      code,
      message: `expected ${description}, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  private expectStringLiteral(description: string): StringLiteral | null {
    if (this.peekKind() === "STRING_LITERAL") {
      return this.consumeStringLiteral();
    }
    this.emit({
      code: "AX007",
      message: `expected ${description} string, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  private consumeStringLiteral(): StringLiteral {
    const tok = this.consume();
    return { kind: "StringLiteral", span: tok.span, value: tok.value };
  }

  private expectBooleanLiteral(description: string): BooleanLiteral | null {
    const kind = this.peekKind();
    if (kind === "TRUE" || kind === "FALSE") {
      const tok = this.consume();
      return { kind: "BooleanLiteral", span: tok.span, value: kind === "TRUE" };
    }
    this.emit({
      code: "AX007",
      message: `expected ${description} boolean, got ${describeToken(this.peek())}`,
      span: this.peek().span,
      fix: null,
    });
    return null;
  }

  // ─── Spans + diagnostics ───────────────────────────────────────────

  private emit(args: {
    code: string;
    message: string;
    span: TokenSpan;
    fix: Fix | null;
  }): void {
    this.diagnostics.push({
      schemaVersion: 1,
      code: args.code,
      severity: "error",
      message: args.message,
      file: this.file,
      span: toProtocolSpan(args.span),
      fix: args.fix,
    });
  }

  private zeroWidthAfter(span: TokenSpan): TokenSpan {
    return {
      startByte: span.endByte,
      endByte: span.endByte,
      startLine: span.endLine,
      startColumn: span.endColumn,
      endLine: span.endLine,
      endColumn: span.endColumn,
    };
  }

  private zeroWidthBefore(span: TokenSpan): TokenSpan {
    return {
      startByte: span.startByte,
      endByte: span.startByte,
      startLine: span.startLine,
      startColumn: span.startColumn,
      endLine: span.startLine,
      endColumn: span.startColumn,
    };
  }

  // ─── Recovery ──────────────────────────────────────────────────────

  /**
   * Scan forward until a top-level keyword or EOF. Returns `true` if the
   * parser made progress, `false` if it's already at EOF (caller should
   * break out of its outer loop).
   */
  private recoverToTopLevel(): boolean {
    if (this.atEnd()) return false;
    // Always move past the offending token so we can't loop.
    this.advance();
    while (!this.atEnd() && !TOP_LEVEL_KEYWORDS.has(this.peekKind())) {
      this.advance();
    }
    return !this.atEnd() || this.pos > 0;
  }

  /**
   * Scan forward until one of the given field-start keywords, the enclosing
   * `}`, or a top-level keyword. Stops on the first match — the caller's
   * loop re-enters at that token.
   */
  private recoverToFieldOrBlockEnd(fieldKeywords: ReadonlySet<TokenKind>): void {
    if (this.atEnd()) return;
    this.advance();
    while (!this.atEnd()) {
      const kind = this.peekKind();
      if (kind === "RBRACE") return;
      if (TOP_LEVEL_KEYWORDS.has(kind)) return;
      if (fieldKeywords.has(kind)) return;
      this.advance();
    }
  }

  /**
   * Scan forward until a token starts on a later line than `line`. Used for
   * single-line fields where the right-hand side is malformed.
   */
  private recoverToEndOfLine(line: number): void {
    while (!this.atEnd() && this.peek().span.startLine === line) {
      const kind = this.peekKind();
      if (kind === "RBRACE" || TOP_LEVEL_KEYWORDS.has(kind)) return;
      this.advance();
    }
  }
}

// ─── Module helpers ──────────────────────────────────────────────────

function spanBetween(a: TokenSpan, b: TokenSpan): TokenSpan {
  return {
    startByte: a.startByte,
    endByte: b.endByte,
    startLine: a.startLine,
    startColumn: a.startColumn,
    endLine: b.endLine,
    endColumn: b.endColumn,
  };
}

function emptyStringLiteral(span: TokenSpan): StringLiteral {
  return { kind: "StringLiteral", span, value: "" };
}

function placeholderDisplayRef(
  field: "title" | "subtitle",
  span: TokenSpan
): DisplayPropertyRef {
  return {
    kind: "DisplayPropertyRef",
    span,
    field,
    property: { kind: "Ident", span, name: "" },
  };
}

function describeToken(token: Token): string {
  if (token.kind === "EOF") return "end of file";
  if (token.kind === "UNKNOWN") return `unrecognized token \`${token.value}\``;
  if (token.kind === "STRING_LITERAL") return "string literal";
  if (token.kind === "INTEGER_LITERAL") return `\`${token.value}\``;
  if (token.kind === "DECIMAL_LITERAL") return `\`${token.value}\``;
  if (token.kind === "IDENTIFIER") return `\`${token.value}\``;
  return `\`${token.value}\``;
}
