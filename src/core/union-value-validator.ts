import type { Diagnostic, IRUnionValue } from "./types.js";

const NUMBER_LIKE_TYPES = new Set(["Int", "Double", "Float", "Decimal"]);

export function validateUnionValue(unionValue: IRUnionValue): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!/^[A-Z][A-Za-z0-9]*$/.test(unionValue.name)) {
    diagnostics.push({
      code: "AX820",
      severity: "error",
      message: `UnionValue name "${unionValue.name}" must be PascalCase`,
      file: unionValue.sourceFile,
      suggestion: "Use a PascalCase Swift enum name such as SearchTarget.",
    });
  }

  if (unionValue.cases.length === 0) {
    diagnostics.push({
      code: "AX820",
      severity: "error",
      message: "UnionValue must declare at least one case",
      file: unionValue.sourceFile,
    });
  }

  const numberCases = unionValue.cases.filter((c) => NUMBER_LIKE_TYPES.has(c.swiftType));
  if (numberCases.length > 1) {
    diagnostics.push({
      code: "AX821",
      severity: "warning",
      message:
        "iOS 27 Beta 3 Shortcuts can show duplicate choices when @UnionValue includes multiple number-related cases",
      file: unionValue.sourceFile,
      suggestion: "Use one numeric representation, such as Int or Double, but not both.",
    });
  }

  const hasPlace = unionValue.cases.some((c) => c.swiftType === "PlaceDescriptorEntity");
  const hasString = unionValue.cases.some((c) => c.swiftType === "String");
  if (hasPlace && hasString) {
    diagnostics.push({
      code: "AX822",
      severity: "warning",
      message:
        "iOS 27 Beta 3 Siri may pass String instead of PlaceDescriptorEntity for this @UnionValue",
      file: unionValue.sourceFile,
      suggestion:
        "Keep the String case and add manual conversion from String to PlaceDescriptorEntity.",
    });
  }

  for (const c of unionValue.cases) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(c.name)) {
      diagnostics.push({
        code: "AX823",
        severity: "error",
        message: `UnionValue case "${c.name}" must be lowerCamelCase`,
        file: unionValue.sourceFile,
      });
    }
    if (!/^[A-Za-z_][A-Za-z0-9_.<>?, ]*$/.test(c.swiftType)) {
      diagnostics.push({
        code: "AX824",
        severity: "error",
        message: `UnionValue case "${c.name}" has an unsafe Swift type "${c.swiftType}"`,
        file: unionValue.sourceFile,
        suggestion: "Use a simple Swift type name such as String, URL, or TaskEntity.",
      });
    }
  }

  return diagnostics;
}

export function validateSwiftUnionValueSource(swiftCode: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!swiftCode.includes("import AppIntents")) {
    diagnostics.push({
      code: "AX825",
      severity: "error",
      message: "UnionValue Swift must import AppIntents",
    });
  }
  if (!swiftCode.includes("@UnionValue")) {
    diagnostics.push({
      code: "AX826",
      severity: "error",
      message: "UnionValue Swift must include @UnionValue",
    });
  }
  return diagnostics;
}
