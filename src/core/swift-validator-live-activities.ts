/**
 * Live Activities / ActivityKit Rules (AX740–AX749)
 *
 * Apple's Live Activities API has more ceremony than most frameworks —
 * ActivityAttributes needs a nested ContentState with specific protocol
 * conformances, ActivityConfiguration wants a dynamicIsland closure with
 * four regions, and the whole thing falls over with cryptic errors if
 * any single piece is missing. These rules catch the ten failures that
 * developers run into on their first Live Activity.
 */

import type { Diagnostic } from "./types.js";
import {
  type SwiftDeclaration,
  countNewlinesUpTo,
  findMatchingBrace,
  hasConformance,
  makeDiagnostic,
} from "./swift-ast.js";

export function checkLiveActivities(
  decls: SwiftDeclaration[],
  source: string,
  file: string,
  diagnostics: Diagnostic[]
): void {
  const usesActivityAttributes = /\bActivityAttributes\b/.test(source);
  const hasImport = /\bimport\s+ActivityKit\b/.test(source);

  if (usesActivityAttributes && !hasImport) {
    diagnostics.push(
      makeDiagnostic("AX748", file, 1, {
        message: "File references ActivityAttributes but is missing 'import ActivityKit'",
        suggestion: "Add 'import ActivityKit' at the top of the file.",
      })
    );
  }

  for (const decl of decls) {
    if (hasConformance(decl, "ActivityAttributes")) {
      checkContentState(decl, file, diagnostics);
    }
  }

  checkActivityConfiguration(source, file, diagnostics);
  checkDynamicIslandRegions(source, file, diagnostics);
  checkActivityRequestMainActor(source, file, diagnostics);
}

// ─── AX740–AX742 — ContentState shape ──────────────────────────────

function checkContentState(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const re = /\b(?:struct|class)\s+ContentState\s*(?::\s*([^{]+?))?\s*\{/;
  const match = body.match(re);

  if (!match) {
    diagnostics.push(
      makeDiagnostic("AX740", file, decl.startLine, {
        message: `ActivityAttributes '${decl.name}' is missing nested ContentState type`,
        suggestion:
          "Add: struct ContentState: Codable, Hashable { var progress: Double }",
      })
    );
    return;
  }

  const conformances = (match[1] ?? "")
    .split(/[,&]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const line = decl.startLine + countNewlinesUpTo(body, match.index ?? 0);

  if (!conformances.includes("Codable") && !conformances.includes("Decodable")) {
    diagnostics.push(
      makeDiagnostic("AX741", file, line, {
        message: `ContentState inside '${decl.name}' must conform to Codable`,
        suggestion: "Add ': Codable, Hashable' to the ContentState declaration.",
      })
    );
  }
  if (!conformances.includes("Hashable")) {
    diagnostics.push(
      makeDiagnostic("AX742", file, line, {
        message: `ContentState inside '${decl.name}' must conform to Hashable`,
        suggestion: "Add ', Hashable' to the ContentState declaration.",
      })
    );
  }
}

// ─── AX743 — ActivityConfiguration needs dynamicIsland { } ─────────

function checkActivityConfiguration(
  source: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const re = /\bActivityConfiguration\b[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(source, openIdx);
    if (closeIdx === -1) continue;
    const body = source.slice(openIdx, closeIdx);
    if (!/\bdynamicIsland\s*:?\s*\{/.test(body) && !/\.dynamicIsland\b/.test(body)) {
      diagnostics.push(
        makeDiagnostic("AX743", file, 1 + countNewlinesUpTo(source, m.index), {
          message: "ActivityConfiguration is missing dynamicIsland { } closure",
          suggestion:
            "Every ActivityConfiguration must provide a dynamicIsland { state in DynamicIsland { ... } } block.",
        })
      );
    }
  }
}

// ─── AX744–AX747 — DynamicIsland region checks ─────────────────────

function checkDynamicIslandRegions(
  source: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const re = /\bDynamicIsland\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(source, openIdx);
    if (closeIdx === -1) continue;
    const body = source.slice(openIdx, closeIdx);
    const line = 1 + countNewlinesUpTo(source, m.index);

    const expandedMatch =
      /\bexpandedContent\s*:?\s*\{([\s\S]*?)\}/.exec(body) ??
      /DynamicIslandExpandedRegion\([^)]*\)\s*\{([\s\S]*?)\}/.exec(body);
    if (expandedMatch && expandedMatch[1].trim() === "") {
      diagnostics.push(
        makeDiagnostic("AX744", file, line, {
          message: "DynamicIsland expanded region is empty",
          suggestion: "Populate at least one DynamicIslandExpandedRegion.",
        })
      );
    }

    if (!/\bcompactLeading\s*:?\s*\{/.test(body)) {
      diagnostics.push(
        makeDiagnostic("AX745", file, line, {
          message: "DynamicIsland is missing compactLeading region",
          suggestion: 'Add: compactLeading { Image(systemName: "...") }',
        })
      );
    }
    if (!/\bcompactTrailing\s*:?\s*\{/.test(body)) {
      diagnostics.push(
        makeDiagnostic("AX746", file, line, {
          message: "DynamicIsland is missing compactTrailing region",
          suggestion: 'Add: compactTrailing { Text("...") }',
        })
      );
    }
    if (!/\bminimal\s*:?\s*\{/.test(body)) {
      diagnostics.push(
        makeDiagnostic("AX747", file, line, {
          message: "DynamicIsland is missing minimal region",
          suggestion: 'Add: minimal { Image(systemName: "...") }',
        })
      );
    }
  }
}

// ─── AX749 — Activity.request must be @MainActor ────────────────────

function checkActivityRequestMainActor(
  source: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const re = /\bActivity<[^>]+>\.request\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Walk back up to 40 lines to find the enclosing function signature.
    const before = source.slice(0, m.index);
    const lines = before.split("\n");
    const near = lines.slice(-40).join("\n");
    const onMainActor =
      /@MainActor\b/.test(near) || /\bfunc\b[^{]*\bawait\b[^{]*MainActor/.test(near);
    if (!onMainActor) {
      diagnostics.push(
        makeDiagnostic("AX749", file, 1 + countNewlinesUpTo(source, m.index), {
          message: "Activity<>.request call should be on the main actor",
          suggestion:
            "Wrap the call in Task { @MainActor in ... } or annotate the enclosing function with @MainActor.",
        })
      );
    }
  }
}
