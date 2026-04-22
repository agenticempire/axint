/**
 * Axint DSL — Lexer
 *
 * Produces a flat token stream from source text. Whitespace and `#` line
 * comments are skipped — neither carries meaning in the grammar. Every token
 * carries an internal `TokenSpan` with both byte offsets (for fast source
 * slicing and formatter round-trips) and full start/end line/column pairs
 * (so a diagnostic's protocol span is a pure field-rename away — see
 * `diagnostic-protocol.md` on the external `Span` shape).
 *
 * The lexer never throws. Unrecognized bytes become `UNKNOWN` tokens and an
 * AX007 diagnostic; unterminated strings and unknown escapes do the same. The
 * parser decides what an `UNKNOWN` means in context and re-syncs on the next
 * recovery boundary. The stream always ends with a zero-width `EOF` so the
 * parser can peek past the last real token without bounds checks.
 */

import type { Diagnostic, Span } from "./diagnostic.js";
import type { Token, TokenKind, TokenSpan } from "./token.js";
import { KEYWORDS } from "./token.js";

export interface LexResult {
  readonly tokens: readonly Token[];
  /**
   * Lexer-level diagnostics (unterminated string, invalid escape, unknown
   * byte). Empty on a well-formed file. All emit code AX007 with a
   * `remove_field` fix that deletes the offending span — the no-close-match
   * sub-case of the spec's AX007 fix catalog, and the only principled v1
   * repair for a lexical failure.
   */
  readonly diagnostics: readonly Diagnostic[];
}

export interface TokenizeOptions {
  /** Path reported on diagnostics. Defaults to "<anonymous>". */
  readonly sourceFile?: string;
}

/**
 * Tokenize `.axint` source. Returns a stream that always ends with a
 * zero-width EOF token at the source-length byte offset.
 */
export function tokenize(source: string, options: TokenizeOptions = {}): LexResult {
  return new Lexer(source, options.sourceFile ?? "<anonymous>").run();
}

// ─── Internals ───────────────────────────────────────────────────────

const PUNCTUATION: ReadonlyMap<number, TokenKind> = new Map<number, TokenKind>([
  [0x7b, "LBRACE"], // {
  [0x7d, "RBRACE"], // }
  [0x5b, "LBRACKET"], // [
  [0x5d, "RBRACKET"], // ]
  [0x3a, "COLON"], // :
  [0x3f, "QUESTION"], // ?
]);

interface Cursor {
  readonly byte: number;
  readonly line: number;
  readonly column: number;
}

class Lexer {
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private byte = 0;
  private line = 1;
  private column = 1;

  constructor(
    private readonly source: string,
    private readonly file: string
  ) {}

  run(): LexResult {
    // Strip a UTF-8 BOM if present — it would otherwise surface as an
    // UNKNOWN token on byte 0.
    if (this.source.charCodeAt(0) === 0xfeff) {
      this.byte = 1;
    }

    while (this.byte < this.source.length) {
      this.scanNext();
    }

    this.tokens.push({
      kind: "EOF",
      span: this.zeroWidthSpan(),
      value: "",
    });

    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private scanNext(): void {
    const code = this.source.charCodeAt(this.byte);

    // Whitespace: space, tab, LF, CR.
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      this.advance();
      return;
    }

    // Line comment: `#` … end of line.
    if (code === 0x23) {
      while (
        this.byte < this.source.length &&
        this.source.charCodeAt(this.byte) !== 0x0a
      ) {
        this.advance();
      }
      return;
    }

    const punctuation = PUNCTUATION.get(code);
    if (punctuation !== undefined) {
      const start = this.snapshot();
      const lexeme = this.source[this.byte]!;
      this.advance();
      this.tokens.push({ kind: punctuation, span: this.spanFrom(start), value: lexeme });
      return;
    }

    if (code === 0x22) {
      this.scanString();
      return;
    }

    // Leading `-` is only a number when followed by a digit. A bare `-`
    // isn't in the grammar, so it lands as UNKNOWN.
    if (code === 0x2d && isDigit(this.source.charCodeAt(this.byte + 1))) {
      this.scanNumber();
      return;
    }

    if (isDigit(code)) {
      this.scanNumber();
      return;
    }

    if (isIdentStart(code)) {
      this.scanIdentifier();
      return;
    }

    this.emitUnknown();
  }

