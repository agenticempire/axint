export interface Xcode27Beta3Change {
  id: string;
  area: string;
  impact: "required" | "recommended" | "informational";
  summary: string;
  recommendation: string;
}

export const XCODE27_BETA3_CHANGES: readonly Xcode27Beta3Change[] = [
  {
    id: "swift-6-4",
    area: "Swift",
    impact: "required",
    summary: "Xcode 27 beta 3 ships Swift 6.4 and the beta 3 Apple SDKs.",
    recommendation:
      "Run a non-blocking Xcode 27 beta 3 compatibility lane and retain the stable Xcode lane until the SDK is final.",
  },
  {
    id: "apple-silicon-only",
    area: "Xcode",
    impact: "required",
    summary: "Xcode 27 installs and runs only on Apple silicon Macs.",
    recommendation:
      "Provision Apple-silicon build hosts while retaining Universal back-deployment testing where required.",
  },
  {
    id: "ld64-removed",
    area: "Linker",
    impact: "required",
    summary: "The ld64 linker and -ld_classic option are removed.",
    recommendation: "Remove -ld_classic and validate custom linker flags.",
  },
  {
    id: "unique-clang-modules",
    area: "Dependency scanner",
    impact: "required",
    summary:
      "Every Clang module reachable during one Swift dependency scan must have a unique module name.",
    recommendation:
      "Deduplicate vendored module maps and prevent third-party module maps from redeclaring SDK modules.",
  },
  {
    id: "interface-builder-toolchain-mode",
    area: "Interface Builder",
    impact: "recommended",
    summary:
      "The toolchain Interface Builder compilation mode no longer requires a downloaded simulator.",
    recommendation:
      "Use toolchain mode on build servers and keep the simulator mode only as a temporary compatibility escape hatch.",
  },
  {
    id: "swift-test-repetition",
    area: "Testing",
    impact: "recommended",
    summary: "swift test supports --maximum-repetitions and --repeat-until pass|fail.",
    recommendation:
      "Use bounded repetition to prove flaky-test fixes and preserve the repetition receipt.",
  },
] as const;

export interface Xcode27CompatibilityFinding {
  code: "XCODE27_LD_CLASSIC" | "XCODE27_IB_SIMULATOR_MODE";
  severity: "error" | "info";
  message: string;
  recommendation: string;
}

export function analyzeXcode27BuildConfiguration(
  source: string
): Xcode27CompatibilityFinding[] {
  const findings: Xcode27CompatibilityFinding[] = [];

  if (/(?:^|\s)-ld_classic(?:\s|$)/m.test(source)) {
    findings.push({
      code: "XCODE27_LD_CLASSIC",
      severity: "error",
      message: "Build settings still request -ld_classic, which Xcode 27 removed.",
      recommendation:
        "Remove -ld_classic from OTHER_LDFLAGS, xcconfig files, and build scripts.",
    });
  }

  if (
    /\bIBC_COCOATOUCH_COMPILER_MODE\s*=\s*simulator\b/.test(source) ||
    /--cocoatouch-compiler-mode\s+simulator\b/.test(source)
  ) {
    findings.push({
      code: "XCODE27_IB_SIMULATOR_MODE",
      severity: "info",
      message:
        "Interface Builder is pinned to simulator compilation instead of Xcode 27 toolchain mode.",
      recommendation:
        "Remove the opt-out after validating storyboards and nibs in toolchain mode on the build host.",
    });
  }

  return findings;
}

export function findDuplicateClangModuleNames(
  moduleMaps: Array<{ path: string; source: string }>
): Array<{ module: string; paths: string[] }> {
  const names = new Map<string, Set<string>>();
  for (const moduleMap of moduleMaps) {
    const declaration = /\b(?:framework\s+)?module\s+([A-Za-z_][A-Za-z0-9_.]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = declaration.exec(moduleMap.source)) !== null) {
      const paths = names.get(match[1]!) ?? new Set<string>();
      paths.add(moduleMap.path);
      names.set(match[1]!, paths);
    }
  }

  return [...names.entries()]
    .filter(([, paths]) => paths.size > 1)
    .map(([module, paths]) => ({ module, paths: [...paths].sort() }))
    .sort((left, right) => left.module.localeCompare(right.module));
}

export function swiftTestRepetitionArguments(input: {
  maximumRepetitions: number;
  until: "pass" | "fail";
}): string[] {
  if (!Number.isInteger(input.maximumRepetitions) || input.maximumRepetitions < 1) {
    throw new Error("maximumRepetitions must be a positive integer.");
  }
  return [
    "--maximum-repetitions",
    String(input.maximumRepetitions),
    "--repeat-until",
    input.until,
  ];
}
