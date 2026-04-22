/**
 * Axint DSL — AST → IR lowering
 *
 * Walks a parsed `FileNode` and produces the `IRIntent` / `IREntity` shape the
 * rest of the compiler already consumes. Validator-stage diagnostics fire here
 * alongside the IR: the lowering is the point where a `.axint` file becomes
 * semantically equivalent to an `@axint/compiler` TS surface call. The result
 * round-trips per spec/language/ir-mapping.md §Round-trip invariant.
 *
 * Validator codes wired here:
 *   AX001  file with no top-level declarations
 *   AX005  unknown primitive type (lowercase NamedType with no resolution)
 *   AX020  param / returns references an undeclared entity
 *   AX021  display field references a property that doesn't exist
 *   AX023  summary template references a param that doesn't exist
 *   AX100  intent name not PascalCase
 *   AX103  intent has duplicate param names
 *   AX106  default value type doesn't match declared type
 *   AX107  optional param has a non-null default
 *   AX109  `summary switch` has no default and the type is not exhaustive
 *
 * Other validator codes (AX101/AX102/AX104/AX105/AX108/AX110–AX113) layer on
 * in follow-up work — the IR shape they operate on is what this module emits.
 */

import type {
  BooleanLiteral,
  DecimalLiteral,
  EntityDecl,
  EnumDecl,
  FileNode,
  IdentLiteral,
  IntegerLiteral,
  IntentDecl,
  LiteralNode,
  ParamDecl,
  PrimitiveType,
  PropertyDecl,
  ReturnTypeNode,
  StringLiteral,
  SummaryCase,
  SummaryDecl,
  SummarySwitch,
  SummaryValue,
  TopLevelDecl,
  TypeNode,
} from "./ast.js";
import type { Diagnostic, DiagnosticSeverity, Fix, Span } from "./diagnostic.js";
import { DIAGNOSTIC_SCHEMA_VERSION } from "./diagnostic.js";
import { toProtocolSpan } from "./lexer.js";
import type { TokenSpan } from "./token.js";
import type {
  DisplayRepresentation,
  IREntity,
  IRIntent,
  IRParameter,
  IRParameterSummary,
  IRPrimitiveType,
  IRType,
} from "../types.js";
import { PARAM_TYPES } from "../types.js";

// ─── Public surface ────────────────────────────────────────────────────

