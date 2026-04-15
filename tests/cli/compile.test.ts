import { describe, it, expect } from "vitest";

import { countNonBlankLines, compressionRatio } from "../../src/cli/compile.js";

describe("countNonBlankLines", () => {
  it("counts only lines with non-whitespace content", () => {
    expect(countNonBlankLines("a\n\nb\n  \nc")).toBe(3);
  });

  it("returns 0 for empty input", () => {
    expect(countNonBlankLines("")).toBe(0);
  });

  it("returns 0 when every line is blank or whitespace", () => {
    expect(countNonBlankLines("\n   \n\t\n  \t  \n")).toBe(0);
  });

  it("ignores trailing newline", () => {
    expect(countNonBlankLines("a\nb\n")).toBe(2);
  });

  it("handles CRLF and standalone CR by treating them as part of one line", () => {
    // The compiler reads UTF-8 source files where line endings are LF,
    // so this only documents the conservative behaviour.
    expect(countNonBlankLines("a\r\nb")).toBe(2);
  });
});

describe("compressionRatio", () => {
  it("renders Swift-over-TS as a 2-decimal `Nx` string", () => {
    expect(compressionRatio(50, 25)).toBe("0.50x");
    expect(compressionRatio(10, 15)).toBe("1.50x");
  });

  it("rounds to 2 decimals", () => {
    expect(compressionRatio(7, 3)).toBe("0.43x");
  });

  it("returns null when either side is zero (ratio undefined)", () => {
    expect(compressionRatio(0, 10)).toBeNull();
    expect(compressionRatio(10, 0)).toBeNull();
    expect(compressionRatio(0, 0)).toBeNull();
  });
});
