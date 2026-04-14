import { describe, it, expect, beforeEach } from "vitest";
import { findHelperBinary, lintWithHelper } from "../../src/core/swift-syntax-bridge.js";

/**
 * The Swift helper is optional — CI on Linux and fresh checkouts should
 * see `null` and fall back to the regex validator. These tests guard
 * that contract so we never accidentally make the AST path mandatory.
 */
describe("swift-syntax bridge", () => {
  beforeEach(() => {
    delete process.env.AXINT_SYNTAX_HELPER;
  });

  it("returns null when the helper binary is missing", () => {
    process.env.AXINT_SYNTAX_HELPER = "/definitely/not/a/real/path/axint-syntax";
    expect(findHelperBinary()).toBe(null);
    expect(lintWithHelper("Foo.swift", "struct Foo {}")).toBe(null);
  });
});