export interface LowerResult {
  readonly intents: readonly IRIntent[];
  readonly entities: readonly IREntity[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface LowerOptions {
  /** Reported on every diagnostic. Defaults to "<anonymous>". */
  readonly sourceFile?: string;
}

export function lower(file: FileNode, options?: LowerOptions): LowerResult {
  const sourceFile = options?.sourceFile ?? "<anonymous>";
  const ctx = new LowerContext(sourceFile);

  if (file.declarations.length === 0) {
    ctx.emit({
      code: "AX001",
      message: "file contains no top-level declarations",
      span: zeroWidthAt(file.span),
      fix: {
        kind: "insert_required_clause",
        targetSpan: toProtocolSpan(zeroWidthAt(file.span)),
      },
    });
    return ctx.finish([], []);
  }

  const index = buildNameIndex(file.declarations);

  // Lower every entity once — intents referencing them copy the IR node.
  const entityIR = new Map<string, IREntity>();
  const entities: IREntity[] = [];
  for (const decl of file.declarations) {
    if (decl.kind === "EntityDecl") {
      const ir = lowerEntity(decl, index, ctx);
      entityIR.set(decl.name.name, ir);
      entities.push(ir);
    }
  }

  const intents: IRIntent[] = [];
  for (const decl of file.declarations) {
    if (decl.kind === "IntentDecl") {
      intents.push(lowerIntent(decl, index, entityIR, sourceFile, ctx));
    }
  }

  return ctx.finish(intents, entities);
}

// ─── Context + diagnostic emission ─────────────────────────────────────

class LowerContext {
  private readonly diagnostics: Diagnostic[] = [];

  constructor(readonly sourceFile: string) {}

  emit(args: {
    code: string;
    message: string;
    span: TokenSpan | Span;
    fix: Fix;
    severity?: DiagnosticSeverity;
  }): void {
    const span = isTokenSpan(args.span) ? toProtocolSpan(args.span) : args.span;
    this.diagnostics.push({
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      code: args.code,
      severity: args.severity ?? "error",
      message: args.message,
      file: this.sourceFile,
      span,
      fix: args.fix,
    });
  }

  finish(intents: IRIntent[], entities: IREntity[]): LowerResult {
    return { intents, entities, diagnostics: this.diagnostics };
  }
}

function isTokenSpan(s: TokenSpan | Span): s is TokenSpan {
  return (s as TokenSpan).startByte !== undefined;
}

// ─── Name index ────────────────────────────────────────────────────────

interface NameIndex {
  readonly entities: ReadonlyMap<string, EntityDecl>;
  readonly enums: ReadonlyMap<string, EnumDecl>;
}

function buildNameIndex(decls: readonly TopLevelDecl[]): NameIndex {
  const entities = new Map<string, EntityDecl>();
  const enums = new Map<string, EnumDecl>();
  for (const decl of decls) {
    if (decl.kind === "EntityDecl" && decl.name.name !== "") {
      entities.set(decl.name.name, decl);
    } else if (decl.kind === "EnumDecl" && decl.name.name !== "") {
      enums.set(decl.name.name, decl);
    }
  }
  return { entities, enums };
}

// ─── Entity lowering ───────────────────────────────────────────────────

function lowerEntity(decl: EntityDecl, index: NameIndex, ctx: LowerContext): IREntity {
  const properties = decl.properties.map((p) => lowerProperty(p, index, ctx));
  const propNames = new Set(properties.map((p) => p.name));

  const display = lowerDisplay(decl, propNames, ctx);

  return {
    name: decl.name.name,
    displayRepresentation: display,
    properties,
    queryType: decl.query.queryKind,
  };
}

function lowerDisplay(
  decl: EntityDecl,
  propNames: ReadonlySet<string>,
  ctx: LowerContext
): DisplayRepresentation {
  const { title, subtitle, image } = decl.display;
  checkDisplayRef(title.property.name, title.property.span, "title", propNames, ctx);
  if (subtitle) {
    checkDisplayRef(
      subtitle.property.name,
      subtitle.property.span,
      "subtitle",
      propNames,
      ctx
    );
  }
  return {
    title: title.property.name,
    ...(subtitle ? { subtitle: subtitle.property.name } : {}),
    ...(image ? { image: image.asset.value } : {}),
  };
}

function checkDisplayRef(
  name: string,
  span: TokenSpan,
  field: "title" | "subtitle",
  propNames: ReadonlySet<string>,
  ctx: LowerContext
): void {
  // Empty name means the parser inserted a placeholder (AX016 already fired).
  if (name === "" || propNames.has(name)) return;
  ctx.emit({
    code: "AX021",
    message: `display.${field} references property \`${name}\` which is not declared on this entity`,
    span,
    fix: {
      kind: "replace_identifier",
      targetSpan: toProtocolSpan(span),
      candidates: [...propNames].sort(),
    },
  });
}

function lowerProperty(
  decl: PropertyDecl,
  index: NameIndex,
  ctx: LowerContext
): IRParameter {
  const type = lowerType(decl.type, index, ctx);
  const description = decl.description.value;
  return {
    name: decl.name.name,
    type,
    title: description,
    description,
    isOptional: decl.type.kind === "OptionalType",
  };
}

// ─── Intent lowering ───────────────────────────────────────────────────

function lowerIntent(
  decl: IntentDecl,
  index: NameIndex,
  entityIR: ReadonlyMap<string, IREntity>,
  sourceFile: string,
  ctx: LowerContext
): IRIntent {
  checkPascalCase(decl, ctx);

  const params: IRParameter[] = [];
  const seen = new Map<string, ParamDecl>();
  const referencedEntities = new Set<string>();

  for (const p of decl.params) {
    const existing = seen.get(p.name.name);
    if (existing && p.name.name !== "") {
      ctx.emit({
        code: "AX103",
        message: `duplicate param name \`${p.name.name}\``,
        span: p.name.span,
        fix: {
          kind: "rename_identifier",
          targetSpan: toProtocolSpan(p.name.span),
        },
      });
    } else {
      seen.set(p.name.name, p);
    }
    params.push(lowerParam(p, index, ctx, referencedEntities));
  }

  const meta = collectMeta(decl);
  const returnInfo = decl.returns
    ? lowerReturn(decl.returns.type, index, ctx, referencedEntities)
    : undefined;
  const parameterSummary = decl.summary
    ? lowerSummary(decl.summary, params, index, ctx)
    : undefined;

  const intent: IRIntent = {
    name: decl.name.name,
    title: decl.title.value,
    description: decl.description.value,
    parameters: params,
    returnType: returnInfo?.returnType ?? { kind: "primitive", value: "string" },
    sourceFile,
    ...(meta.domain ? { domain: meta.domain } : {}),
    ...(meta.category ? { category: meta.category } : {}),
    ...(meta.discoverable !== undefined ? { isDiscoverable: meta.discoverable } : {}),
    ...(meta.donateOnPerform !== undefined
      ? { donateOnPerform: meta.donateOnPerform }
      : {}),
    ...(returnInfo?.customResultType
      ? { customResultType: returnInfo.customResultType }
      : {}),
    ...(parameterSummary ? { parameterSummary } : {}),
    ...(decl.entitlements && decl.entitlements.values.length > 0
      ? { entitlements: decl.entitlements.values.map((s) => s.value) }
      : {}),
    ...(decl.infoPlistKeys && decl.infoPlistKeys.entries.length > 0
      ? {
          infoPlistKeys: Object.fromEntries(
            decl.infoPlistKeys.entries.map((e) => [e.key.value, e.value.value])
          ),
        }
      : {}),
  };

  // Auto-collect entities referenced by this intent's params / returns.
  const entities: IREntity[] = [];
  for (const name of referencedEntities) {
    const ir = entityIR.get(name);
    if (ir) entities.push(ir);
  }
  if (entities.length > 0) {
    return { ...intent, entities };
  }
  return intent;
}

function checkPascalCase(decl: IntentDecl, ctx: LowerContext): void {
  const name = decl.name.name;
  if (name === "" || isPascalCase(name)) return;
  ctx.emit({
    code: "AX100",
    message: `intent name \`${name}\` is not PascalCase`,
    span: decl.name.span,
    fix: {
      kind: "rename_identifier",
      targetSpan: toProtocolSpan(decl.name.span),
      suggestedEdit: { text: toPascalCase(name) },
    },
  });
}

function collectMeta(decl: IntentDecl): {
  domain?: string;
  category?: string;
  discoverable?: boolean;
  donateOnPerform?: boolean;
} {
  const out: {
    domain?: string;
    category?: string;
    discoverable?: boolean;
    donateOnPerform?: boolean;
  } = {};
  for (const clause of decl.meta) {
    switch (clause.kind) {
      case "DomainMeta":
        out.domain = clause.value.value;
        break;
      case "CategoryMeta":
        out.category = clause.value.value;
        break;
      case "DiscoverableMeta":
        out.discoverable = clause.value.value;
        break;
      case "DonateOnPerformMeta":
        out.donateOnPerform = clause.value.value;
        break;
    }
  }
  return out;
}

// ─── Param + type lowering ─────────────────────────────────────────────

function lowerParam(
  decl: ParamDecl,
  index: NameIndex,
  ctx: LowerContext,
  referencedEntities: Set<string>
): IRParameter {
  const declaredType = lowerType(decl.type, index, ctx, referencedEntities);
  const isOptional = decl.type.kind === "OptionalType";
  const description = decl.description.value;

  let type: IRType = declaredType;
  if (decl.options) {
    type = {
      kind: "dynamicOptions",
      valueType: declaredType,
      providerName: decl.options.provider.name,
    };
  }

  const param: IRParameter = {
    name: decl.name.name,
    type,
    title: description,
    description,
    isOptional,
  };

  if (decl.defaultValue) {
    if (isOptional) {
      ctx.emit({
        code: "AX107",
        message: `optional param \`${decl.name.name}\` has a non-null default — an optional type implies no default`,
        span: decl.defaultValue.span,
        fix: {
          kind: "remove_field",
          targetSpan: toProtocolSpan(decl.defaultValue.span),
        },
      });
    } else {
      checkDefaultType(decl, declaredType, decl.defaultValue, index, ctx);
    }
    return { ...param, defaultValue: literalValue(decl.defaultValue) };
  }

  return param;
}

function checkDefaultType(
  decl: ParamDecl,
  declaredType: IRType,
  literal: LiteralNode,
  index: NameIndex,
  ctx: LowerContext
): void {
  if (literalMatchesType(literal, declaredType, index)) return;
  ctx.emit({
    code: "AX106",
    message: `default value for param \`${decl.name.name}\` does not match declared type`,
    span: literal.span,
    fix: {
      kind: "replace_literal",
      targetSpan: toProtocolSpan(literal.span),
    },
  });
}

function literalMatchesType(
  literal: LiteralNode,
  type: IRType,
  index: NameIndex
): boolean {
  switch (type.kind) {
    case "primitive":
      return literalMatchesPrimitive(literal, type.value);
    case "array":
      return false; // default array literals aren't in the grammar
    case "optional":
      return literalMatchesType(literal, type.innerType, index);
    case "entity":
      return false;
    case "entityQuery":
      return false;
    case "dynamicOptions":
      return literalMatchesType(literal, type.valueType, index);
    case "enum": {
      if (literal.kind !== "IdentLiteral") return false;
      return type.cases.includes(literal.name);
    }
  }
}

function literalMatchesPrimitive(
  literal: LiteralNode,
  primitive: IRPrimitiveType
): boolean {
  switch (literal.kind) {
    case "StringLiteral":
      return primitive === "string" || primitive === "url";
    case "IntegerLiteral":
      return primitive === "int" || primitive === "double" || primitive === "float";
    case "DecimalLiteral":
      return primitive === "double" || primitive === "float";
    case "BooleanLiteral":
      return primitive === "boolean";
    case "IdentLiteral":
      return false;
  }
}

function literalValue(literal: LiteralNode): unknown {
  switch (literal.kind) {
    case "StringLiteral":
      return literal.value;
    case "IntegerLiteral":
    case "DecimalLiteral":
      return literal.value;
    case "BooleanLiteral":
      return literal.value;
    case "IdentLiteral":
      return literal.name;
  }
}

function lowerType(
  node: TypeNode,
  index: NameIndex,
  ctx: LowerContext,
  referencedEntities?: Set<string>
): IRType {
  switch (node.kind) {
    case "PrimitiveType":
      return { kind: "primitive", value: node.primitive };
    case "ArrayType":
      return {
        kind: "array",
        elementType: lowerType(node.element, index, ctx, referencedEntities),
      };
    case "OptionalType":
      return {
        kind: "optional",
        innerType: lowerType(node.inner, index, ctx, referencedEntities),
      };
    case "NamedType":
      return resolveNamedType(node.name, node.span, index, ctx, referencedEntities);
  }
}

function resolveNamedType(
  name: string,
  span: TokenSpan,
  index: NameIndex,
  ctx: LowerContext,
  referencedEntities: Set<string> | undefined
): IRType {
  const entity = index.entities.get(name);
  if (entity) {
    referencedEntities?.add(name);
    const properties = entity.properties.map((p) => lowerProperty(p, index, ctx));
    return { kind: "entity", entityName: name, properties };
  }
  const enumDecl = index.enums.get(name);
  if (enumDecl) {
    return {
      kind: "enum",
      name,
      cases: enumDecl.cases.map((c) => c.name),
    };
  }
  // Unresolved. Disambiguate on casing: lowercase-first reads as a
  // misspelled primitive, PascalCase-first reads as a missing entity.
  if (startsLowercase(name)) {
    ctx.emit({
      code: "AX005",
      message: `unknown type \`${name}\``,
      span,
      fix: {
        kind: "change_type",
        targetSpan: toProtocolSpan(span),
        candidates: [...PARAM_TYPES].sort(),
      },
    });
  } else {
    ctx.emit({
      code: "AX020",
      message: `param or returns references entity \`${name}\` which is not declared in this file`,
      span,
      fix: {
        kind: "replace_identifier",
        targetSpan: toProtocolSpan(span),
        candidates: [...index.entities.keys()].sort(),
      },
    });
  }
  // Return a placeholder so downstream code keeps running.
  return { kind: "primitive", value: "string" };
}

function lowerReturn(
  node: ReturnTypeNode,
  index: NameIndex,
  ctx: LowerContext,
  referencedEntities: Set<string>
): { returnType: IRType; customResultType?: string } {
  switch (node.kind) {
    case "PrimitiveType":
      return { returnType: { kind: "primitive", value: node.primitive } };
    case "ReturnArrayType": {
      const element = lowerReturnAtom(node.element, index, ctx, referencedEntities);
      return { returnType: { kind: "array", elementType: element.returnType } };
    }
    case "NamedType":
      return lowerReturnAtom(node, index, ctx, referencedEntities);
  }
}

function lowerReturnAtom(
  node: PrimitiveType | { kind: "NamedType"; span: TokenSpan; name: string },
  index: NameIndex,
  ctx: LowerContext,
  referencedEntities: Set<string>
): { returnType: IRType; customResultType?: string } {
  if (node.kind === "PrimitiveType") {
    return { returnType: { kind: "primitive", value: node.primitive } };
  }
  const entity = index.entities.get(node.name);
  if (entity) {
    referencedEntities.add(node.name);
    const properties = entity.properties.map((p) => lowerProperty(p, index, ctx));
    return {
      returnType: { kind: "entity", entityName: node.name, properties },
    };
  }
  // Unknown named return type. Per ir-mapping.md, an unknown name lowers to
  // customResultType rather than firing AX020 — the generator defers to the
  // caller's Swift types. We still need a returnType value; emit a string
  // placeholder and surface the custom type on the intent.
  return {
    returnType: { kind: "primitive", value: "string" },
    customResultType: node.name,
  };
}

// ─── Summary lowering ──────────────────────────────────────────────────

function lowerSummary(
  node: SummaryDecl,
  params: readonly IRParameter[],
  index: NameIndex,
  ctx: LowerContext
): IRParameterSummary {
  const paramNames = new Set(params.map((p) => p.name));
  const paramTypes = new Map(params.map((p) => [p.name, p.type]));
  return lowerSummaryNode(node, paramNames, paramTypes, index, ctx);
}

function lowerSummaryNode(
  node: SummaryDecl,
  paramNames: ReadonlySet<string>,
  paramTypes: ReadonlyMap<string, IRType>,
  index: NameIndex,
  ctx: LowerContext
): IRParameterSummary {
  switch (node.kind) {
    case "SummaryTemplate":
      checkTemplateRefs(node.template, paramNames, ctx);
      return { kind: "summary", template: node.template.value };
    case "SummaryWhen": {
      checkParamRef(node.param.name, node.param.span, paramNames, ctx);
      const then = lowerSummaryValue(node.then, paramNames, paramTypes, index, ctx);
      const otherwise = node.otherwise
        ? lowerSummaryValue(node.otherwise, paramNames, paramTypes, index, ctx)
        : undefined;
      return {
        kind: "when",
        parameter: node.param.name,
        then,
        ...(otherwise ? { otherwise } : {}),
      };
    }
    case "SummarySwitch":
      return lowerSummarySwitch(node, paramNames, paramTypes, index, ctx);
  }
}

function lowerSummarySwitch(
  node: SummarySwitch,
  paramNames: ReadonlySet<string>,
  paramTypes: ReadonlyMap<string, IRType>,
  index: NameIndex,
  ctx: LowerContext
): IRParameterSummary {
  checkParamRef(node.param.name, node.param.span, paramNames, ctx);
  const cases = node.cases.map((c) =>
    lowerSummaryCase(c, paramNames, paramTypes, index, ctx)
  );
  const defaultSummary = node.default
    ? lowerSummaryValue(node.default, paramNames, paramTypes, index, ctx)
    : undefined;

  if (!defaultSummary) {
    checkExhaustive(node, cases, paramTypes.get(node.param.name), ctx);
  }

  return {
    kind: "switch",
    parameter: node.param.name,
    cases,
    ...(defaultSummary ? { default: defaultSummary } : {}),
  };
}

function lowerSummaryCase(
  c: SummaryCase,
  paramNames: ReadonlySet<string>,
  paramTypes: ReadonlyMap<string, IRType>,
  index: NameIndex,
  ctx: LowerContext
): { value: string | number | boolean; summary: IRParameterSummary } {
  return {
    value: summaryCaseValue(c.value),
    summary: lowerSummaryValue(c.body, paramNames, paramTypes, index, ctx),
  };
}

function summaryCaseValue(
  value: StringLiteral | IntegerLiteral | DecimalLiteral | BooleanLiteral | IdentLiteral
): string | number | boolean {
  switch (value.kind) {
    case "StringLiteral":
      return value.value;
    case "IntegerLiteral":
    case "DecimalLiteral":
      return value.value;
    case "BooleanLiteral":
      return value.value;
    case "IdentLiteral":
      return value.name;
  }
}

function lowerSummaryValue(
  node: SummaryValue,
  paramNames: ReadonlySet<string>,
  paramTypes: ReadonlyMap<string, IRType>,
  index: NameIndex,
  ctx: LowerContext
): IRParameterSummary {
  if (node.kind === "StringLiteral") {
    checkTemplateRefs(node, paramNames, ctx);
    return { kind: "summary", template: node.value };
  }
  return lowerSummaryNode(node, paramNames, paramTypes, index, ctx);
}

function checkTemplateRefs(
  literal: StringLiteral,
  paramNames: ReadonlySet<string>,
  ctx: LowerContext
): void {
  // Templates use `${name}` for param interpolation. We don't have sub-spans
  // for each reference — point diagnostics at the full template string.
  const pattern = /\$\{([^}]+)\}/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(literal.value)) !== null) {
    const name = match[1]?.trim();
    if (!name || seen.has(name) || paramNames.has(name)) continue;
    seen.add(name);
    ctx.emit({
      code: "AX023",
      message: `summary template references param \`${name}\` which is not declared on this intent`,
      span: literal.span,
      fix: {
        kind: "replace_identifier",
        targetSpan: toProtocolSpan(literal.span),
        candidates: [...paramNames].sort(),
      },
    });
  }
}

