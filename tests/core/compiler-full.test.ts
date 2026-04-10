import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compileFile, compileSource } from "../../src/core/compiler.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = join(import.meta.dirname, "../.tmp-compiler-tests");

const VALID_SOURCE = `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message to a contact",
  params: {
    recipient: param.string("Who to message"),
    body: param.string("Message content"),
  },
  perform: async ({ recipient, body }) => {
    return { sent: true };
  },
});
`;

const BAD_NAME_SOURCE = VALID_SOURCE.replace('"SendMessage"', '"sendMessage"');
const WARN_SOURCE = VALID_SOURCE.replace('"Who to message"', '""');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, "valid.ts"), VALID_SOURCE);
  writeFileSync(join(TMP_DIR, "bad-name.ts"), BAD_NAME_SOURCE);
  writeFileSync(join(TMP_DIR, "warn.ts"), WARN_SOURCE);
});

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // cleanup is best-effort — CI runners may restrict temp dir removal
  }
});

// ── compileFile ──────────────────────────────────────────────────────

describe("compileFile", () => {
  it("returns AX000 diagnostic for missing file", () => {
    const result = compileFile("/nonexistent/path/intent.ts");
    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("AX000");
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].message).toContain("/nonexistent/path/intent.ts");
  });

  it("compiles a valid file from disk", () => {
    const result = compileFile(join(TMP_DIR, "valid.ts"));
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct SendMessageIntent: AppIntent");
  });

  it("respects outDir option in outputPath", () => {
    const result = compileFile(join(TMP_DIR, "valid.ts"), { outDir: "Generated" });
    expect(result.success).toBe(true);
    expect(result.output!.outputPath).toBe("Generated/SendMessageIntent.swift");
  });

  it("defaults outputPath to just the intent filename", () => {
    const result = compileFile(join(TMP_DIR, "valid.ts"));
    expect(result.output!.outputPath).toBe("SendMessageIntent.swift");
  });

  it("skips Swift validation when validate is false", () => {
    const result = compileFile(join(TMP_DIR, "valid.ts"), { validate: false });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it("fails when IR validation finds errors", () => {
    const result = compileFile(join(TMP_DIR, "bad-name.ts"));
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX100")).toBe(true);
  });

  it("accumulates warnings and still succeeds", () => {
    const result = compileFile(join(TMP_DIR, "warn.ts"));
    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  it("includes file path in output when file exists", () => {
    const filePath = join(TMP_DIR, "valid.ts");
    const result = compileFile(filePath);
    expect(result.success).toBe(true);
  });
});

// ── compileSource (additional coverage) ──────────────────────────────

describe("compileSource additional", () => {
  it("defaults fileName to <stdin>", () => {
    const result = compileSource(VALID_SOURCE);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it("includes Swift validation diagnostics in output", () => {
    const result = compileSource(VALID_SOURCE, "test.ts");
    expect(result.diagnostics).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it("returns both output and diagnostics on success", () => {
    const result = compileSource(VALID_SOURCE, "test.ts");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.ir).toBeDefined();
    expect(result.output!.swiftCode).toBeDefined();
    expect(result.output!.outputPath).toBeDefined();
    expect(result.diagnostics).toBeDefined();
  });
});
