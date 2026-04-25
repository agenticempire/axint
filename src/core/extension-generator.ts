/**
 * Axint App Extension Generator
 *
 * Emits Swift principal classes for each App Extension target plus an
 * `NSExtension` Info.plist fragment Apple uses to wire the extension
 * point. One Swift file per target keeps the output aligned with how
 * Xcode expects extension bundles to be organized.
 */

import type { IRExtension, IRExtensionKind, IRExtensionTarget } from "./types.js";
import { generatedFileHeader } from "./generator.js";

interface ExtensionKindSpec {
  /** Swift framework to import for this extension point. */
  framework: string;
  /** Base class the principal class must inherit from. */
  baseClass: string;
  /** `NSExtensionPointIdentifier` value Apple expects in Info.plist. */
  pointIdentifier: string;
  /** Method stubs emitted inside the principal class body. */
  methods: string[];
}

const KIND_SPECS: Readonly<Record<IRExtensionKind, ExtensionKindSpec>> = {
  share: {
    framework: "UIKit",
    baseClass: "UIViewController",
    pointIdentifier: "com.apple.share-services",
    methods: [
      "override func isContentValid() -> Bool {",
      "    return true",
      "}",
      "",
      "override func didSelectPost() {",
      "    self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)",
      "}",
      "",
      "override func configurationItems() -> [Any]! {",
      "    return []",
      "}",
    ],
  },
  action: {
    framework: "UIKit",
    baseClass: "UIViewController",
    pointIdentifier: "com.apple.ui-services",
    methods: [
      "override func viewDidLoad() {",
      "    super.viewDidLoad()",
      "}",
      "",
      "@IBAction func done() {",
      "    self.extensionContext?.completeRequest(returningItems: self.extensionContext?.inputItems ?? [], completionHandler: nil)",
      "}",
    ],
  },
  notificationService: {
    framework: "UserNotifications",
    baseClass: "UNNotificationServiceExtension",
    pointIdentifier: "com.apple.usernotifications.service",
    methods: [
      "var contentHandler: ((UNNotificationContent) -> Void)?",
      "var bestAttemptContent: UNMutableNotificationContent?",
      "",
      "override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {",
      "    self.contentHandler = contentHandler",
      "    bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent",
      "    if let bestAttemptContent = bestAttemptContent {",
      "        contentHandler(bestAttemptContent)",
      "    }",
      "}",
      "",
      "override func serviceExtensionTimeWillExpire() {",
      "    if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {",
      "        contentHandler(bestAttemptContent)",
      "    }",
      "}",
    ],
  },
  notificationContent: {
    framework: "UserNotificationsUI",
    baseClass: "UIViewController",
    pointIdentifier: "com.apple.usernotifications.content-extension",
    methods: [
      "override func viewDidLoad() {",
      "    super.viewDidLoad()",
      "}",
      "",
      "func didReceive(_ notification: UNNotification) {",
      "    // Populate UI from notification.request.content",
      "}",
    ],
  },
};

/**
 * Emit the principal class Swift for a single target. The compiler
 * layer loops over targets and invokes this per file.
 */
export function generateSwiftExtensionTarget(target: IRExtensionTarget): string {
  const spec = KIND_SPECS[target.kind];
  const lines: string[] = [];

  lines.push(...generatedFileHeader(`${target.principalClass}.swift`));
  lines.push(``);
  lines.push(`import ${spec.framework}`);
  if (target.kind === "notificationContent") {
    lines.push(`import UserNotifications`);
  }
  lines.push(``);
  lines.push(`class ${target.principalClass}: ${spec.baseClass} {`);
  for (const method of spec.methods) {
    lines.push(method.length ? `    ${method}` : "");
  }
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Combined Swift blob — concatenation of every target's principal
 * class. Used by the validator's post-gen check and by the compiler's
 * primary `swiftCode` output slot.
 */
export function generateSwiftExtension(extension: IRExtension): string {
  if (extension.targets.length === 0) return "";
  return extension.targets
    .map((target) => generateSwiftExtensionTarget(target))
    .join("\n");
}

/**
 * Emit the `NSExtension` Info.plist fragment. Xcode merges this into
 * each extension bundle's plist — one fragment per target.
 */
export function generateExtensionInfoPlist(target: IRExtensionTarget): string {
  const spec = KIND_SPECS[target.kind];
  const lines: string[] = [];

  lines.push(`<!-- Info.plist fragment for ${target.principalClass} -->`);
  lines.push(`<key>CFBundleDisplayName</key>`);
  lines.push(`<string>${escapeXml(target.displayName)}</string>`);
  lines.push(`<key>NSExtension</key>`);
  lines.push(`<dict>`);
  lines.push(`    <key>NSExtensionPointIdentifier</key>`);
  lines.push(`    <string>${spec.pointIdentifier}</string>`);
  lines.push(`    <key>NSExtensionPrincipalClass</key>`);
  lines.push(`    <string>$(PRODUCT_MODULE_NAME).${target.principalClass}</string>`);

  const isShareOrAction = target.kind === "share" || target.kind === "action";
  if (isShareOrAction) {
    lines.push(`    <key>NSExtensionAttributes</key>`);
    lines.push(`    <dict>`);
    lines.push(`        <key>NSExtensionActivationRule</key>`);
    if (target.activationTypes && target.activationTypes.length > 0) {
      lines.push(`        <dict>`);
      const max = target.maxItemCount ?? 1;
      for (const activation of target.activationTypes) {
        lines.push(`            <key>${escapeXml(activation)}</key>`);
        lines.push(`            <integer>${max}</integer>`);
      }
      lines.push(`        </dict>`);
    } else {
      lines.push(`        <string>TRUEPREDICATE</string>`);
    }
    lines.push(`    </dict>`);
  }

  lines.push(`</dict>`);

  return lines.join("\n");
}

/** All fragments joined for display / snapshot. */
export function generateExtensionInfoPlistAll(extension: IRExtension): string {
  return extension.targets
    .map((target) => generateExtensionInfoPlist(target))
    .join("\n\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
