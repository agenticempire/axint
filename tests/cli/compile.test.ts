import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

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

describe("axint compile — perform stub notice", () => {
  const cli = resolve(__dirname, "../../dist/cli/index.js");
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `axint-compile-notice-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const intentSource = (perform: string) => `
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "MakeThing",
  title: "Make Thing",
  description: "Makes a thing",
  params: {
    length: param.string("Length"),
  },${perform}
});
`;

  it("notes that a perform body was discarded into the stub", () => {
    const file = join(tmpDir, "make-thing.ts");
    writeFileSync(file, intentSource('\n  perform: async () => "done",'), "utf-8");

    const result = spawnSync(
      "node",
      [cli, "compile", file, "--out", tmpDir, "--no-fix-packet"],
      { cwd: tmpDir, encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("perform body is not translated yet");
  });

  it("stays quiet when the definition has no perform body", () => {
    const file = join(tmpDir, "make-thing.ts");
    writeFileSync(file, intentSource(""), "utf-8");

    const result = spawnSync(
      "node",
      [cli, "compile", file, "--out", tmpDir, "--no-fix-packet"],
      { cwd: tmpDir, encoding: "utf-8" }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("perform body");
  });
});