  private scanString(): void {
    const start = this.snapshot();
    this.advance(); // consume opening "

    let decoded = "";
    let terminated = false;

    while (this.byte < this.source.length) {
      const c = this.source.charCodeAt(this.byte);

      if (c === 0x22) {
        this.advance();
        terminated = true;
        break;
      }

      if (c === 0x0a) {
        // Grammar: no multi-line strings. Close the span before the newline
        // so the error points at the body, not the next line.
        break;
      }

      if (c === 0x5c) {
        this.advance();
        const esc = this.source.charCodeAt(this.byte);
        switch (esc) {
          case 0x22:
            decoded += '"';
            this.advance();
            break;
          case 0x5c:
            decoded += "\\";
            this.advance();
            break;
          case 0x6e:
            decoded += "\n";
            this.advance();
            break;
          case 0x74:
            decoded += "\t";
            this.advance();
            break;
          default: {
            // Unknown escape — keep the literal char so recovery yields a
            // usable value, emit AX007.
            const bad = this.snapshot();
            if (!Number.isNaN(esc)) {
              decoded += this.source[this.byte];
              this.advance();
            }
            this.diagnostics.push(
              this.makeDiagnostic(
                "AX007",
                `unknown string escape \\${String.fromCharCode(esc)}`,
                this.spanFrom(bad)
              )
            );
            break;
          }
        }
        continue;
      }

      decoded += this.source[this.byte];
      this.advance();
    }

    const span = this.spanFrom(start);

    if (!terminated) {
      this.diagnostics.push(
        this.makeDiagnostic("AX007", "unterminated string literal", span)
      );
    }

    this.tokens.push({ kind: "STRING_LITERAL", span, value: decoded });
  }

  private scanNumber(): void {
    const start = this.snapshot();

    if (this.source.charCodeAt(this.byte) === 0x2d) {
      this.advance();
    }

    while (this.byte < this.source.length && isDigit(this.source.charCodeAt(this.byte))) {
      this.advance();
    }

    let isDecimal = false;
    if (
      this.source.charCodeAt(this.byte) === 0x2e &&
      isDigit(this.source.charCodeAt(this.byte + 1))
    ) {
      isDecimal = true;
      this.advance(); // .
      while (
        this.byte < this.source.length &&
        isDigit(this.source.charCodeAt(this.byte))
      ) {
        this.advance();
      }
    }

    const span = this.spanFrom(start);
    const lexeme = this.source.slice(span.startByte, span.endByte);
    this.tokens.push({
      kind: isDecimal ? "DECIMAL_LITERAL" : "INTEGER_LITERAL",
      span,
      value: lexeme,
    });
  }

  private scanIdentifier(): void {
    const start = this.snapshot();

    while (
      this.byte < this.source.length &&
      isIdentPart(this.source.charCodeAt(this.byte))
    ) {
      this.advance();
    }

    const span = this.spanFrom(start);
    const lexeme = this.source.slice(span.startByte, span.endByte);
    const kind = KEYWORDS[lexeme] ?? "IDENTIFIER";
    this.tokens.push({ kind, span, value: lexeme });
  }

  private emitUnknown(): void {
    const start = this.snapshot();
    const lexeme = this.source[this.byte]!;
    this.advance();
    const span = this.spanFrom(start);
    this.tokens.push({ kind: "UNKNOWN", span, value: lexeme });
    this.diagnostics.push(
      this.makeDiagnostic("AX007", `unexpected character ${JSON.stringify(lexeme)}`, span)
    );
  }

  // ─── Cursor + span helpers ─────────────────────────────────────────

  private advance(): void {
    const code = this.source.charCodeAt(this.byte);
    this.byte += 1;
    if (code === 0x0a) {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
  }

  private snapshot(): Cursor {
    return { byte: this.byte, line: this.line, column: this.column };
  }

  private spanFrom(start: Cursor): TokenSpan {
    return {
      startByte: start.byte,
      endByte: this.byte,
      startLine: start.line,
      startColumn: start.column,
      endLine: this.line,
      endColumn: this.column,
    };
  }

  private zeroWidthSpan(): TokenSpan {
    return {
      startByte: this.byte,
      endByte: this.byte,
      startLine: this.line,
      startColumn: this.column,
      endLine: this.line,
      endColumn: this.column,
    };
  }

  private makeDiagnostic(code: string, message: string, span: TokenSpan): Diagnostic {
    // Every lexer diagnostic today is AX007 — malformed bytes the scanner
    // can't tokenize. All three sub-cases (unknown escape, unterminated
    // string, unexpected character) repair by deleting the garbage, which is
    // the `remove_field` fix kind with `suggestedEdit.text: ""`.
    const protocolSpan = toProtocolSpan(span);
    return {
      schemaVersion: 1,
      code,
      severity: "error",
      message,
      file: this.file,
      span: protocolSpan,
      fix: {
        kind: "remove_field",
        targetSpan: protocolSpan,
        suggestedEdit: { text: "" },
      },
    };
  }
}

/**
 * Convert an internal `TokenSpan` to the external protocol `Span`. Pure
 * field-rename — no coordinate math.
 */
export function toProtocolSpan(span: TokenSpan): Span {
  return {
    start: { line: span.startLine, column: span.startColumn },
    end: { line: span.endLine, column: span.endColumn },
  };
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function isIdentStart(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x5f // _
  );
}

function isIdentPart(code: number): boolean {
  return isIdentStart(code) || isDigit(code);
}
