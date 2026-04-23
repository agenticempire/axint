/**
 * Axint App Extension IR Validator
 *
 * Structural sanity checks for an `IRExtension` before codegen. These
 * mirror constraints Apple enforces on extension bundles:
 *
 *   - provider name and every principal class must be a Swift type name
 *   - at least one target per provider
 *   - `maxItemCount` and `activationTypes` apply only to share/action
 *     targets — notification extensions don't use them
 *   - notification extensions take no activation rules at all
 *
 * Diagnostic codes: AX830–AX839.
 */

import type { Diagnostic, IRExtension, IRExtensionKind } from "./types.js";

const NOTIFICATION_KINDS: ReadonlySet<IRExtensionKind> = new Set<IRExtensionKind>([
  "notificationService",
  "notificationContent",
]);

export function validateExtension(extension: IRExtension): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!isPascalCase(extension.name)) {
    diagnostics.push({
      code: "AX830",
      severity: "error",
      message: `Extension provider name must be PascalCase, got: ${extension.name}`,
      file: extension.sourceFile,
      suggestion: "Use a PascalCase name like MyAppExtensions or ShareExtensions.",
    });
  }

  if (extension.targets.length === 0) {
    diagnostics.push({
      code: "AX831",
      severity: "error",
      message: "defineExtension must declare at least one target",
      file: extension.sourceFile,
      suggestion:
        'targets: [{ principalClass: "ShareHandler", kind: "share", displayName: "Share" }]',
    });
    return diagnostics;
  }

  const seen = new Set<string>();
  for (const target of extension.targets) {
    if (!isSwiftTypeName(target.principalClass)) {
      diagnostics.push({
        code: "AX832",
        severity: "error",
        message: `principalClass "${target.principalClass}" must be a PascalCase Swift type name`,
        file: extension.sourceFile,
        suggestion: 'Use a Swift class name, e.g. principalClass: "ShareHandler"',
      });
    }

    if (seen.has(target.principalClass)) {
      diagnostics.push({
        code: "AX833",
        severity: "error",
        message: `Duplicate principalClass "${target.principalClass}" — each target needs its own Swift type`,
        file: extension.sourceFile,
      });
    }
    seen.add(target.principalClass);

    if (!target.displayName.trim()) {
      diagnostics.push({
        code: "AX834",
        severity: "error",
        message: `Target "${target.principalClass}" must have a non-empty displayName`,
        file: extension.sourceFile,
      });
    }

    if (NOTIFICATION_KINDS.has(target.kind)) {
      if (target.maxItemCount !== undefined) {
        diagnostics.push({
          code: "AX835",
          severity: "error",
          message: `Target "${target.principalClass}" (${target.kind}) cannot declare maxItemCount — only share/action targets accept it`,
          file: extension.sourceFile,
        });
      }
      if (target.activationTypes && target.activationTypes.length > 0) {
        diagnostics.push({
          code: "AX836",
          severity: "error",
          message: `Target "${target.principalClass}" (${target.kind}) cannot declare activationTypes — notification extensions don't use NSExtensionActivationRule`,
          file: extension.sourceFile,
        });
      }
    } else {
      if (target.maxItemCount !== undefined && target.maxItemCount < 1) {
        diagnostics.push({
          code: "AX837",
          severity: "error",
          message: `Target "${target.principalClass}" maxItemCount must be >= 1, got ${target.maxItemCount}`,
          file: extension.sourceFile,
        });
      }
    }
  }

  return diagnostics;
}

export function validateSwiftExtensionSource(swiftCode: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!/\bimport\s+(UIKit|UserNotifications|UserNotificationsUI)\b/.test(swiftCode)) {
    diagnostics.push({
      code: "AX838",
      severity: "error",
      message:
        "Generated extension code must import UIKit, UserNotifications, or UserNotificationsUI",
    });
  }
  if (!/\bclass\s+\w+\s*:\s*\w+/.test(swiftCode)) {
    diagnostics.push({
      code: "AX839",
      severity: "error",
      message:
        "Generated extension must declare a principal class conforming to an Apple base type",
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
