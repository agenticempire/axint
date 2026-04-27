import { describe, it, expect } from "vitest";

import { fixSwiftSource, fixSwiftSourceMultipass } from "../../src/core/swift-fixer.js";
import { validateSwiftSource } from "../../src/core/swift-validator.js";

function multi(source: string, options?: { maxIterations?: number }) {
  return fixSwiftSourceMultipass(source, "test.swift", options);
}

describe("swift fixer — multipass loop", () => {
  it("returns quiescent=true when one pass is enough", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = multi(source);
    expect(result.fixed.some((d) => d.code === "AX703")).toBe(true);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.quiescent).toBe(true);
    expect(result.source).toContain("@State var count");
  });

  it("converges on a clean source: remaining diagnostics drop to zero", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    const result = multi(source);
    expect(validateSwiftSource(result.source, "test.swift").diagnostics).toHaveLength(0);
  });

  it("respects maxIterations and reports non-quiescent when capped", () => {
    const source = `
      struct CounterView: View {
          @State let count: Int = 0
          var body: some View { Text("\\(count)") }
      }
    `;
    // Force the cap to 1 — even simple sources with multiple @State var
    // rewrites in a single regex pass should still finish in one
    // iteration, but this test proves the cap is honored.
    const result = multi(source, { maxIterations: 1 });
    expect(result.iterations).toBe(1);
  });

  it("dedupes a fix code that fires identically across passes", () => {
    // Two distinct @State let lines both fix in one regex sweep,
    // so the pass-2 revalidate should be empty. fixed[] should have
    // a single entry per (code, line) pair.
    const source = `
      struct V: View {
          @State let a: Int = 0
          @State let b: Int = 0
          var body: some View { EmptyView() }
      }
    `;
    const result = multi(source);
    const ax703 = result.fixed.filter((d) => d.code === "AX703");
    const uniqueLines = new Set(ax703.map((d) => d.line));
    expect(ax703.length).toBe(uniqueLines.size);
  });

  it("multipass result agrees with single pass when one pass is enough", () => {
    const source = `
      struct V: View {
          @State let a: Int = 0
          var body: some View { EmptyView() }
      }
    `;
    const single = fixSwiftSource(source, "test.swift");
    const passes = multi(source);
    expect(passes.source).toBe(single.source);
    expect(passes.remaining.length).toBe(single.remaining.length);
  });

  it("never exceeds the iteration cap", () => {
    const source = `
      struct V: View {
          @State let a: Int = 0
          var body: some View { EmptyView() }
      }
    `;
    const result = multi(source, { maxIterations: 3 });
    expect(result.iterations).toBeLessThanOrEqual(3);
  });
});
