/**
 * Axint App Validator
 *
 * Validates IRApp structures against App protocol requirements.
 * Diagnostic codes: AX500–AX522
 */

import type { Diagnostic, IRApp } from "./types.js";

const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * Validate an IRApp and return diagnostics.
 */
export function validateApp(app: IRApp): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // AX510: App name must be PascalCase
  if (!PASCAL_CASE.test(app.name)) {
    diagnostics.push({
      code: "AX510",
      severity: "error",
      message: `App name "${app.name}" must be PascalCase`,
      file: app.sourceFile,
      suggestion: `Rename to "${toPascalCase(app.name)}"`,
    });
  }

  // AX511: At least one scene required
  if (!app.scenes || app.scenes.length === 0) {
    diagnostics.push({
      code: "AX511",
      severity: "error",
      message: "App must have at least one scene",
      file: app.sourceFile,
      suggestion: 'Add a scene: scenes: [{ kind: "windowGroup", view: "ContentView" }]',
    });
  }

  // AX512: Duplicate scene names
  const sceneNames = app.scenes.map((s) => s.name).filter((n): n is string => !!n);
  const seen = new Set<string>();
  for (const name of sceneNames) {
    if (seen.has(name)) {
      diagnostics.push({
        code: "AX512",
        severity: "error",
        message: `Duplicate scene name: "${name}"`,
        file: app.sourceFile,
        suggestion: "Each named scene must have a unique name.",
      });
    }
    seen.add(name);
  }

  // AX513: Scene view names must be PascalCase
  for (const scene of app.scenes) {
    if (!PASCAL_CASE.test(scene.rootView)) {
      diagnostics.push({
        code: "AX513",
        severity: "warning",
        message: `Scene view "${scene.rootView}" should be PascalCase`,
        file: app.sourceFile,
        suggestion: `Rename to "${toPascalCase(scene.rootView)}"`,
      });
    }
  }

  // AX514: Settings scene should be platform-guarded to macOS
  for (const scene of app.scenes) {
    if (scene.sceneKind === "settings" && !scene.platformGuard) {
      diagnostics.push({
        code: "AX514",
        severity: "info",
        message: 'Settings scene is macOS-only. Consider adding platform: "macOS"',
        file: app.sourceFile,
        suggestion:
          'Add platform: "macOS" to the settings scene for cross-platform apps.',
      });
    }
  }

  // AX515: Multiple WindowGroups without names can be ambiguous
  const unnamedWindowGroups = app.scenes.filter(
    (s) => s.sceneKind === "windowGroup" && !s.name && !s.title
  );
  if (unnamedWindowGroups.length > 1) {
    diagnostics.push({
      code: "AX515",
      severity: "warning",
      message: `${unnamedWindowGroups.length} unnamed WindowGroup scenes. Add titles or names to distinguish them.`,
      file: app.sourceFile,
    });
  }

  return diagnostics;
}

/**
 * Validate generated Swift source for an App struct.
 */
export function validateSwiftAppSource(
  swiftCode: string,
  _appName?: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!swiftCode.includes("@main")) {
    diagnostics.push({
      code: "AX520",
      severity: "error",
      message: "Generated Swift is missing @main attribute",
    });
  }

  if (!swiftCode.includes(": App {")) {
    diagnostics.push({
      code: "AX521",
      severity: "error",
      message: "Generated struct does not conform to App protocol",
    });
  }

  if (!swiftCode.includes("var body: some Scene")) {
    diagnostics.push({
      code: "AX522",
      severity: "error",
      message: "Generated App is missing `var body: some Scene`",
    });
  }

  return diagnostics;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase());
}
