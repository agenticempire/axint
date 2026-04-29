/**
 * Axint DSL — canonical printer
 *
 * Turns a parsed `FileNode` back into source text. The output obeys the
 * principles in spec/language/principles.md §7 "easy to format": two-space
 * indent, braces on their own closing line, no alignment, no trailing
 * punctuation, one obvious shape per construct.
 *
 * The printer is a pure AST walk. It assumes the input is a well-formed AST
 * produced by the parser — no repair, no reordering, no validation. An AST
 * with clauses out of order is a parser bug (AX007), not something the
 * formatter silently fixes up. Grammar optional fields that are omitted in
 * the AST stay omitted in the output.
 *
 * Idempotence: `printDsl(parse(printDsl(parse(x))))` equals
 * `printDsl(parse(x))` for any input the parser accepts. Semantic
 * equivalence: lowering the reprinted source produces an IR equal to the
 * original modulo spans.
 *
 * Comments: the lexer accepts `#` line comments (grammar §Comments) and the
 * AST intentionally drops them. A reprint therefore discards comments in v1.
 * This is a language decision — the canonical form has no room for free-form
 * prose — not a printer shortcut.
 */

import type {
  EntityDecl,
  EnumDecl,
  FileNode,
  IntentDecl,
  LiteralNode,
  MetaClause,
  PageDecl,
  PageFieldDecl,
  PageModuleDecl,
  ParamDecl,
  PropertyDecl,
  ReturnTypeNode,
  SummaryDecl,
  SummaryValue,
  TypeNode,
} from "./ast.js";

/** Produce canonical `.axint` source for a parsed AST. Output ends with `\n`. */
export function printDsl(file: FileNode): string {
  const w = new Writer();
  file.declarations.forEach((decl, i) => {
    if (i > 0) w.blank();
    switch (decl.kind) {
      case "IntentDecl":
        printIntent(w, decl);
        break;
      case "EntityDecl":
        printEntity(w, decl);
        break;
      case "EnumDecl":
        printEnum(w, decl);
        break;
      case "PageDecl":
        printPage(w, decl);
        break;
    }
  });
  return w.toString();
}

// ─── Writer ──────────────────────────────────────────────────────────

class Writer {
  private readonly lines: string[] = [];
  private depth = 0;

  indent() {
    this.depth += 1;
  }

  dedent() {
    this.depth -= 1;
  }

  line(text: string) {
    this.lines.push("  ".repeat(this.depth) + text);
  }

  blank() {
    this.lines.push("");
  }

  toString() {
    return this.lines.join("\n") + "\n";
  }
}

// ─── Intent ──────────────────────────────────────────────────────────

function printIntent(w: Writer, node: IntentDecl) {
  w.line(`intent ${node.name.name} {`);
  w.indent();
  w.line(`title: ${encodeString(node.title.value)}`);
  w.line(`description: ${encodeString(node.description.value)}`);
  for (const meta of node.meta) printMeta(w, meta);

  for (const param of node.params) {
    w.blank();
    printParam(w, param);
  }

  if (node.summary) {
    w.blank();
    printSummary(w, node.summary);
  }

  if (node.returns) {
    w.blank();
    w.line(`returns: ${renderReturnType(node.returns.type)}`);
  }

  if (node.entitlements) {
    w.blank();
    w.line("entitlements {");
    w.indent();
    for (const value of node.entitlements.values) w.line(encodeString(value.value));
    w.dedent();
    w.line("}");
  }

  if (node.infoPlistKeys) {
    w.blank();
    w.line("infoPlistKeys {");
    w.indent();
    for (const entry of node.infoPlistKeys.entries) {
      w.line(`${encodeString(entry.key.value)}: ${encodeString(entry.value.value)}`);
    }
    w.dedent();
    w.line("}");
  }

  w.dedent();
  w.line("}");
}

function printMeta(w: Writer, meta: MetaClause) {
  switch (meta.kind) {
    case "DomainMeta":
      w.line(`domain: ${encodeString(meta.value.value)}`);
      return;
    case "CategoryMeta":
      w.line(`category: ${encodeString(meta.value.value)}`);
      return;
    case "DiscoverableMeta":
      w.line(`discoverable: ${meta.value.value}`);
      return;
    case "DonateOnPerformMeta":
      w.line(`donateOnPerform: ${meta.value.value}`);
      return;
  }
}

function printParam(w: Writer, node: ParamDecl) {
  w.line(`param ${node.name.name}: ${renderType(node.type)} {`);
  w.indent();
  w.line(`description: ${encodeString(node.description.value)}`);
  if (node.defaultValue) w.line(`default: ${renderLiteral(node.defaultValue)}`);
  if (node.options) w.line(`options: dynamic ${node.options.provider.name}`);
  w.dedent();
  w.line("}");
}

// ─── Entity ──────────────────────────────────────────────────────────

function printEntity(w: Writer, node: EntityDecl) {
  w.line(`entity ${node.name.name} {`);
  w.indent();

  w.line("display {");
  w.indent();
  w.line(`title: ${node.display.title.property.name}`);
  if (node.display.subtitle) {
    w.line(`subtitle: ${node.display.subtitle.property.name}`);
  }
  if (node.display.image) {
    w.line(`image: ${encodeString(node.display.image.asset.value)}`);
  }
  w.dedent();
  w.line("}");

  for (const prop of node.properties) {
    w.blank();
    printProperty(w, prop);
  }

  w.blank();
  w.line(`query: ${node.query.queryKind}`);

  w.dedent();
  w.line("}");
}

