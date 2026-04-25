/**
 * Axint App Enum Generator
 *
 * Turns an `IRAppEnum` into a Swift `enum: String, AppEnum`. The emitted
 * shape is what App Intents / Shortcuts requires as a parameter type:
 * a raw-string enum with `typeDisplayRepresentation` and a
 * `caseDisplayRepresentations` map keyed on each case.
 */

import type { IRAppEnum } from "./types.js";
import { escapeSwiftString, generatedFileHeader } from "./generator.js";

export function generateSwiftAppEnum(appEnum: IRAppEnum): string {
  const lines: string[] = [];

  lines.push(...generatedFileHeader(`${appEnum.name}.swift`));
  lines.push(``);
  lines.push(`import AppIntents`);
  lines.push(``);
  lines.push(`enum ${appEnum.name}: String, AppEnum {`);

  for (const c of appEnum.cases) {
    lines.push(`    case ${c.value}`);
  }
  lines.push(``);

  lines.push(
    `    static var typeDisplayRepresentation: TypeDisplayRepresentation = "${escapeSwiftString(appEnum.title)}"`
  );
  lines.push(``);

  lines.push(
    `    static var caseDisplayRepresentations: [${appEnum.name}: DisplayRepresentation] = [`
  );
  for (const c of appEnum.cases) {
    const repr = displayRepresentation(c.title, c.image);
    lines.push(`        .${c.value}: ${repr},`);
  }
  lines.push(`    ]`);

  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

function displayRepresentation(title: string, image?: string): string {
  const escaped = escapeSwiftString(title);
  if (!image) {
    return `"${escaped}"`;
  }
  return `DisplayRepresentation(title: "${escaped}", image: .init(systemName: "${escapeSwiftString(image)}"))`;
}
