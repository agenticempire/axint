import type { IRUnionValue, IRUnionValueCase } from "./types.js";
import { escapeSwiftString, generatedFileHeader } from "./generator.js";

export function generateSwiftUnionValue(unionValue: IRUnionValue): string {
  const lines: string[] = [];

  lines.push(...generatedFileHeader(`${unionValue.name}.swift`));
  lines.push(``);
  lines.push(`import AppIntents`);
  lines.push(``);
  lines.push(`@UnionValue`);
  lines.push(`enum ${unionValue.name} {`);
  for (const c of unionValue.cases) {
    lines.push(`    case ${c.name}(${c.swiftType})`);
  }
  lines.push(``);
  if (unionValue.title) {
    lines.push(
      `    static var typeDisplayRepresentation: TypeDisplayRepresentation = "${escapeSwiftString(unionValue.title)}"`
    );
    lines.push(``);
  }
  lines.push(
    `    static var caseDisplayRepresentations: [${unionValue.name}: DisplayRepresentation] = [`
  );
  for (const c of unionValue.cases) {
    lines.push(`        .${c.name}: ${displayRepresentation(c)},`);
  }
  lines.push(`    ]`);
  lines.push(`}`);
  lines.push(``);

  return lines.join("\n");
}

function displayRepresentation(c: IRUnionValueCase): string {
  const title = escapeSwiftString(c.title);
  if (!c.image) return `"${title}"`;
  return `DisplayRepresentation(title: "${title}", image: .init(systemName: "${escapeSwiftString(c.image)}"))`;
}
