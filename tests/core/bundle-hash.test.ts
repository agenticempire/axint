import { describe, it, expect } from "vitest";

import {
  canonicalizeBundle,
  hashBundle,
  BUNDLE_HASH_HEX_LENGTH,
} from "../../src/core/bundle-hash.js";

describe("canonicalizeBundle", () => {
  it("orders keys deterministically regardless of input order", () => {
    const a = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: "py",
      plist_fragment: "pl",
    });
    const b = canonicalizeBundle({
      plist_fragment: "pl",
      swift_output: "sw",
      ts_source: "ts",
      py_source: "py",
    });
    expect(a).toBe(b);
    expect(a).toBe(
      `{"plist_fragment":"pl","py_source":"py","swift_output":"sw","ts_source":"ts"}`
    );
  });

  it("normalizes missing optional fields to explicit null", () => {
    const noOptionals = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
    });
    const undefinedOptionals = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: undefined,
      plist_fragment: undefined,
    });
    const nullOptionals = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: null,
      plist_fragment: null,
    });
    expect(noOptionals).toBe(undefinedOptionals);
    expect(noOptionals).toBe(nullOptionals);
    expect(noOptionals).toBe(
      `{"plist_fragment":null,"py_source":null,"swift_output":"sw","ts_source":"ts"}`
    );
  });

  it("distinguishes present-but-empty strings from missing fields", () => {
    const empty = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: "",
    });
    const missing = canonicalizeBundle({
      ts_source: "ts",
      swift_output: "sw",
    });
    expect(empty).not.toBe(missing);
  });
});

describe("hashBundle", () => {
  it("returns a 64-char lowercase hex SHA-256", async () => {
    const hash = await hashBundle({
      ts_source: "export default defineIntent({ name: 'X' });",
      swift_output: "struct X: AppIntent {}",
    });
    expect(hash).toHaveLength(BUNDLE_HASH_HEX_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for equivalent bundles", async () => {
    const left = await hashBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: null,
      plist_fragment: null,
    });
    const right = await hashBundle({
      ts_source: "ts",
      swift_output: "sw",
    });
    expect(left).toBe(right);
  });

  it("diverges when any bundle byte changes", async () => {
    const base = await hashBundle({
      ts_source: "alpha",
      swift_output: "beta",
    });
    const altered = await hashBundle({
      ts_source: "alphA",
      swift_output: "beta",
    });
    expect(base).not.toBe(altered);
  });

  it("is stable against a known vector", async () => {
    const hash = await hashBundle({
      ts_source: "ts",
      swift_output: "sw",
      py_source: "py",
      plist_fragment: "pl",
    });
    expect(hash).toBe("9f708e7e282ec5e3a578a18f1d4bc003e144265ea9bc0845337c65c96399bf04");
  });
});
