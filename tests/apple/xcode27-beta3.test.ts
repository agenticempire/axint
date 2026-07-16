import { describe, expect, it } from "vitest";
import {
  analyzeXcode27BuildConfiguration,
  findDuplicateClangModuleNames,
  swiftTestRepetitionArguments,
} from "../../src/apple/xcode27-beta3.js";

describe("Xcode 27 beta 3 compatibility", () => {
  it("finds removed linker flags and the Interface Builder opt-out", () => {
    const findings = analyzeXcode27BuildConfiguration(`
      OTHER_LDFLAGS = $(inherited) -ld_classic
      IBC_COCOATOUCH_COMPILER_MODE = simulator
    `);

    expect(findings.map((finding) => finding.code)).toEqual([
      "XCODE27_LD_CLASSIC",
      "XCODE27_IB_SIMULATOR_MODE",
    ]);
  });

  it("finds duplicate Clang module declarations across module maps", () => {
    expect(
      findDuplicateClangModuleNames([
        { path: "VendorA/module.modulemap", source: "module SharedKit {}" },
        {
          path: "VendorB/module.modulemap",
          source: "framework module SharedKit {}",
        },
      ])
    ).toEqual([
      {
        module: "SharedKit",
        paths: ["VendorA/module.modulemap", "VendorB/module.modulemap"],
      },
    ]);
  });

  it("builds bounded swift test repetition arguments", () => {
    expect(
      swiftTestRepetitionArguments({ maximumRepetitions: 5, until: "fail" })
    ).toEqual(["--maximum-repetitions", "5", "--repeat-until", "fail"]);
  });
});
