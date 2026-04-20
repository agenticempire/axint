import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSwiftSource } from "../../src/core/swift-validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "../../examples/swift");

const CASES: Array<{ file: string; expectedErrors: string[] }> = [
  { file: "broken-intent.swift", expectedErrors: ["AX701", "AX716", "AX719"] },
  { file: "clean-intent.swift", expectedErrors: [] },
  { file: "broken-widget.swift", expectedErrors: ["AX717"] },
  { file: "clean-view.swift", expectedErrors: [] },
];

describe("swift repair examples", () => {
  it("stay aligned with the current validator and fix-packet workflow", () => {
    for (const testCase of CASES) {
      const file = join(examplesDir, testCase.file);
      const source = readFileSync(file, "utf-8");
      const result = validateSwiftSource(source, file);
      const errorCodes = result.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.code);

      for (const code of testCase.expectedErrors) {
        expect(errorCodes, `${testCase.file} should include ${code}`).toContain(code);
      }

      if (testCase.expectedErrors.length === 0) {
        expect(errorCodes, `${testCase.file} should validate cleanly`).toHaveLength(0);
      }
    }
  });
});
