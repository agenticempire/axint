import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  diffSymbols,
  findSwiftInterfaceFiles,
  parseSwiftInterface,
} from "../../scripts/wwdc-diff.js";

describe("WWDC SDK interface discovery", () => {
  it("finds interface and header files without following SDK symlink loops", () => {
    const sdk = mkdtempSync(join(tmpdir(), "axint-sdk-"));
    const moduleDirectory = join(
      sdk,
      "System/Library/Frameworks/AppIntents.framework/Modules/AppIntents.swiftmodule"
    );
    const headerDirectory = join(
      sdk,
      "System/Library/Frameworks/AppIntents.framework/Headers/Nested"
    );
    mkdirSync(moduleDirectory, { recursive: true });
    mkdirSync(headerDirectory, { recursive: true });

    const interfaceFile = join(moduleDirectory, "arm64-apple-ios.swiftinterface");
    const headerFile = join(headerDirectory, "AppIntent.h");
    writeFileSync(interfaceFile, "public protocol AppIntent {}\n");
    writeFileSync(headerFile, "@protocol AppIntent\n@end\n");
    symlinkSync(moduleDirectory, join(moduleDirectory, "CompatibilityLoop"));

    expect(findSwiftInterfaceFiles(sdk)).toEqual([headerFile, interfaceFile].sort());
  });

  it("fails fast when an SDK tree exceeds its configured entry budget", () => {
    const sdk = mkdtempSync(join(tmpdir(), "axint-sdk-budget-"));
    const moduleDirectory = join(
      sdk,
      "System/Library/Frameworks/AppIntents.framework/Modules/AppIntents.swiftmodule"
    );
    mkdirSync(moduleDirectory, { recursive: true });
    writeFileSync(join(moduleDirectory, "one.swiftinterface"), "public struct One {}\n");
    writeFileSync(join(moduleDirectory, "two.swiftinterface"), "public struct Two {}\n");

    expect(() => findSwiftInterfaceFiles(sdk, { maxEntries: 1 })).toThrow(
      "Refusing to continue an unbounded scan"
    );
  });
});

describe("WWDC API diff parsing", () => {
  it("reports added and modified Swift symbols", () => {
    const previous = parseSwiftInterface(
      "public protocol AppIntent {\n  public var title: String { get }\n}\n",
      "AppIntents.swiftinterface"
    );
    const current = parseSwiftInterface(
      "public protocol AppIntent {\n  public var title: LocalizedStringResource { get }\n  public func perform()\n}\n",
      "AppIntents.swiftinterface"
    );
    const diff = diffSymbols(previous, current);

    expect(diff.added.map((symbol) => symbol.name)).toContain("perform");
    expect(diff.modified.map((symbol) => symbol.name)).toContain("title");
  });
});
