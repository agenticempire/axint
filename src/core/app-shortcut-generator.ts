/**
 * Axint App Shortcut Generator
 *
 * Emits a `struct <Name>: AppShortcutsProvider` with a static
 * `appShortcuts` body built by `@AppShortcutsBuilder`. Authors write
 * `${applicationName}` inside phrases; the generator rewrites that to
 * Apple's `\(.applicationName)` string-interpolation token, which the
 * App Intents framework requires at least one phrase per shortcut to
 * contain.
 */

import type { IRAppShortcut, IRAppShortcutEntry } from "./types.js";
import { escapeSwiftString, generatedFileHeader } from "./generator.js";

const APPLICATION_NAME_TOKEN = /\$\{applicationName\}/g;
const SWIFT_APPLICATION_NAME_TOKEN = "\\(.applicationName)";

export function generateSwiftAppShortcut(appShortcut: IRAppShortcut): string {
  const lines: string[] = [];

  lines.push(...generatedFileHeader(`${appShortcut.name}.swift`));
  lines.push(``);
  lines.push(`import AppIntents`);
  lines.push(``);
  lines.push(`struct ${appShortcut.name}: AppShortcutsProvider {`);
  lines.push(`    static var appShortcuts: [AppShortcut] {`);

  appShortcut.shortcuts.forEach((entry, index) => {
    if (index > 0) lines.push(``);
    emitShortcut(lines, entry);
  });

  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

function emitShortcut(lines: string[], entry: IRAppShortcutEntry): void {
  lines.push(`        AppShortcut(`);
  lines.push(`            intent: ${entry.intent}(),`);
  lines.push(`            phrases: [`);
  for (const phrase of entry.phrases) {
    lines.push(`                "${renderPhrase(phrase)}",`);
  }
  lines.push(`            ],`);
  lines.push(`            shortTitle: "${escapeSwiftString(entry.shortTitle)}",`);
  lines.push(
    `            systemImageName: "${escapeSwiftString(entry.systemImageName)}"`
  );
  lines.push(`        )`);
}

/**
 * Rewrite `${applicationName}` → `\(.applicationName)` and escape the
 * surrounding literal the same way the rest of the Swift generators
 * handle string contents. The substitution happens after escaping so
 * the backslash in `\(` isn't double-escaped.
 */
function renderPhrase(phrase: string): string {
  const escaped = escapeSwiftString(phrase);
  return escaped.replace(APPLICATION_NAME_TOKEN, SWIFT_APPLICATION_NAME_TOKEN);
}
