/**
 * Negative-corpus conformance test.
 *
 * Every file under spec/language/examples/broken/ is intentionally invalid and
 * targets exactly one diagnostic code. The filename prefix — `NN-axNNN-…` —
 * declares the expected code. This harness runs tokenize → parse → lower on
 * each file and asserts two things:
 *
 *   1. The expected code fires with the spec-correct `fix.kind` from
 *      spec/language/diagnostic-protocol.md §Fix kinds.
 *   2. Every emitted diagnostic — primary or cascade — satisfies the protocol
 *      invariants: `schemaVersion === 1`, non-null `fix`, `fix.kind` in the
 *      closed six-kind set. AX200–AX202 and AX600 may emit `fix: null` but
 *      those codes live outside the DSL module and can't reach this harness.
 *
 * A fixture whose code isn't wired into DSL lowering yet stays in the corpus
 * as ground truth, listed in `PENDING_LOWERING_CODES`. The harness asserts the
 * code does NOT fire so the allowlist self-tightens — when the code lands in
 * lowering, the "pending" assertion fails and the entry gets removed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { lower, parse } from "../../../src/core/axint-dsl/index.js";
import type { Diagnostic, FixKind } from "../../../src/core/axint-dsl/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(__dirname, "../../../spec/language/examples/broken");

// Mirror of the fix-kind catalog in diagnostic-protocol.md. AX007 is
// context-sensitive and doesn't appear in any fixture filename, so it stays
// out of this table.
const EXPECTED_FIX_KIND: Readonly<Record<string, FixKind>> = {
  AX001: "insert_required_clause",
  AX002: "replace_identifier",
  AX003: "insert_required_clause",
  AX004: "insert_required_clause",
  AX005: "change_type",
  AX015: "insert_required_clause",
  AX020: "replace_identifier",
  AX021: "replace_identifier",
  AX023: "replace_identifier",
  AX100: "rename_identifier",
  AX103: "rename_identifier",
  AX106: "replace_literal",
  AX107: "remove_field",
  AX109: "insert_required_clause",
  AX112: "insert_required_clause",
};

const KNOWN_FIX_KINDS: ReadonlySet<FixKind> = new Set<FixKind>([
  "insert_required_clause",
  "remove_field",
  "replace_literal",
  "change_type",
  "rename_identifier",
  "replace_identifier",
]);

// Codes whose DSL-lowering path isn't wired yet. The fixture stays as the
// v1 ground-truth example; when the code lands in lowering, the pending
// assertion flips red and the entry gets deleted here.
const PENDING_LOWERING_CODES: ReadonlySet<string> = new Set(["AX112"]);

interface Fixture {
  readonly file: string;
  readonly expectedCode: string;
}

function loadFixtures(): Fixture[] {
  return readdirSync(corpusDir)
    .filter((name) => name.endsWith(".axint"))
    .sort()
    .map((file) => {
      const match = /^\d+-(ax\d+)-/i.exec(file);
      if (!match) {
        throw new Error(`corpus fixture "${file}" doesn't match NN-axNNN-*.axint`);
      }
      return { file, expectedCode: match[1].toUpperCase() };
    });
}

function runPipeline(source: string, file: string): Diagnostic[] {
  const parsed = parse(source, { sourceFile: file });
  const lowered = lower(parsed.file, { sourceFile: file });
  return [...parsed.diagnostics, ...lowered.diagnostics];
}

describe("axint-dsl negative corpus", () => {
  const fixtures = loadFixtures();

  it("covers at least ten negative cases", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  for (const { file, expectedCode } of fixtures) {
    const pending = PENDING_LOWERING_CODES.has(expectedCode);
    const label = pending
      ? `${file} — ${expectedCode} (pending lowering)`
      : `${file} — ${expectedCode}`;

    it(label, () => {
      const source = readFileSync(join(corpusDir, file), "utf-8");
      const diagnostics = runPipeline(source, file);

      for (const d of diagnostics) {
        expect(d.schemaVersion, `${file}: ${d.code} schemaVersion`).toBe(1);
        expect(d.file, `${file}: ${d.code} filename`).toBe(file);
        expect(d.fix, `${file}: ${d.code} must carry a Fix`).not.toBeNull();
        expect(
          KNOWN_FIX_KINDS.has(d.fix!.kind),
          `${file}: ${d.code} fix.kind "${d.fix!.kind}"`
        ).toBe(true);
      }

      if (pending) {
        // Flip-red gate: when the code gets wired in lowering this will fail
        // and the allowlist entry must be removed. That's the point.
        const fired = diagnostics.some((d) => d.code === expectedCode);
        expect(
          fired,
          `${file}: ${expectedCode} is listed pending but fired — remove from allowlist`
        ).toBe(false);
        return;
      }

      const matching = diagnostics.filter((d) => d.code === expectedCode);
      expect(matching.length, `${file} should emit ${expectedCode}`).toBeGreaterThan(0);
      expect(matching[0]!.fix!.kind).toBe(EXPECTED_FIX_KIND[expectedCode]);
    });
  }
});
