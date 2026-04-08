/**
 * Security Tests — escapeSwiftString
 *
 * Validates that user-controlled strings (titles, descriptions, defaults)
 * cannot inject arbitrary Swift code into the generated output.
 */

import { describe, it, expect } from "vitest";
import { escapeSwiftString } from "../../src/core/generator.js";
import { generateSwift } from "../../src/core/generator.js";
import type { IRIntent } from "../../src/core/types.js";

describe("escapeSwiftString", () => {
  it("escapes backslashes", () => {
    expect(escapeSwiftString("a\\b")).toBe("a\\\\b");
  });

  it("escapes double quotes", () => {
    expect(escapeSwiftString('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes newlines", () => {
    expect(escapeSwiftString("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes carriage returns", () => {
    expect(escapeSwiftString("line1\rline2")).toBe("line1\\rline2");
  });

  it("escapes tabs", () => {
    expect(escapeSwiftString("col1\tcol2")).toBe("col1\\tcol2");
  });

  it("handles combined escape sequences", () => {
    expect(escapeSwiftString('a\\b\n"c"\td')).toBe('a\\\\b\\n\\"c\\"\\td');
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeSwiftString("Hello World")).toBe("Hello World");
    expect(escapeSwiftString("Create Calendar Event")).toBe("Create Calendar Event");
  });

  it("handles empty string", () => {
    expect(escapeSwiftString("")).toBe("");
  });

  it("prevents Swift string interpolation injection", () => {
    // In Swift, \\( starts interpolation. Our escaper doubles the backslash,
    // so the result in Swift source is \\\\( which is a literal backslash + paren.
    const malicious = "\\(ProcessInfo.processInfo.environment)";
    const escaped = escapeSwiftString(malicious);
    // The JS string should have 2 backslashes (Swift sees \\), preventing interpolation
    expect(escaped).toBe("\\\\(ProcessInfo.processInfo.environment)");
    // Verify the backslash was actually doubled (length increases by 1)
    expect(escaped.length).toBe(malicious.length + 1);
  });

  it("prevents closing-quote injection", () => {
    // Attempt to break out of the string literal with raw quotes
    const malicious = '"); import Foundation; print("pwned';
    const escaped = escapeSwiftString(malicious);
    // Verify exact escaped output — all quotes preceded by backslash
    expect(escaped).toBe('\\"); import Foundation; print(\\"pwned');
    // Count escaped quotes — both original quotes should be escaped
    const escapedQuoteCount = (escaped.match(/\\"/g) || []).length;
    expect(escapedQuoteCount).toBe(2);
  });

  it("handles unicode and emoji safely", () => {
    expect(escapeSwiftString("Create Event 📅")).toBe("Create Event 📅");
    expect(escapeSwiftString("Ñoño's café")).toBe("Ñoño's café");
  });
});

describe("generateSwift — injection resistance", () => {
  function makeInjectionIntent(overrides: Partial<IRIntent>): IRIntent {
    return {
      name: "TestIntent",
      title: "Safe Title",
      description: "Safe description",
      parameters: [],
      returnType: { kind: "primitive", value: "string" },
      sourceFile: "test.ts",
      ...overrides,
    };
  }

  it("escapes malicious title — quotes are escaped so string literal stays closed", () => {
    const swift = generateSwift(makeInjectionIntent({ title: '"); system("rm -rf /' }));
    // The quotes in the title are escaped, so the Swift string literal is not broken
    expect(swift).toContain('\\"'); // Escaped quotes present
    // The title line should have the escaped version
    expect(swift).toContain('\\"); system(\\"rm -rf /');
  });

  it("escapes malicious description — interpolation backslash is doubled", () => {
    const swift = generateSwift(
      makeInjectionIntent({ description: '\\(shell("whoami"))' })
    );
    // Backslash is doubled so Swift sees \\( (literal backslash + paren, not interpolation)
    // Quotes inside are also escaped
    expect(swift).toContain('\\\\(shell(\\"whoami\\"))');
  });

  it("escapes malicious parameter descriptions", () => {
    const swift = generateSwift(
      makeInjectionIntent({
        parameters: [
          {
            name: "input",
            type: { kind: "primitive", value: "string" },
            title: 'Title"); exec("evil',
            description: "Normal desc",
            isOptional: false,
          },
        ],
      })
    );
    expect(swift).not.toContain('exec("evil');
    expect(swift).toContain('\\"');
  });

  it("escapes malicious default values", () => {
    const swift = generateSwift(
      makeInjectionIntent({
        parameters: [
          {
            name: "cmd",
            type: { kind: "primitive", value: "string" },
            title: "Command",
            description: "A command",
            isOptional: false,
            defaultValue: '"; import Glibc; system("rm -rf /',
          },
        ],
      })
    );
    expect(swift).not.toContain('system("rm');
    expect(swift).toContain('\\"');
  });
});