function checkParamRef(
  name: string,
  span: TokenSpan,
  paramNames: ReadonlySet<string>,
  ctx: LowerContext
): void {
  if (name === "" || paramNames.has(name)) return;
  ctx.emit({
    code: "AX023",
    message: `summary references param \`${name}\` which is not declared on this intent`,
    span,
    fix: {
      kind: "replace_identifier",
      targetSpan: toProtocolSpan(span),
      candidates: [...paramNames].sort(),
    },
  });
}

function checkExhaustive(
  node: SummarySwitch,
  cases: readonly { value: string | number | boolean }[],
  paramType: IRType | undefined,
  ctx: LowerContext
): void {
  if (!paramType) return;
  const exhausted = isExhaustive(cases, paramType);
  if (exhausted) return;
  ctx.emit({
    code: "AX109",
    message: `summary switch on \`${node.param.name}\` has no default and is not exhaustive`,
    span: zeroWidthAt(endOf(node.span)),
    fix: {
      kind: "insert_required_clause",
      targetSpan: toProtocolSpan(zeroWidthAt(endOf(node.span))),
      suggestedEdit: { text: '\n    default: ""' },
    },
  });
}

function isExhaustive(
  cases: readonly { value: string | number | boolean }[],
  type: IRType
): boolean {
  const atom = unwrapAtom(type);
  if (atom.kind === "primitive" && atom.value === "boolean") {
    const covered = new Set(cases.map((c) => String(c.value)));
    return covered.has("true") && covered.has("false");
  }
  if (atom.kind === "enum") {
    const covered = new Set(cases.map((c) => String(c.value)));
    return atom.cases.every((c) => covered.has(c));
  }
  return false;
}

function unwrapAtom(type: IRType): IRType {
  if (type.kind === "optional") return unwrapAtom(type.innerType);
  if (type.kind === "dynamicOptions") return unwrapAtom(type.valueType);
  return type;
}

// ─── Span helpers ──────────────────────────────────────────────────────

function zeroWidthAt(span: TokenSpan): TokenSpan {
  return {
    startByte: span.startByte,
    endByte: span.startByte,
    startLine: span.startLine,
    startColumn: span.startColumn,
    endLine: span.startLine,
    endColumn: span.startColumn,
  };
}

function endOf(span: TokenSpan): TokenSpan {
  return {
    startByte: span.endByte,
    endByte: span.endByte,
    startLine: span.endLine,
    startColumn: span.endColumn,
    endLine: span.endLine,
    endColumn: span.endColumn,
  };
}

// ─── Small utilities ───────────────────────────────────────────────────

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function toPascalCase(name: string): string {
  if (name.length === 0) return name;
  return name[0]!.toUpperCase() + name.slice(1);
}

function startsLowercase(name: string): boolean {
  if (name.length === 0) return false;
  const c = name.charCodeAt(0);
  return c >= 0x61 && c <= 0x7a;
}
