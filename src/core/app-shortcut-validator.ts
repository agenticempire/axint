/**
 * Axint App Shortcut IR Validator
 *
 * Structural sanity checks for an `IRAppShortcut` before codegen.
 * These mirror the constraints Apple enforces on
 * `AppShortcutsProvider`:
 *
 *   - one provider per app, up to 10 shortcuts
 *   - every shortcut must declare at least one phrase, and at least one
 *     phrase must reference `${applicationName}` (Apple rejects a
 *     provider at runtime otherwise)
 *   - intent names must be valid Swift type identifiers
 *   - short title and system image name must be present
 *
 * Diagnostic codes: AX810–AX819.
 */

import type { Diagnostic, IRAppShortcut } from "./types.js";

const APPLE_MAX_SHORTCUTS = 10;

export function validateAppShortcut(appShortcut: IRAppShortcut): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!isPascalCase(appShortcut.name)) {
    diagnostics.push({
      code: "AX810",
      severity: "error",
      message: `App Shortcut provider name must be PascalCase, got: ${appShortcut.name}`,
      file: appShortcut.sourceFile,
      suggestion: "Use a PascalCase type name like PizzaShortcuts or AppShortcuts.",
    });
  }

  if (appShortcut.shortcuts.length === 0) {
    diagnostics.push({
      code: "AX811",
      severity: "error",
      message: "AppShortcutsProvider must declare at least one shortcut",
      file: appShortcut.sourceFile,
    });
    return diagnostics;
  }

  if (appShortcut.shortcuts.length > APPLE_MAX_SHORTCUTS) {
    diagnostics.push({
      code: "AX817",
      severity: "error",
      message: `Apple allows at most ${APPLE_MAX_SHORTCUTS} App Shortcuts per provider, got ${appShortcut.shortcuts.length}`,
      file: appShortcut.sourceFile,
      suggestion:
        "Trim the list to 10 or fewer entries — Shortcuts silently drops extras.",
    });
  }

  for (const entry of appShortcut.shortcuts) {
    if (!isSwiftTypeName(entry.intent)) {
      diagnostics.push({
        code: "AX812",
        severity: "error",
        message: `Shortcut intent "${entry.intent}" must be a PascalCase Swift type name`,
        file: appShortcut.sourceFile,
        suggestion: 'Reference the intent struct by name, e.g. intent: "OrderPizza"',
      });
    }

    if (entry.phrases.length === 0) {
      diagnostics.push({
        code: "AX813",
        severity: "error",
        message: `Shortcut "${entry.intent}" must declare at least one phrase`,
        file: appShortcut.sourceFile,
        suggestion:
          'phrases: ["Order pizza with ${applicationName}"] — App Intents requires one.',
      });
      continue;
    }

    const referencesAppName = entry.phrases.some((phrase) =>
      phrase.includes("${applicationName}")
    );
    if (!referencesAppName) {
      diagnostics.push({
        code: "AX814",
        severity: "error",
        message: `Shortcut "${entry.intent}" needs a phrase that references \${applicationName}`,
        file: appShortcut.sourceFile,
        suggestion:
          'At least one phrase must include ${applicationName}, e.g. "Order with ${applicationName}".',
      });
    }

    if (!entry.shortTitle.trim()) {
      diagnostics.push({
        code: "AX815",
        severity: "error",
        message: `Shortcut "${entry.intent}" must have a non-empty shortTitle`,
        file: appShortcut.sourceFile,
      });
    }

    if (!entry.systemImageName.trim()) {
      diagnostics.push({
        code: "AX816",
        severity: "error",
        message: `Shortcut "${entry.intent}" must have a non-empty systemImageName`,
        file: appShortcut.sourceFile,
        suggestion: "Use an SF Symbol name like fork.knife, bicycle, or bolt.fill.",
      });
    }
  }

  return diagnostics;
}

export function validateSwiftAppShortcutSource(swiftCode: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!/\bimport\s+AppIntents\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX818",
      severity: "error",
      message: "Generated App Shortcut code must import AppIntents",
    });
  }
  if (!/:\s*AppShortcutsProvider\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX819",
      severity: "error",
      message: "Generated type must conform to AppShortcutsProvider",
    });
  }
  return diagnostics;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function isSwiftTypeName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}