function printProperty(w: Writer, node: PropertyDecl) {
  w.line(`property ${node.name.name}: ${renderType(node.type)} {`);
  w.indent();
  w.line(`description: ${encodeString(node.description.value)}`);
  w.dedent();
  w.line("}");
}

// ─── Enum ────────────────────────────────────────────────────────────

function printEnum(w: Writer, node: EnumDecl) {
  const cases = node.cases.map((c) => c.name).join(" ");
  w.line(`enum ${node.name.name} { ${cases} }`);
}

// ─── Public Page ─────────────────────────────────────────────────────

function printPage(w: Writer, node: PageDecl) {
  w.line(`page ${node.name.name} {`);
  w.indent();

  for (const field of node.fields) {
    printPageField(w, field);
  }

  for (const module of node.modules) {
    if (node.fields.length > 0 || module !== node.modules[0]) w.blank();
    printPageModule(w, module);
  }

  w.dedent();
  w.line("}");
}

function printPageModule(w: Writer, node: PageModuleDecl) {
  w.line(`module ${node.id.name} ${encodeString(node.title.value)} {`);
  w.indent();
  for (const field of node.fields) {
    printPageField(w, field);
  }
  w.dedent();
  w.line("}");
}

function printPageField(w: Writer, node: PageFieldDecl) {
  w.line(`${node.name.name}: ${renderLiteral(node.value)}`);
}

// ─── Summary ─────────────────────────────────────────────────────────

function printSummary(w: Writer, node: SummaryDecl) {
  switch (node.kind) {
    case "SummaryTemplate":
      w.line(`summary: ${encodeString(node.template.value)}`);
      return;
    case "SummaryWhen":
      w.line(`summary when ${node.param.name} {`);
      w.indent();
      printSummaryField(w, "then", node.then);
      if (node.otherwise) printSummaryField(w, "otherwise", node.otherwise);
      w.dedent();
      w.line("}");
      return;
    case "SummarySwitch":
      w.line(`summary switch ${node.param.name} {`);
      w.indent();
      for (const c of node.cases) {
        printSummaryField(w, `case ${renderLiteral(c.value)}`, c.body);
      }
      if (node.default) printSummaryField(w, "default", node.default);
      w.dedent();
      w.line("}");
      return;
  }
}

/**
 * Emit a labelled summary value — a leaf string or a nested summary block.
 * For a nested block the opener becomes `${label}: summary when …` with the
 * block body indented one level deeper.
 */
function printSummaryField(w: Writer, label: string, value: SummaryValue) {
  if (value.kind === "StringLiteral") {
    w.line(`${label}: ${encodeString(value.value)}`);
    return;
  }

  switch (value.kind) {
    case "SummaryTemplate":
      w.line(`${label}: ${encodeString(value.template.value)}`);
      return;
    case "SummaryWhen":
      w.line(`${label}: summary when ${value.param.name} {`);
      w.indent();
      printSummaryField(w, "then", value.then);
      if (value.otherwise) printSummaryField(w, "otherwise", value.otherwise);
      w.dedent();
      w.line("}");
      return;
    case "SummarySwitch":
      w.line(`${label}: summary switch ${value.param.name} {`);
      w.indent();
      for (const c of value.cases) {
        printSummaryField(w, `case ${renderLiteral(c.value)}`, c.body);
      }
      if (value.default) printSummaryField(w, "default", value.default);
      w.dedent();
      w.line("}");
      return;
  }
}

// ─── Types ───────────────────────────────────────────────────────────

function renderType(node: TypeNode): string {
  switch (node.kind) {
    case "PrimitiveType":
      return node.primitive;
    case "NamedType":
      return node.name;
    case "ArrayType":
      return `[${renderType(node.element)}]`;
    case "OptionalType":
      return `${renderType(node.inner)}?`;
  }
}

function renderReturnType(node: ReturnTypeNode): string {
  switch (node.kind) {
    case "PrimitiveType":
      return node.primitive;
    case "NamedType":
      return node.name;
    case "ReturnArrayType":
      return `[${renderReturnType(node.element)}]`;
  }
}

// ─── Literals ────────────────────────────────────────────────────────

function renderLiteral(node: LiteralNode): string {
  switch (node.kind) {
    case "StringLiteral":
      return encodeString(node.value);
    case "IntegerLiteral":
      return String(node.value);
    case "DecimalLiteral":
      return formatDecimal(node.value);
    case "BooleanLiteral":
      return node.value ? "true" : "false";
    case "IdentLiteral":
      return node.name;
  }
}

/**
 * Re-encode a decoded string value with the escape set the grammar supports:
 * `\"`, `\\`, `\n`, `\t`. Everything else is written literally — the grammar
 * forbids multi-line strings but we still escape raw control chars so a bad
 * string can't break the reprint.
 */
function encodeString(value: string): string {
  let out = '"';
  for (const ch of value) {
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\n":
        out += "\\n";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        out += ch;
    }
  }
  return out + '"';
}

/**
 * Keep a decimal literal's decimal point visible so it can't be round-tripped
 * back as an integer. `1.0` stays `1.0`, `3.14` stays `3.14`.
 */
function formatDecimal(value: number): string {
  const text = String(value);
  return text.includes(".") ? text : `${text}.0`;
}
