/**
 * Swift Source Validator
 *
 * Parses existing Swift source files and checks them against a small set of
 * rules that catch common App Intent, Widget, and SwiftUI bugs that produce
 * opaque Xcode errors ("type does not conform to protocol ...").
 *
 * This is the inverse direction of the main axint pipeline. Instead of
 * generating Swift from TypeScript, we read already-written Swift and point
 * at problems the developer (or an LLM) will otherwise discover during a
 * ten-minute build failure.
 *
 * The parser is intentionally lightweight — line/brace tracking plus
 * anchored regex. We don't need a full SwiftSyntax tree for the rules we
 * ship; we need something that runs in Node without a Swift toolchain and
 * is fast enough to put inside a build pipeline.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Diagnostic } from "./types.js";
import {
  type SwiftDeclaration,
  countNewlinesUpTo,
  escapeRegex,
  findMatchingBrace,
  findTypeDeclarations,
  hasAttribute,
  hasConformance,
  makeDiagnostic,
  stripCommentsAndStrings,
} from "./swift-ast.js";
import { checkConcurrency } from "./swift-validator-concurrency.js";
import { checkLiveActivities } from "./swift-validator-live-activities.js";

export interface SwiftValidationResult {
  file: string;
  diagnostics: Diagnostic[];
}

export interface SwiftValidationInput {
  file: string;
  source: string;
}

/**
 * Project-context options that unlock cross-file rules (AX841, AX842).
 * Without these, the validator stays in single-input scope.
 *
 *   - `projectRoot` enables filesystem scans (find every .swift file in the
 *     project so we can spot zero-call-site Views and resolve members on
 *     types whose definition isn't in the input set).
 *   - `contextIndexPath` (optional) lets the validator skip the disk walk
 *     and use the catalog written by `axint project index`. Falls back to
 *     scanning `projectRoot` if the index is missing or stale.
 */
export interface ValidateSwiftProjectContext {
  projectRoot?: string;
  contextIndexPath?: string;
}

export function validateSwiftSource(source: string, file: string): SwiftValidationResult {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripCommentsAndStrings(source);
  const decls = findTypeDeclarations(stripped, source);

  checkRequiredFrameworkImports(decls, source, stripped, file, diagnostics);

  for (const decl of decls) {
    checkDuplicateStoredProperties(decl, file, diagnostics);

    if (hasConformance(decl, "AppIntent")) {
      checkAppIntentHasPerform(decl, file, diagnostics);
      checkAppIntentHasTitle(decl, file, diagnostics);
      checkAppIntentHasDescription(decl, file, diagnostics);
      checkAppIntentParametersUseParameterWrapper(decl, file, diagnostics);
    }
    if (hasConformance(decl, "Widget")) {
      checkWidgetHasBody(decl, file, diagnostics);
    }
    if (hasConformance(decl, "TimelineProvider")) {
      checkTimelineProviderMethods(decl, file, diagnostics);
    }
    if (hasConformance(decl, "TimelineEntry")) {
      checkTimelineEntryHasDate(decl, file, diagnostics);
    }
    if (hasConformance(decl, "AppShortcutsProvider")) {
      checkAppShortcutsProviderHasShortcuts(decl, file, diagnostics);
    }
    if (hasConformance(decl, "App")) {
      checkAppHasBody(decl, file, diagnostics);
    }
    if (hasConformance(decl, "View")) {
      checkPropertyWrappersAreVar(decl, file, diagnostics);
      checkViewBodyReferencesDeclaredProperties(decl, file, diagnostics);
    }
  }

  checkConcurrency(decls, source, file, diagnostics);
  checkLiveActivities(decls, source, file, diagnostics);
  checkContainerAccessibilityIdentifierPropagation(source, stripped, file, diagnostics);
  checkInteractiveInputOverlayHitTesting(source, stripped, file, diagnostics);
  checkInvalidSwiftUIFrameOverloads(source, stripped, file, diagnostics);
  checkTypeErasedSwiftUIModifierChains(source, stripped, file, diagnostics);
  checkOpaqueViewReturnsNeedExplicitReturn(source, stripped, file, diagnostics);
  checkComputedPropertiesNeedExplicitReturn(source, stripped, file, diagnostics);
  checkEnumSwitchesCoverDeclaredCases(source, stripped, file, diagnostics);
  checkDenseViewWithoutAffordance(source, stripped, file, diagnostics);
  checkUndefinedBooleanIdentifiers(source, stripped, file, diagnostics);
  checkUndefinedStringInterpolationIdentifiers(source, stripped, file, diagnostics);
  checkMainActorStaticInDefaultValue(source, stripped, file, diagnostics);
  checkViewBuilderReturnType(source, stripped, file, diagnostics);
  checkTypeErasedProtocolMethods(source, stripped, file, diagnostics);
  checkIOS27StateMacroInitializerConflict(decls, source, stripped, file, diagnostics);
  checkIOS27StateMacroSynthesizedInitializer(decls, source, stripped, file, diagnostics);
  checkIOS27DocumentMigration(source, stripped, file, diagnostics);
  checkIOS27DocumentConcurrency(source, stripped, file, diagnostics);
  checkIOS27ToolbarMinimizationRename(source, stripped, file, diagnostics);
  checkIOS27TextFieldStyleMigration(source, stripped, file, diagnostics);
  checkIOS27OnDemandResourcesMigration(source, stripped, file, diagnostics);
  checkIOS27PrivateCloudSampling(source, stripped, file, diagnostics);
  checkIOS27TextSelectionGestureConflict(source, stripped, file, diagnostics);
  checkIOS27TabViewVisibleSelection(source, stripped, file, diagnostics);

  return { file, diagnostics };
}

export function validateSwiftSources(
  inputs: SwiftValidationInput[],
  projectContext?: ValidateSwiftProjectContext
): SwiftValidationResult[] {
  const results = inputs.map((input) => validateSwiftSource(input.source, input.file));

  const diagnosticsByFile = new Map(
    results.map((result) => [result.file, result.diagnostics])
  );

  // HStack-collapse runs even on single-file input — the View whose
  // .frame(maxWidth: .infinity) eats sibling space might be defined in
  // the same file as the HStack that uses it.
  const layoutCrossFile = checkHStackCollapsesInfinityChild(inputs);
  for (const diagnostic of layoutCrossFile) {
    const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
    if (diagnostics) diagnostics.push(diagnostic);
  }

  // Project-aware rules. These only fire when the caller passes a
  // projectRoot — without it we have no view of files outside the input
  // set, so we'd produce false positives.
  if (projectContext?.projectRoot) {
    const projectFiles = collectProjectSwiftFiles(projectContext.projectRoot, inputs);
    if (projectFiles.size > 0) {
      const reachability = checkViewReachability(inputs, projectFiles);
      for (const diagnostic of reachability) {
        const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
        if (diagnostics) diagnostics.push(diagnostic);
      }

      const projectMember = checkProjectIndexMemberAccess(inputs, projectFiles);
      for (const diagnostic of projectMember) {
        const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
        if (diagnostics) diagnostics.push(diagnostic);
      }

      const nestedTypeAccess = checkProjectIndexNestedTypeAccess(inputs, projectFiles);
      for (const diagnostic of nestedTypeAccess) {
        const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
        if (diagnostics) diagnostics.push(diagnostic);
      }

      const conformance = checkSynthesizedConformancePropagation(inputs, projectFiles);
      for (const diagnostic of conformance) {
        const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
        if (diagnostics) diagnostics.push(diagnostic);
      }

      const stateOrphans = checkStateMachineOrphans(inputs, projectFiles);
      for (const diagnostic of stateOrphans) {
        const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
        if (diagnostics) diagnostics.push(diagnostic);
      }
    }
  }

  // AX840 (missing module import) doesn't need a project root — the
  // module-export table is bundled. Runs on every input.
  for (const input of inputs) {
    const moduleDiagnostics = checkMissingModuleImports(input);
    const diagnostics = diagnosticsByFile.get(input.file);
    if (diagnostics) diagnostics.push(...moduleDiagnostics);
  }

  if (inputs.length < 2) return results;

  const crossFile: Diagnostic[] = [
    ...checkSameTargetMissingMembers(inputs),
    ...checkTopLevelSymbolRedeclaration(inputs),
    ...checkCrossFileOptionalArgMismatch(inputs),
  ];
  for (const diagnostic of crossFile) {
    const diagnostics = diagnosticsByFile.get(diagnostic.file ?? "");
    if (diagnostics) diagnostics.push(diagnostic);
  }
  return results;
}

const ACCESSIBILITY_CONTAINER_NAMES = [
  "VStack",
  "HStack",
  "ZStack",
  "LazyVStack",
  "LazyHStack",
  "LazyVGrid",
  "LazyHGrid",
  "Grid",
  "Group",
  "ScrollView",
  "List",
  "Form",
  "Section",
  "NavigationStack",
  "NavigationSplitView",
  "HSplitView",
  "VSplitView",
];

function checkContainerAccessibilityIdentifierPropagation(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const containerPattern = ACCESSIBILITY_CONTAINER_NAMES.join("|");
  const re = new RegExp(
    `\\b(${containerPattern})\\s*(?:<[^>{}]*>)?\\s*(?:\\([^{}]*\\))?\\s*\\{`,
    "g"
  );
  let match: RegExpExecArray | null;

  while ((match = re.exec(stripped)) !== null) {
    const [full, containerName] = match;
    const openBraceIndex = match.index + full.lastIndexOf("{");
    const closeBraceIndex = findMatchingBrace(stripped, openBraceIndex);
    if (closeBraceIndex === -1) continue;

    const body = stripped.slice(openBraceIndex + 1, closeBraceIndex);
    if (!/\.accessibilityIdentifier\s*\(/.test(body)) continue;

    const after = stripped.slice(closeBraceIndex + 1, closeBraceIndex + 900);
    const modifierChain = after.match(
      /^\s*(?:(?:\.[A-Za-z_][A-Za-z0-9_]*\s*(?:\([^)]*\))?\s*)*)\.accessibilityIdentifier\s*\(/s
    );
    if (!modifierChain) continue;

    const identifierOffset = modifierChain[0].lastIndexOf(".accessibilityIdentifier");
    const absoluteOffset = closeBraceIndex + 1 + identifierOffset;
    diagnostics.push(
      makeDiagnostic("AX736", file, 1 + countNewlinesUpTo(source, absoluteOffset), {
        message: `${containerName} has an accessibilityIdentifier while nested controls also define identifiers; UI tests may match the container and hide child identifiers`,
        suggestion:
          "Put the identifier on the specific button/text/row the test needs, or assert on a visible child element instead of tagging the whole container.",
      })
    );
  }
}

function checkInteractiveInputOverlayHitTesting(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const lines = source.split("\n");
  const strippedLines = stripped.split("\n");

  for (let i = 0; i < strippedLines.length; i++) {
    const inputMatch = strippedLines[i]?.match(
      /\b(TextField|TextEditor|SecureField)\s*\(/
    );
    if (!inputMatch) continue;

    const windowStart = i;
    const windowEnd = Math.min(strippedLines.length, i + 18);
    const windowLines = strippedLines.slice(windowStart, windowEnd);
    const windowText = windowLines.join("\n");

    if (!/\.overlay\s*(?:\(|\{)/.test(windowText)) continue;
    if (/\.allowsHitTesting\s*\(\s*false\s*\)/.test(windowText)) continue;

    const overlayLineOffset = windowLines.findIndex((line) =>
      /\.overlay\s*(?:\(|\{)/.test(line)
    );
    const overlayLine =
      overlayLineOffset >= 0 ? windowStart + overlayLineOffset + 1 : i + 1;
    const inputKind = inputMatch[1];
    const nearbySource = lines.slice(windowStart, windowEnd).join("\n");

    if (!/\boverlay\b/i.test(nearbySource)) continue;

    diagnostics.push(
      makeDiagnostic("AX764", file, overlayLine, {
        message: `${inputKind} has an overlay without .allowsHitTesting(false), which can block taps, focus, or text entry`,
        suggestion:
          "If the overlay is decorative or placeholder-only, add `.allowsHitTesting(false)` to the overlay content. Otherwise move the hit target so it does not sit on top of the text input.",
      })
    );
  }
}

function checkIOS27StateMacroInitializerConflict(
  decls: SwiftDeclaration[],
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  for (const decl of decls) {
    if (!hasConformance(decl, "View")) continue;
    const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
    const stateWithInitialValue =
      /@State(?:\s*\([^)]*\))?\s+(?:private\s+|fileprivate\s+|internal\s+|public\s+)?var\s+([A-Za-z_][A-Za-z0-9_]*)[^=\n]*=/g;
    let match: RegExpExecArray | null;

    while ((match = stateWithInitialValue.exec(body)) !== null) {
      const name = match[1]!;
      const assignment = new RegExp(
        `\\b(?:self\\.${escapeRegex(name)}|_${escapeRegex(name)})\\s*=`
      );
      if (!/\binit\s*\(/.test(body) || !assignment.test(body)) continue;

      diagnostics.push(
        makeDiagnostic(
          "AX861",
          file,
          1 + countNewlinesUpTo(source, decl.bodyStart + match.index),
          {
            message: `@State property '${name}' has a declaration-site initial value and is also assigned by an initializer; the Xcode 27 state macro can reject or discard the initializer assignment`,
            suggestion: `Remove the declaration-site value from \`${name}\` and assign it explicitly in init, then verify the synthesized initializer shape with Xcode 27.`,
          }
        )
      );
    }
  }
}

function checkIOS27StateMacroSynthesizedInitializer(
  decls: SwiftDeclaration[],
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  for (const decl of decls) {
    if (!hasConformance(decl, "View")) continue;
    const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
    if (!/@State\b/.test(body)) continue;

    const extensionPattern = new RegExp(
      `\\bextension\\s+${escapeRegex(decl.name)}(?:\\s*:[^{]+)?\\s*\\{`,
      "g"
    );
    let match: RegExpExecArray | null;
    while ((match = extensionPattern.exec(stripped)) !== null) {
      const openBrace = stripped.indexOf("{", match.index);
      const closeBrace = findMatchingBrace(stripped, openBrace);
      if (openBrace === -1 || closeBrace === -1) continue;
      const extensionBody = stripped.slice(openBrace + 1, closeBrace);
      if (!/\bself\.init\s*\(/.test(extensionBody)) continue;

      diagnostics.push(
        makeDiagnostic("AX862", file, 1 + countNewlinesUpTo(source, match.index), {
          message: `Extension initializer for '${decl.name}' delegates to a synthesized memberwise initializer that the Xcode 27 @State macro can disable`,
          suggestion:
            "Assign every stored property explicitly in this initializer instead of delegating to self.init(...), then compile with Xcode 27.",
        })
      );
    }
  }
}

function checkIOS27DocumentMigration(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const conformance =
    /\b(?:struct|class|actor)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*<[^>{}]+>)?\s*:\s*[^{\n]*(?:FileDocument|ReferenceFileDocument)\b/g;
  let match: RegExpExecArray | null;
  while ((match = conformance.exec(stripped)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX863", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "FileDocument and ReferenceFileDocument are deprecated in the 27 SDK document model",
        suggestion:
          "Adopt ReadableDocument for read-only files or Document for read/write files, and migrate DocumentGroup to the matching initializer.",
      })
    );
  }
}

function checkIOS27DocumentConcurrency(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (!/\b(?:DocumentReader|DocumentWriter)\b/.test(stripped)) return;
  const nonisolatedMethod = /\bnonisolated\s+(?:func\s+)?(?:read|write)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = nonisolatedMethod.exec(stripped)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX864", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "DocumentReader and DocumentWriter requirements use @concurrent in the 27 SDK; nonisolated can still execute on MainActor under approachable concurrency",
        suggestion:
          "Replace nonisolated with @concurrent for read/write requirements and keep DocumentGroup factories on MainActor.",
      })
    );
  }
}

function checkIOS27ToolbarMinimizationRename(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const oldModifier = /\.toolbarMinimizeBehavior\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = oldModifier.exec(stripped)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX865", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "toolbarMinimizeBehavior was replaced by toolbarMinimizationBehavior in the 27 SDK",
        suggestion: "Rename this modifier to `.toolbarMinimizationBehavior(...)`.",
      })
    );
  }
}

function checkIOS27TextFieldStyleMigration(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const oldStyle = /\.textFieldStyle\s*\(\s*\.(?:squareBorder|roundedBorder)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = oldStyle.exec(stripped)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX866", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "squareBorder and roundedBorder text field styles are soft deprecated in the 27 SDK",
        suggestion:
          "Use `.textFieldStyle(.bordered)` and add `.textInputBorderShape(...)` when a specific shape is required.",
      })
    );
  }
}

function checkIOS27OnDemandResourcesMigration(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const resourceRequest = /\bNSBundleResourceRequest\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = resourceRequest.exec(stripped)) !== null) {
    diagnostics.push(
      makeDiagnostic("AX867", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "NSBundleResourceRequest and On Demand Resources are deprecated in the 27 SDK",
        suggestion:
          "Move downloadable asset orchestration to Background Assets and retain a migration path for existing resource tags.",
      })
    );
  }
}

function checkIOS27PrivateCloudSampling(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const model = /\bPrivateCloudComputeLanguageModel\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = model.exec(stripped)) !== null) {
    const nearby = stripped.slice(match.index, match.index + 2_000);
    if (
      /\bGenerationOptions\s*\([^)]*\bsamplingMode\s*:/.test(nearby) ||
      /\bsamplingMode\s*:\s*\.(?:randomThreshold|randomTopK|randomTopP)\b/.test(stripped)
    ) {
      continue;
    }

    diagnostics.push(
      makeDiagnostic("AX868", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "PrivateCloudComputeLanguageModel uses greedy decoding in iOS 27 beta 3 unless generation options provide an explicit sampling mode",
        suggestion:
          "Pass a seeded sampling mode such as `GenerationOptions(samplingMode: .randomThreshold(0.95, seed: 42))` to the response call and cover it with deterministic evaluations.",
      })
    );
  }
}

function checkIOS27TextSelectionGestureConflict(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const selection = /\.textSelection\s*\(\s*\.enabled\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = selection.exec(stripped)) !== null) {
    const nearbyStart = Math.max(0, match.index - 1_000);
    const nearby = stripped.slice(nearbyStart, match.index + 1_000);
    if (!/\.gesture\s*\(/.test(nearby) || /\.highPriorityGesture\s*\(/.test(nearby)) {
      continue;
    }

    diagnostics.push(
      makeDiagnostic("AX869", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "Selectable Text gains system selection gestures in iOS 27, which can compete with the nearby custom gesture",
        suggestion:
          "Use `.highPriorityGesture(...)` when the custom gesture must supersede text selection, then test selection and the custom interaction together.",
      })
    );
  }
}

function checkIOS27TabViewVisibleSelection(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const tabView = /\bTabView\s*\(\s*selection\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = tabView.exec(stripped)) !== null) {
    const openBrace = stripped.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(stripped, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;
    const body = stripped.slice(openBrace + 1, closeBrace);
    if (!/\.hidden\s*\(\s*\)/.test(body)) continue;

    diagnostics.push(
      makeDiagnostic("AX870", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "TabView selection must point to a visible tab in iOS and iPadOS 27; this selected TabView contains a hidden tab path",
        suggestion:
          "Before hiding or removing a selected tab, move selection to a visible fallback and add a regression test for the transition.",
      })
    );
  }
}

function checkInvalidSwiftUIFrameOverloads(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const frameCall = /\.frame\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = frameCall.exec(stripped)) !== null) {
    const openParen = stripped.indexOf("(", match.index);
    const closeParen = findMatchingParen(stripped, openParen);
    if (openParen === -1 || closeParen === -1) continue;

    const args = stripped.slice(openParen + 1, closeParen);
    if (!/\bmaxWidth\s*:/.test(args) || !/\bheight\s*:/.test(args)) continue;

    diagnostics.push(
      makeDiagnostic("AX765", file, 1 + countNewlinesUpTo(source, match.index), {
        message:
          "SwiftUI frame(maxWidth:height:alignment:) is not a valid overload and will fail Xcode compilation",
        suggestion:
          "Use `.frame(maxWidth:alignment:)` and chain a separate `.frame(height:alignment:)`, or use `maxHeight:` when you intend the flexible frame overload.",
      })
    );
  }
}

const TYPE_ERASING_SWIFTUI_MODIFIERS = new Set([
  "labelStyle",
  "buttonStyle",
  "controlSize",
  "background",
  "overlay",
  "mask",
  "clipShape",
  "popover",
  "sheet",
  "toolbar",
]);

const KNOWN_SWIFTUI_VIEW_MODIFIERS = new Set([
  "accessibilityIdentifier",
  "accessibilityLabel",
  "accessibilityHint",
  "accessibilityValue",
  "animation",
  "bold",
  "clipShape",
  "controlSize",
  "disabled",
  "font",
  "foregroundColor",
  "foregroundStyle",
  "frame",
  "help",
  "id",
  "labelStyle",
  "layoutPriority",
  "opacity",
  "padding",
  "position",
  "shadow",
  "tint",
]);

function checkTypeErasedSwiftUIModifierChains(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const expressionStart = /\b(Label|Button|Image|TextField|TextEditor)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = expressionStart.exec(stripped)) !== null) {
    const callOpen = stripped.indexOf("(", match.index);
    const callClose = findMatchingParen(stripped, callOpen);
    if (callOpen === -1 || callClose === -1) continue;

    const chain = stripped.slice(callClose + 1, callClose + 900);
    const modifiers = collectLeadingModifierChain(chain);
    const firstTypeEraser = modifiers.findIndex((modifier) =>
      TYPE_ERASING_SWIFTUI_MODIFIERS.has(modifier.name)
    );
    if (firstTypeEraser < 0) continue;

    const risky = modifiers
      .slice(firstTypeEraser + 1)
      .find((modifier) => looksLikeProjectSpecificModifier(modifier.name));
    if (!risky) continue;

    diagnostics.push(
      makeDiagnostic(
        "AX766",
        file,
        1 + countNewlinesUpTo(source, callClose + 1 + risky.offset),
        {
          message: `.${risky.name}(...) appears after .${modifiers[firstTypeEraser]!.name}(...), which can erase the concrete SwiftUI type before a project-specific modifier runs`,
          suggestion:
            "Move the project-specific modifier before the type-erasing SwiftUI modifier, or rewrite it as a generic View modifier so Xcode does not report `value of type 'some View' has no member ...`.",
        }
      )
    );
  }
}

function checkOpaqueViewReturnsNeedExplicitReturn(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const declaration =
    /\b(?:(func)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)|(var)\s+([A-Za-z_][A-Za-z0-9_]*))\s*(?:async\s+)?(?:throws\s+)?(?:->|:)\s*some\s+View\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(stripped)) !== null) {
    const kind = match[1] ? "func" : "var";
    const name = match[2] ?? match[4] ?? "unnamed";
    if (kind === "var" && name === "body") continue;
    if (hasViewBuilderAttribute(stripped, match.index)) continue;

    const openBrace = stripped.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(stripped, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;

    const body = stripped.slice(openBrace + 1, closeBrace);
    if (!/\b(?:let|var)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(body)) continue;
    if (hasTopLevelReturn(body)) continue;
    if (!endsWithLikelyViewExpression(body)) continue;

    diagnostics.push(
      makeDiagnostic("AX767", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `${kind} '${name}' returns some View after local declarations but has no explicit return`,
        suggestion:
          "Prefer `@ViewBuilder` for SwiftUI helpers — it documents intent, supports multi-statement bodies as the surface grows, and matches the style of `var body`. Use an explicit `return` only when the helper truly returns a single expression.",
      })
    );
  }
}

function checkComputedPropertiesNeedExplicitReturn(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  // The type annotation must stay on the declaration line — letting it
  // span newlines made a stored `var count: Int` swallow the next
  // property's declaration and attribute its body to the wrong name.
  const declaration =
    /\bvar\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*((?!some\s+View\b)[A-Za-z_][A-Za-z0-9_<>,\t [\]?!:.&]*)\{/g;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(stripped)) !== null) {
    const name = match[1] ?? "unnamed";
    if (name === "body") continue;
    if (hasViewBuilderAttribute(stripped, match.index)) continue;

    const openBrace = stripped.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(stripped, openBrace);
    if (openBrace === -1 || closeBrace === -1) continue;

    const body = stripped.slice(openBrace + 1, closeBrace);
    const originalBody = source.slice(openBrace + 1, closeBrace);
    if (!/\b(?:let|var)\s+[A-Za-z_][A-Za-z0-9_]*\b/.test(body)) continue;
    if (hasTopLevelReturn(body)) continue;
    if (!endsWithLikelySwiftExpression(originalBody)) continue;

    diagnostics.push(
      makeDiagnostic("AX849", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `Computed property '${name}' declares locals and ends with an expression but has no explicit return`,
        suggestion:
          "Add `return` before the final expression, or refactor the property into a single-expression computed property without local declarations.",
      })
    );
  }
}

function checkEnumSwitchesCoverDeclaredCases(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const decls = findTypeDeclarations(stripped, source);

  for (const decl of decls) {
    if (decl.kind !== "enum") continue;
    const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
    const cases = collectEnumCases(body);
    if (cases.length === 0) continue;

    const switchPattern = /\bswitch\s+self\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = switchPattern.exec(body)) !== null) {
      const switchOpen = body.indexOf("{", match.index);
      const switchClose = findMatchingBrace(body, switchOpen);
      if (switchOpen === -1 || switchClose === -1) continue;

      const switchBody = body.slice(switchOpen + 1, switchClose);
      if (/\b(?:default|@unknown\s+default)\b/.test(switchBody)) continue;

      const seen = collectDottedSwitchCases(switchBody);
      const missing = cases.filter((enumCase) => !seen.has(enumCase.name));
      if (missing.length === 0) continue;

      const switchOffset = decl.bodyStart + match.index;
      diagnostics.push(
        makeDiagnostic("AX860", file, 1 + countNewlinesUpTo(source, switchOffset), {
          message: `Switch over '${decl.name}' is missing case${missing.length === 1 ? "" : "s"} ${missing
            .map((enumCase) => `.${enumCase.name}`)
            .join(", ")}`,
          suggestion: `Add ${missing
            .map((enumCase) => `case .${enumCase.name}:`)
            .join(
              " "
            )} before the next Xcode build, or add an intentional default branch if every future case should share one behavior.`,
        })
      );
    }
  }
}

function checkSameTargetMissingMembers(inputs: SwiftValidationInput[]): Diagnostic[] {
  const typeMembers = collectTypeMemberIndex(inputs);
  if (typeMembers.size === 0) return [];

  const diagnostics: Diagnostic[] = [];
  const reported = new Set<string>();

  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const bindings = collectTypedBindings(stripped, typeMembers);
    const untypedClosureParameters = collectUntypedClosureParameters(stripped);
    if (bindings.size === 0) continue;

    const memberAccess = /\b([a-z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = memberAccess.exec(stripped)) !== null) {
      const objectName = match[1]!;
      const memberName = match[2]!;
      if (untypedClosureParameters.has(objectName)) continue;
      const typeName = bindings.get(objectName);
      if (!typeName) continue;
      if (KNOWN_CROSS_FILE_MEMBER_NAMES.has(memberName)) continue;

      const members = typeMembers.get(typeName);
      if (!members || members.has(memberName)) continue;

      const key = `${input.file}:${objectName}:${typeName}:${memberName}:${match.index}`;
      if (reported.has(key)) continue;
      reported.add(key);

      const diagnostic = makeDiagnostic(
        "AX768",
        input.file,
        1 + countNewlinesUpTo(input.source, match.index),
        {
          message: `Changed Swift files reference '${objectName}.${memberName}', but '${typeName}' in this validation set does not declare '${memberName}'`,
          suggestion:
            "Use a member that exists on the declaring type, include the extension file that defines it, or rerun Xcode if this member is provided by generated code outside the validation set.",
        }
      );

      // Downgrade to `info` when the type is a known system framework type
      // (NSWindow, UIView, CKRecord, AVPlayer, MK*, CL*, SK*, etc.) and our
      // bundled member table for it doesn't exhaustively cover Apple's
      // headers. This collapses the noise floor when validating only a few
      // changed files against system APIs we can't fully mirror.
      if (isPartialSystemTypeCoverage(typeName)) {
        diagnostic.severity = "info";
        diagnostic.suggestion = `'${typeName}' is a system framework type. Axint's bundled member table is partial; verify with Xcode if this member exists. Add it to SYSTEM_TYPE_MEMBERS to silence the warning permanently.`;
      }

      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

const SYSTEM_TYPE_PREFIXES = [
  "NS",
  "UI",
  "CK",
  "AV",
  "MK",
  "CL",
  "SK",
  "MTL",
  "CA",
  "CG",
  "CI",
];

function isPartialSystemTypeCoverage(typeName: string): boolean {
  // Already in our table — coverage is intentional, no downgrade needed.
  if (SYSTEM_TYPE_MEMBERS[typeName]) return false;
  // Two-letter Apple framework prefix (NSView, UIScrollView, CKRecord, ...)
  // followed by an UpperCamel name.
  for (const prefix of SYSTEM_TYPE_PREFIXES) {
    if (typeName.startsWith(prefix)) {
      const tail = typeName.slice(prefix.length);
      if (tail.length > 0 && /^[A-Z]/.test(tail)) return true;
    }
  }
  return false;
}

function collectTypeMemberIndex(
  inputs: SwiftValidationInput[]
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  // Seed with members of common system types so partial validation stops
  // flagging real AppKit/Foundation/SwiftUI references like
  // `window.titlebarAppearsTransparent` when the user only passes a few
  // changed files.
  for (const [typeName, members] of Object.entries(SYSTEM_TYPE_MEMBERS)) {
    index.set(typeName, new Set(members));
  }

  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const declarations = findTypeDeclarations(stripped, input.source);
    for (const declaration of declarations) {
      const typeName = baseSwiftTypeName(declaration.name);
      if (!typeName) continue;
      const members = index.get(typeName) ?? new Set<string>();
      const body = stripped.slice(declaration.bodyStart, declaration.bodyEnd);

      for (const member of collectDeclaredMemberNames(body)) members.add(member);
      index.set(typeName, members);
    }
  }
  return index;
}

// System-type member sets used to silence AX768 false positives when a
// partial validation set references AppKit/Foundation/SwiftUI types whose
// real definitions live outside the input files. These sets cover the
// most common members; the exhaustive surface lives in Apple's headers.
const SYSTEM_TYPE_MEMBERS: Record<string, readonly string[]> = {
  NSWindow: [
    "title",
    "delegate",
    "contentView",
    "contentViewController",
    "frame",
    "minSize",
    "maxSize",
    "styleMask",
    "isOpaque",
    "backgroundColor",
    "titlebarAppearsTransparent",
    "titleVisibility",
    "isMovableByWindowBackground",
    "level",
    "collectionBehavior",
    "tabbingMode",
    "toolbar",
    "toolbarStyle",
    "appearance",
    "isReleasedWhenClosed",
    "makeKeyAndOrderFront",
    "orderOut",
    "close",
    "miniaturize",
    "deminiaturize",
    "performClose",
    "setFrame",
    "setIsVisible",
  ],
  NSWorkspace: [
    "shared",
    "runningApplications",
    "frontmostApplication",
    "menuBarOwningApplication",
    "open",
    "openApplication",
    "selectFile",
    "activateFileViewerSelecting",
    "urlForApplication",
  ],
  NSColor: [
    "white",
    "black",
    "clear",
    "red",
    "green",
    "blue",
    "labelColor",
    "secondaryLabelColor",
    "tertiaryLabelColor",
    "windowBackgroundColor",
    "controlBackgroundColor",
    "controlAccentColor",
    "selectedContentBackgroundColor",
    "separatorColor",
    "withAlphaComponent",
    "blended",
  ],
  NSEvent: [
    "type",
    "modifierFlags",
    "characters",
    "charactersIgnoringModifiers",
    "keyCode",
    "isARepeat",
    "locationInWindow",
    "deltaX",
    "deltaY",
    "deltaZ",
    "addLocalMonitorForEvents",
    "addGlobalMonitorForEvents",
    "removeMonitor",
  ],
  NSApplication: [
    "shared",
    "delegate",
    "windows",
    "mainWindow",
    "keyWindow",
    "activationPolicy",
    "isActive",
    "activate",
    "terminate",
    "run",
    "setActivationPolicy",
  ],
  NSImage: [
    "name",
    "size",
    "isTemplate",
    "draw",
    "lockFocus",
    "unlockFocus",
    "tiffRepresentation",
  ],
  NSScreen: [
    "main",
    "screens",
    "frame",
    "visibleFrame",
    "backingScaleFactor",
    "deviceDescription",
    "safeAreaInsets",
  ],
  URL: [
    "absoluteString",
    "path",
    "lastPathComponent",
    "pathExtension",
    "scheme",
    "host",
    "port",
    "query",
    "fragment",
    "appendingPathComponent",
    "appendingPathExtension",
    "deletingLastPathComponent",
    "deletingPathExtension",
    "standardized",
    "standardizedFileURL",
    "isFileURL",
    "absoluteURL",
    "baseURL",
    "pathComponents",
    "relativePath",
  ],
  URLRequest: [
    "url",
    "httpMethod",
    "httpBody",
    "allHTTPHeaderFields",
    "timeoutInterval",
    "cachePolicy",
    "setValue",
    "addValue",
  ],
  URLSession: [
    "shared",
    "data",
    "dataTask",
    "downloadTask",
    "uploadTask",
    "configuration",
    "delegate",
    "delegateQueue",
  ],
  Date: [
    "timeIntervalSince1970",
    "timeIntervalSinceNow",
    "timeIntervalSinceReferenceDate",
    "addingTimeInterval",
    "advanced",
    "distance",
    "formatted",
    "ISO8601Format",
    "now",
    "distantPast",
    "distantFuture",
  ],
  FileManager: [
    "default",
    "urls",
    "url",
    "fileExists",
    "createDirectory",
    "createFile",
    "removeItem",
    "moveItem",
    "copyItem",
    "contentsOfDirectory",
    "attributesOfItem",
    "homeDirectoryForCurrentUser",
    "temporaryDirectory",
  ],
  Bundle: [
    "main",
    "bundleIdentifier",
    "bundleURL",
    "bundlePath",
    "infoDictionary",
    "url",
    "path",
    "loadNibNamed",
    "object",
  ],
  ProcessInfo: [
    "processInfo",
    "environment",
    "arguments",
    "operatingSystemVersion",
    "isMacCatalystApp",
    "thermalState",
    "isLowPowerModeEnabled",
    "hostName",
    "physicalMemory",
  ],
  UserDefaults: [
    "standard",
    "object",
    "string",
    "integer",
    "double",
    "bool",
    "url",
    "array",
    "dictionary",
    "data",
    "set",
    "register",
    "removeObject",
    "synchronize",
  ],
  NotificationCenter: ["default", "post", "addObserver", "removeObserver", "publisher"],
  Notification: ["name", "object", "userInfo"],
  EnvironmentValues: [
    "colorScheme",
    "horizontalSizeClass",
    "verticalSizeClass",
    "dismiss",
    "openURL",
    "scenePhase",
    "controlSize",
    "isEnabled",
    "locale",
    "timeZone",
    "calendar",
    "displayScale",
    "pixelLength",
    "redactionReasons",
    "openWindow",
    "supportsMultipleWindows",
  ],
  GeometryProxy: ["size", "safeAreaInsets", "frame"],
  ScrollViewProxy: ["scrollTo"],
  ScrollViewReader: ["body"],
  PreviewProvider: ["previews"],
  ScrollGeometry: [
    "contentOffset",
    "contentSize",
    "containerSize",
    "contentInsets",
    "visibleRect",
    "bounds",
  ],
  ScrollPhase: ["idle", "tracking", "interacting", "decelerating", "animating"],
  Animation: [
    "default",
    "linear",
    "easeIn",
    "easeOut",
    "easeInOut",
    "spring",
    "interpolatingSpring",
    "interactiveSpring",
    "smooth",
    "snappy",
    "bouncy",
    "speed",
    "delay",
    "repeatForever",
    "repeatCount",
  ],
  Color: [
    "primary",
    "secondary",
    "accentColor",
    "clear",
    "black",
    "white",
    "gray",
    "red",
    "green",
    "blue",
    "orange",
    "yellow",
    "pink",
    "purple",
    "brown",
    "cyan",
    "indigo",
    "mint",
    "teal",
    "opacity",
    "blended",
    "gradient",
  ],
  Image: [
    "resizable",
    "renderingMode",
    "interpolation",
    "antialiased",
    "symbolRenderingMode",
    "imageScale",
    "system",
  ],
  Text: ["font", "foregroundStyle", "lineLimit", "multilineTextAlignment"],
  Bindable: ["wrappedValue", "projectedValue"],
  Binding: ["wrappedValue", "projectedValue", "constant", "animation"],
  AnyView: ["body"],
  EmptyView: ["body"],
};

function collectDeclaredMemberNames(typeBody: string): Set<string> {
  const members = new Set<string>();
  const patterns = [
    /\b(?:static\s+|class\s+)?(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g,
    /\b(?:static\s+|class\s+)?func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    // Nested type declarations are addressable as `Parent.Nested`. Without
    // this, AX841/AX848 would false-positive on every nested-type reference.
    /\b(?:struct|class|actor|enum|typealias)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(typeBody)) !== null) {
      members.add(match[1]!);
    }
  }

  const casePattern =
    /\bcase\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
  let caseMatch: RegExpExecArray | null;
  while ((caseMatch = casePattern.exec(typeBody)) !== null) {
    for (const name of caseMatch[1]!.split(",")) {
      const trimmed = name.trim();
      if (trimmed) members.add(trimmed);
    }
  }

  return members;
}

/**
 * Walk a type body collecting every property → declared-type pair we can
 * read off the source. Powers AX841's typed-collection-element inference
 * (`for item in store.results` resolves `item: VoiceCaptureResult` when
 * `store: VoiceInboxStore` and `VoiceInboxStore.results` is `[VoiceCaptureResult]`).
 *
 * Type extraction is intentionally narrow — the value is the raw declared
 * type token (e.g. `[VoiceCaptureResult]`, `VoiceCaptureResult?`,
 * `Set<UUID>`). Callers normalize via {@link baseSwiftTypeName} to peel
 * the wrappers when they want the element type.
 */
function collectDeclaredMemberTypes(typeBody: string): Map<string, string> {
  const types = new Map<string, string>();
  // Stored properties with explicit type annotations: `let x: T`, `var x: T`,
  // `static var x: T`, `@StateObject var x: T`. Captures up to a `=`, `{`,
  // or end-of-line so we get the whole annotation including generics and
  // collection wrappers.
  const propertyPattern =
    /\b(?:static\s+|class\s+)?(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^={\n]+?)(?=\s*[={]|\s*$)/gm;
  let match: RegExpExecArray | null;
  while ((match = propertyPattern.exec(typeBody)) !== null) {
    const name = match[1]!;
    const typeAnnotation = match[2]!.trim().replace(/\s+/g, " ");
    if (typeAnnotation) types.set(name, typeAnnotation);
  }
  return types;
}

function collectTypedBindings(
  stripped: string,
  typeMembers: Map<string, Set<string>>,
  projectPropertyTypes?: Map<string, Map<string, string>>
): Map<string, string> {
  const bindings = new Map<string, string>();
  const bindingPattern =
    /\b(?:let|var)\s+([a-z][A-Za-z0-9_]*)\s*(?::\s*([A-Z][A-Za-z0-9_.]*(?:<[^=\n>]+>)?\??))?\s*(?:=\s*([A-Z][A-Za-z0-9_.]*)\s*\()?/g;
  let match: RegExpExecArray | null;
  while ((match = bindingPattern.exec(stripped)) !== null) {
    const name = match[1]!;
    const typeName = baseSwiftTypeName(match[2] ?? match[3] ?? "");
    if (typeName && typeMembers.has(typeName)) bindings.set(name, typeName);
  }

  const functionPattern = /\bfunc\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/g;
  let functionMatch: RegExpExecArray | null;
  while ((functionMatch = functionPattern.exec(stripped)) !== null) {
    for (const rawParam of functionMatch[1]!.split(",")) {
      const paramMatch = rawParam.match(
        /\b(?:[A-Za-z_][A-Za-z0-9_]*\s+)?([a-z][A-Za-z0-9_]*)\s*:\s*([A-Z][A-Za-z0-9_.]*(?:<[^>]+>)?\??)/
      );
      if (!paramMatch) continue;
      const typeName = baseSwiftTypeName(paramMatch[2] ?? "");
      if (typeName && typeMembers.has(typeName)) bindings.set(paramMatch[1]!, typeName);
    }
  }

  // Closure-bound iteration variables. Without these we silently miss the
  // most common cross-file member-resolution case in SwiftUI code:
  //
  //   ForEach(store.results) { item in
  //       Text(item.headline)        // member access on closure parameter
  //   }
  //
  //   for item in store.results { item.headline }
  //
  // We resolve `store` to its project-indexed type, look up the declared
  // type of `results` (`[VoiceCaptureResult]`), peel the collection wrapper
  // to get `VoiceCaptureResult`, and bind the closure parameter to it.
  if (projectPropertyTypes) {
    bindClosureLoopVariables(stripped, bindings, typeMembers, projectPropertyTypes);
  }

  return bindings;
}

/**
 * `ForEach(receiver.property) { name in ... }` and
 * `for name in receiver.property { ... }`
 *
 * Resolve `receiver`'s type (already in `bindings`), look up `property`'s
 * declared type on that type (`projectPropertyTypes`), peel the collection
 * wrapper, and bind `name` to the element type so downstream member-access
 * checks fire on it.
 */
function bindClosureLoopVariables(
  stripped: string,
  bindings: Map<string, string>,
  typeMembers: Map<string, Set<string>>,
  projectPropertyTypes: Map<string, Map<string, string>>
): void {
  const forEachPattern =
    /\bForEach\s*\(\s*([a-z][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\b[^)]*\)\s*\{\s*([a-z][A-Za-z0-9_]*)\s+in\b/g;
  let match: RegExpExecArray | null;
  while ((match = forEachPattern.exec(stripped)) !== null) {
    const receiver = match[1]!;
    const property = match[2]!;
    const loopVar = match[3]!;
    const elementType = resolveCollectionElementType(
      receiver,
      property,
      bindings,
      typeMembers,
      projectPropertyTypes
    );
    if (elementType) bindings.set(loopVar, elementType);
  }

  const forInPattern =
    /\bfor\s+([a-z][A-Za-z0-9_]*)\s+in\s+([a-z][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;
  while ((match = forInPattern.exec(stripped)) !== null) {
    const loopVar = match[1]!;
    const receiver = match[2]!;
    const property = match[3]!;
    const elementType = resolveCollectionElementType(
      receiver,
      property,
      bindings,
      typeMembers,
      projectPropertyTypes
    );
    if (elementType) bindings.set(loopVar, elementType);
  }

  // ForEach(items) { item in ... } — receiver IS the collection itself,
  // already typed in `bindings` via let/var collection annotation.
  const forEachDirectPattern =
    /\bForEach\s*\(\s*([a-z][A-Za-z0-9_]*)\s*\)\s*\{\s*([a-z][A-Za-z0-9_]*)\s+in\b/g;
  while ((match = forEachDirectPattern.exec(stripped)) !== null) {
    const receiver = match[1]!;
    const loopVar = match[2]!;
    // No explicit property — receiver itself must be a collection-typed
    // local. We don't currently track that as a binding, so skip until we
    // have the data. (Tracked for AX841 follow-up.)
    void receiver;
    void loopVar;
  }
}

function resolveCollectionElementType(
  receiver: string,
  property: string,
  bindings: Map<string, string>,
  typeMembers: Map<string, Set<string>>,
  projectPropertyTypes: Map<string, Map<string, string>>
): string | undefined {
  const receiverType = bindings.get(receiver);
  if (!receiverType) return undefined;
  const propertyTypes = projectPropertyTypes.get(receiverType);
  if (!propertyTypes) return undefined;
  const rawType = propertyTypes.get(property);
  if (!rawType) return undefined;
  const elementType = peelCollectionWrapper(rawType);
  if (elementType && typeMembers.has(elementType)) return elementType;
  return undefined;
}

/**
 * `[VoiceCaptureResult]` → `VoiceCaptureResult`
 * `Set<UUID>` → `UUID`
 * `Array<Foo>` → `Foo`
 * `[String: Foo]` → undefined (dictionary value, not a single element type)
 */
function peelCollectionWrapper(raw: string): string | undefined {
  const cleaned = raw.replace(/\?\s*$/, "").trim();
  // [Element] form — disallow `:` to filter out dictionaries.
  const arrayMatch = cleaned.match(/^\[\s*([A-Z][A-Za-z0-9_.]*)\s*\]$/);
  if (arrayMatch) return baseSwiftTypeName(arrayMatch[1]!);
  // Array<Element>, Set<Element>, OrderedSet<Element>, Slice<Element>...
  const genericMatch = cleaned.match(
    /^(?:Array|Set|OrderedSet|ContiguousArray|Slice|ArraySlice)\s*<\s*([A-Z][A-Za-z0-9_.]*)\s*>$/
  );
  if (genericMatch) return baseSwiftTypeName(genericMatch[1]!);
  return undefined;
}

function collectUntypedClosureParameters(stripped: string): Set<string> {
  const parameters = new Set<string>();
  const closurePattern = /\{\s*([a-z][A-Za-z0-9_]*)\s+in\b/g;
  let match: RegExpExecArray | null;
  while ((match = closurePattern.exec(stripped)) !== null) {
    parameters.add(match[1]!);
  }
  return parameters;
}

function baseSwiftTypeName(raw: string): string | undefined {
  const cleaned = raw
    .replace(/\?.*$/, "")
    .replace(/<.*$/, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(".")
    .at(-1)
    ?.trim();
  return cleaned && /^[A-Z][A-Za-z0-9_]*$/.test(cleaned) ? cleaned : undefined;
}

const KNOWN_CROSS_FILE_MEMBER_NAMES = new Set([
  "allCases",
  "count",
  "debugDescription",
  "description",
  "hashValue",
  "id",
  "isEmpty",
  "localizedDescription",
  "rawValue",
  "self",
]);

function hasViewBuilderAttribute(stripped: string, declarationIndex: number): boolean {
  const prefix = stripped.slice(Math.max(0, declarationIndex - 180), declarationIndex);
  return /@ViewBuilder\s*(?:\n|\s)*(?:private|fileprivate|internal|public|static|\s)*$/.test(
    prefix
  );
}

function hasTopLevelReturn(body: string): boolean {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (
      depth === 0 &&
      /\breturn\b/.test(body.slice(i, i + 12)) &&
      !/[A-Za-z0-9_]/.test(body[i - 1] ?? "") &&
      !/[A-Za-z0-9_]/.test(body[i + 6] ?? "")
    ) {
      return true;
    }
  }
  return false;
}

function endsWithLikelyViewExpression(body: string): boolean {
  const cleaned = body.trim().replace(/;+\s*$/, "");
  return /(?:VStack|HStack|ZStack|Text|Button|ScrollView|List|LazyVStack|LazyHStack|Group|Section|ForEach|AnyView|Image|Label|Form|NavigationStack|NavigationSplitView|HSplitView|VSplitView)\s*(?:\(|\{)/.test(
    cleaned
  );
}

function endsWithLikelySwiftExpression(body: string): boolean {
  const cleaned = body
    .trim()
    .replace(/;+\s*$/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!cleaned) return false;
  if (
    /^(?:let|var|if|guard|switch|for|while|do|defer|return|throw|case|default)\b/.test(
      cleaned
    )
  )
    return false;
  return /^(?:"|\.?[A-Za-z_][A-Za-z0-9_]*|\d|\[|\(|#)/.test(cleaned);
}

function collectDottedSwitchCases(body: string): Set<string> {
  const seen = new Set<string>();
  const casePattern = /\bcase\s+([^:]+):/g;
  let match: RegExpExecArray | null;
  while ((match = casePattern.exec(body)) !== null) {
    for (const dotted of match[1]!.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      seen.add(dotted[1]!);
    }
  }
  return seen;
}

function collectLeadingModifierChain(
  source: string
): Array<{ name: string; offset: number }> {
  const modifiers: Array<{ name: string; offset: number }> = [];
  let index = 0;

  while (index < source.length) {
    const prefix = source.slice(index).match(/^\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*/);
    if (!prefix) break;
    const name = prefix[1]!;
    const nameOffset = index + prefix[0].lastIndexOf(name);
    index += prefix[0].length;

    if (source[index] === "(") {
      const close = findMatchingParen(source, index);
      if (close === -1) break;
      index = close + 1;
    } else if (source[index] === "{") {
      const close = findMatchingBrace(source, index);
      if (close === -1) break;
      index = close + 1;
    }

    modifiers.push({ name, offset: nameOffset });
  }

  return modifiers;
}

function looksLikeProjectSpecificModifier(name: string): boolean {
  if (KNOWN_SWIFTUI_VIEW_MODIFIERS.has(name)) return false;
  if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) return false;
  return /(?:Icon|Pill|Card|Badge|Chip|Row|Tile|Avatar|Swarm|Agent|Project)/.test(name);
}

function findMatchingParen(source: string, openIndex: number): number {
  if (openIndex < 0 || source[openIndex] !== "(") return -1;
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function checkDuplicateStoredProperties(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (!["struct", "class", "actor"].includes(decl.kind)) return;

  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const strippedBody = stripCommentsAndStrings(body);
  const lines = body.split("\n");
  const strippedLines = strippedBody.split("\n");
  const seen = new Map<string, number>();
  let depth = 0;

  for (let i = 0; i < strippedLines.length; i++) {
    const strippedLine = strippedLines[i] ?? "";
    const rawLine = lines[i] ?? "";
    const trimmed = strippedLine.trim();

    if (
      depth === 0 &&
      trimmed &&
      !trimmed.includes("{") &&
      !trimmed.includes("}") &&
      !/\bfunc\b|\binit\b|\bsubscript\b/.test(trimmed)
    ) {
      const match = rawLine.match(
        /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|weak|unowned|nonisolated)\s+)*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/
      );
      const name = match?.[1];
      if (name) {
        const previousLine = seen.get(name);
        if (previousLine !== undefined) {
          diagnostics.push(
            makeDiagnostic("AX737", file, decl.startLine + i, {
              message: `${decl.kind} '${decl.name}' declares stored property '${name}' more than once`,
              suggestion: `Remove the duplicate \`${name}\` declaration. The first declaration appears near line ${previousLine}.`,
            })
          );
        } else {
          seen.set(name, decl.startLine + i);
        }
      }
    }

    for (const ch of strippedLine) {
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
}

function checkRequiredFrameworkImports(
  decls: SwiftDeclaration[],
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const hasAppIntentSurface = decls.some(
    (decl) =>
      hasConformance(decl, "AppIntent") || hasConformance(decl, "AppShortcutsProvider")
  );
  const hasWidgetSurface = decls.some(
    (decl) =>
      hasConformance(decl, "Widget") ||
      hasConformance(decl, "TimelineProvider") ||
      hasConformance(decl, "TimelineEntry")
  );
  const hasSwiftUISurface = decls.some(
    (decl) => hasConformance(decl, "View") || hasConformance(decl, "App")
  );

  const hasAppIntentsImport = /^\s*import\s+AppIntents\b/m.test(source);
  const hasWidgetKitImport = /^\s*import\s+WidgetKit\b/m.test(source);
  const hasSwiftUIImport = /^\s*import\s+SwiftUI\b/m.test(source);
  const hasAppKitImport = /^\s*import\s+AppKit\b/m.test(source);

  if (hasAppIntentSurface && !hasAppIntentsImport) {
    diagnostics.push(
      makeDiagnostic("AX716", file, 1, {
        message:
          "This file declares AppIntent-facing types but does not import AppIntents",
        suggestion: "Add `import AppIntents` at the top of the file.",
      })
    );
  }

  if (hasWidgetSurface && !hasWidgetKitImport) {
    diagnostics.push(
      makeDiagnostic("AX717", file, 1, {
        message:
          "This file declares WidgetKit-facing types but does not import WidgetKit",
        suggestion: "Add `import WidgetKit` at the top of the file.",
      })
    );
  }

  if (hasSwiftUISurface && !hasSwiftUIImport) {
    diagnostics.push(
      makeDiagnostic("AX718", file, 1, {
        message: "This file declares SwiftUI-facing types but does not import SwiftUI",
        suggestion: "Add `import SwiftUI` at the top of the file.",
      })
    );
  }

  checkAppKitTypeImports(source, stripped, hasAppKitImport, file, diagnostics);
}

const APPKIT_TYPE_NAMES = [
  "NSPasteboard",
  "NSImage",
  "NSColor",
  "NSWorkspace",
  "NSOpenPanel",
  "NSSavePanel",
  "NSView",
  "NSWindow",
  "NSEvent",
];

function checkAppKitTypeImports(
  source: string,
  stripped: string,
  hasAppKitImport: boolean,
  file: string,
  diagnostics: Diagnostic[]
) {
  if (hasAppKitImport) return;

  for (const typeName of APPKIT_TYPE_NAMES) {
    const match = new RegExp(`\\b${typeName}\\b`).exec(stripped);
    if (!match) continue;
    diagnostics.push(
      makeDiagnostic("AX738", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `This file uses ${typeName} but does not import AppKit`,
        suggestion:
          "Add `import AppKit` at the top of the file, or wrap the AppKit usage in `#if os(macOS)` with an AppKit import.",
      })
    );
    return;
  }
}

// ─── Rule: AX701 — AppIntent must have a perform() function ──────────

function checkAppIntentHasPerform(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasPerform = /\bfunc\s+perform\s*\(/.test(body);
  if (!hasPerform) {
    diagnostics.push(
      makeDiagnostic("AX701", file, decl.startLine, {
        message: `AppIntent '${decl.name}' is missing a perform() function`,
        suggestion:
          "Add: func perform() async throws -> some IntentResult { return .result() }",
      })
    );
  }
}

// ─── Rule: AX702 — Widget must expose `var body: some WidgetConfiguration` ─

function checkWidgetHasBody(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasBody = /\bvar\s+body\s*:\s*some\s+WidgetConfiguration\b/.test(body);
  if (!hasBody) {
    diagnostics.push(
      makeDiagnostic("AX702", file, decl.startLine, {
        message: `Widget '${decl.name}' is missing 'var body: some WidgetConfiguration'`,
        suggestion:
          "Every Widget must expose `var body: some WidgetConfiguration` — typically StaticConfiguration or AppIntentConfiguration.",
      })
    );
  }
}

// ─── Rules: AX703 / AX708–AX711 — property wrappers must be `var` ────
//
// SwiftUI requires @State, @Binding, @ObservedObject, @StateObject, and
// @EnvironmentObject to be declared with `var` because the wrapper needs
// mutable backing storage. `let` compiles in some cases and fails at
// runtime — precisely the class of bug Xcode's "type does not conform to
// View" errors bury.

const PROPERTY_WRAPPER_RULES: Array<{ wrapper: string; code: string }> = [
  { wrapper: "@State", code: "AX703" },
  { wrapper: "@Binding", code: "AX708" },
  { wrapper: "@ObservedObject", code: "AX709" },
  { wrapper: "@StateObject", code: "AX710" },
  { wrapper: "@EnvironmentObject", code: "AX711" },
];

function checkPropertyWrappersAreVar(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const bodyLineOffset = countNewlinesUpTo(decl.source, decl.bodyStart);
  const lines = body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { wrapper, code } of PROPERTY_WRAPPER_RULES) {
      const pattern = new RegExp(`${escapeRegex(wrapper)}\\b[^=\\n]*\\blet\\s+\\w+`);
      if (pattern.test(line)) {
        diagnostics.push(
          makeDiagnostic(code, file, decl.startLine + bodyLineOffset + i, {
            message: `${wrapper} property in '${decl.name}' is declared with 'let' — SwiftUI requires 'var'`,
            suggestion: `Change \`${wrapper} let\` to \`${wrapper} var\`. SwiftUI needs mutable backing storage.`,
          })
        );
      }
    }
  }
}

function checkViewBodyReferencesDeclaredProperties(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const typeBody = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const strippedTypeBody = stripCommentsAndStrings(typeBody);
  const bodyMatch = /\bvar\s+body\s*:\s*some\s+View\s*\{/.exec(strippedTypeBody);
  if (!bodyMatch) return;

  const bodyOpen = bodyMatch.index + bodyMatch[0].lastIndexOf("{");
  const bodyClose = findMatchingBrace(strippedTypeBody, bodyOpen);
  if (bodyClose === -1) return;

  const bodySource = strippedTypeBody.slice(bodyOpen + 1, bodyClose);
  const declared = collectTopLevelPropertyNames(typeBody, strippedTypeBody);
  const localNames = collectLocalNames(bodySource);
  const reported = new Set<string>();
  const identifierPattern = /\b([a-z][A-Za-z0-9_]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = identifierPattern.exec(bodySource)) !== null) {
    const name = match[1]!;
    const prev = bodySource[match.index - 1] ?? "";
    const next = nextNonWhitespace(bodySource, match.index + name.length);

    if (prev === "." || /[A-Za-z0-9_]/.test(prev)) continue;
    if (next === ":" || next === "(") continue;
    if (
      declared.has(name) ||
      localNames.has(name) ||
      VIEW_BODY_KNOWN_IDENTIFIERS.has(name)
    )
      continue;
    if (reported.has(name)) continue;

    reported.add(name);
    const absoluteOffset = decl.bodyStart + bodyOpen + 1 + match.index;
    diagnostics.push(
      makeDiagnostic("AX739", file, 1 + countNewlinesUpTo(decl.source, absoluteOffset), {
        message: `SwiftUI view '${decl.name}' references '${name}' in body but the property is not declared in the view`,
        suggestion: `Declare \`${name}\` as @State, @Binding, @Environment, a stored property, or a local value before using it in \`body\`.`,
      })
    );
  }
}

const VIEW_BODY_KNOWN_IDENTIFIERS = new Set([
  "true",
  "false",
  "nil",
  "self",
  "some",
  "if",
  "else",
  "elseif",
  "endif",
  "for",
  "in",
  "let",
  "var",
  "guard",
  "switch",
  "case",
  "return",
  "try",
  "await",
  "async",
  "throws",
  "os",
  "macOS",
  "iOS",
  "visionOS",
]);

function collectTopLevelPropertyNames(
  typeBody: string,
  strippedTypeBody: string
): Set<string> {
  const names = new Set<string>();
  const lines = typeBody.split("\n");
  const strippedLines = strippedTypeBody.split("\n");
  let depth = 0;

  for (let i = 0; i < strippedLines.length; i++) {
    const strippedLine = strippedLines[i] ?? "";
    const rawLine = lines[i] ?? "";
    const match =
      depth === 0
        ? rawLine.match(
            /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|weak|unowned|nonisolated)\s+)*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/
          )
        : null;
    if (match?.[1]) names.add(match[1]);
    const funcMatch =
      depth === 0
        ? rawLine.match(
            /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s*)*(?:(?:public|private|fileprivate|internal|open|static|nonisolated)\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)\b/
          )
        : null;
    if (funcMatch?.[1]) names.add(funcMatch[1]);

    for (const ch of strippedLine) {
      if (ch === "{") depth++;
      if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }

  return names;
}

function collectLocalNames(bodySource: string): Set<string> {
  const names = new Set<string>();
  for (const match of bodySource.matchAll(
    /\{\s*\(?\s*((?:[A-Za-z_][A-Za-z0-9_]*|_)(?:\s*,\s*(?:[A-Za-z_][A-Za-z0-9_]*|_))*)\s*\)?\s+in\b/g
  )) {
    for (const part of match[1]!.split(",")) {
      const name = part.trim();
      if (name && name !== "_") names.add(name);
    }
  }
  for (const match of bodySource.matchAll(
    /\b(?:if|guard)\s+(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g
  )) {
    names.add(match[1]!);
  }
  for (const match of bodySource.matchAll(
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g
  )) {
    names.add(match[1]!);
  }
  return names;
}

function nextNonWhitespace(source: string, index: number): string {
  for (let i = index; i < source.length; i++) {
    const ch = source[i] ?? "";
    if (!/\s/.test(ch)) return ch;
  }
  return "";
}

// ─── Rule: AX704 — AppIntent must have a `title` ─────────────────────

function checkAppIntentHasTitle(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasTitle = /\bstatic\s+var\s+title\s*:\s*LocalizedStringResource\b/.test(body);
  const hasLetTitle = /\bstatic\s+let\s+title\s*:\s*LocalizedStringResource\b/.test(body);
  if (!hasTitle) {
    diagnostics.push(
      makeDiagnostic("AX704", file, decl.startLine, {
        message: hasLetTitle
          ? `AppIntent '${decl.name}' declares title with 'static let'; AppIntents expect 'static var title: LocalizedStringResource'`
          : `AppIntent '${decl.name}' is missing 'static var title: LocalizedStringResource'`,
        suggestion: hasLetTitle
          ? "Change `static let title` to `static var title` and keep the existing title value."
          : `Add: static var title: LocalizedStringResource = "${decl.name}"`,
      })
    );
  }
}

// ─── Rule: AX715 — AppIntent description should not be empty ─────────

function checkAppIntentHasDescription(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const declMatch = body.match(
    /\bstatic\s+var\s+description\b(?:\s*:\s*IntentDescription)?\s*=\s*IntentDescription\s*\(\s*"([^"]*)"/
  );
  if (declMatch && declMatch[1].trim() === "") {
    diagnostics.push(
      makeDiagnostic("AX715", file, decl.startLine, {
        message: `AppIntent '${decl.name}' has an empty description — Siri and Shortcuts won't surface it`,
        suggestion:
          "Give the intent a human-readable description so Siri can understand it.",
      })
    );
  }
}

// ─── Rule: AX719 — AppIntent input properties should use @Parameter ──

const APP_INTENT_INSTANCE_PROPERTY =
  /^\s*(?:public|internal|private|fileprivate|open)?\s*(?:var|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=/{\n]+?)(?:\s*=.*)?$/;

const APP_INTENT_KNOWN_NON_PARAMETER_PROPERTIES = new Set([
  "openAppWhenRun",
  "authenticationPolicy",
  "isDiscoverable",
]);

function checkAppIntentParametersUseParameterWrapper(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const bodyLineOffset = countNewlinesUpTo(decl.source, decl.bodyStart);
  const lines = body.split("\n");

  const pendingAttributes: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      pendingAttributes.length = 0;
      continue;
    }

    if (trimmed.startsWith("@")) {
      const inline = trimmed.match(/^(@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s+(.*)$/);
      if (inline && /\b(?:var|let)\s+/.test(inline[2] ?? "")) {
        pendingAttributes.push(inline[1]!);
        line = line.replace(inline[1]!, "");
      } else {
        pendingAttributes.push(trimmed);
        continue;
      }
    }

    if (
      /^\s*(?:static|func|init\b|subscript\b|typealias\b|enum\b|struct\b|class\b|actor\b)/.test(
        line
      )
    ) {
      pendingAttributes.length = 0;
      continue;
    }

    const match = line.match(APP_INTENT_INSTANCE_PROPERTY);
    if (!match) {
      pendingAttributes.length = 0;
      continue;
    }

    const [, name] = match;
    const hasInitializer = /=/.test(line);
    const hasParameterAttribute = pendingAttributes.some((attr) =>
      attr.startsWith("@Parameter")
    );
    const hasStateAttribute = pendingAttributes.some((attr) => attr.startsWith("@State"));

    if (hasStateAttribute) {
      diagnostics.push(
        makeDiagnostic("AX719", file, decl.startLine + bodyLineOffset + i, {
          message: `AppIntent property '${name}' uses @State, which is only valid for SwiftUI views`,
          suggestion: `Use @Parameter for user input, or remove @State and initialize \`${name}\` if it is internal intent state.`,
        })
      );
      pendingAttributes.length = 0;
      continue;
    }

    if (
      !hasInitializer &&
      !hasParameterAttribute &&
      !APP_INTENT_KNOWN_NON_PARAMETER_PROPERTIES.has(name)
    ) {
      diagnostics.push(
        makeDiagnostic("AX719", file, decl.startLine + bodyLineOffset + i, {
          message: `AppIntent property '${name}' looks like an input but is missing @Parameter`,
          suggestion: `Add \`@Parameter(title: "${humanizeIdentifier(
            name
          )}")\` above \`${name}\`, or initialize it if it is internal state rather than user input.`,
        })
      );
    }

    pendingAttributes.length = 0;
  }
}

// ─── Rule: AX705–AX707 — TimelineProvider required methods ───────────

function checkTimelineProviderMethods(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);

  if (!/\bfunc\s+placeholder\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX705", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing placeholder(in:)`,
        suggestion: "Add: func placeholder(in context: Context) -> Entry { ... }",
      })
    );
  }
  if (!/\bfunc\s+getSnapshot\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX706", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing getSnapshot(in:completion:)`,
        suggestion:
          "Add: func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { ... }",
      })
    );
  }
  if (!/\bfunc\s+getTimeline\s*\(/.test(body)) {
    diagnostics.push(
      makeDiagnostic("AX707", file, decl.startLine, {
        message: `TimelineProvider '${decl.name}' is missing getTimeline(in:completion:)`,
        suggestion:
          "Add: func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) { ... }",
      })
    );
  }
}

// ─── Rule: AX713 — TimelineEntry must have `let date: Date` ──────────

function checkTimelineEntryHasDate(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const dateMatches = body.match(/\blet\s+date\s*:\s*Date\b/g) ?? [];
  const hasDate = dateMatches.length > 0;
  if (!hasDate) {
    diagnostics.push(
      makeDiagnostic("AX713", file, decl.startLine, {
        message: `TimelineEntry '${decl.name}' is missing 'let date: Date'`,
        suggestion:
          "Every TimelineEntry must declare `let date: Date`. WidgetKit reads it directly.",
      })
    );
  }
  if (dateMatches.length > 1) {
    diagnostics.push(
      makeDiagnostic("AX750", file, decl.startLine, {
        message: `TimelineEntry '${decl.name}' declares 'let date: Date' more than once`,
        suggestion:
          "Keep exactly one `let date: Date` property. WidgetKit requires it, but duplicate stored properties do not compile.",
      })
    );
  }
}

// ─── Rule: AX712 — AppShortcutsProvider requires `appShortcuts` ──────

function checkAppShortcutsProviderHasShortcuts(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasShortcuts = /\bstatic\s+var\s+appShortcuts\s*:\s*\[AppShortcut\]/.test(body);
  if (!hasShortcuts) {
    diagnostics.push(
      makeDiagnostic("AX712", file, decl.startLine, {
        message: `AppShortcutsProvider '${decl.name}' is missing 'static var appShortcuts: [AppShortcut]'`,
        suggestion:
          "Add: static var appShortcuts: [AppShortcut] { [ AppShortcut(intent: ..., phrases: [...]) ] }",
      })
    );
  }
}

// ─── Rule: AX714 — @main App struct must have `var body: some Scene` ──

function checkAppHasBody(
  decl: SwiftDeclaration,
  file: string,
  diagnostics: Diagnostic[]
) {
  const body = decl.source.slice(decl.bodyStart, decl.bodyEnd);
  const hasBody = /\bvar\s+body\s*:\s*some\s+Scene\b/.test(body);
  if (!hasBody) {
    diagnostics.push(
      makeDiagnostic("AX714", file, decl.startLine, {
        message: `App '${decl.name}' is missing 'var body: some Scene'`,
        suggestion:
          "Every App must expose `var body: some Scene` — typically WindowGroup { ContentView() }.",
      })
    );
  }
}

function humanizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

// ─── Rule: AX780 — Top-level symbol redeclaration across files ──────

function checkTopLevelSymbolRedeclaration(inputs: SwiftValidationInput[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const firstSeen = new Map<
    string,
    { file: string; line: number; kind: SwiftDeclaration["kind"] }
  >();

  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);
    const topLevel = decls.filter((decl) => isTopLevelDeclaration(decl, decls));

    for (const decl of topLevel) {
      // Extensions are allowed to repeat across files; that's how Swift
      // spreads conformances. Same with generic parameter clauses — the
      // parser strips those before reaching the name.
      if (decl.kind === "extension") continue;
      if (declarationIsFileScoped(decl)) continue;

      const baseName = baseSwiftTypeName(decl.name);
      if (!baseName) continue;

      const previous = firstSeen.get(baseName);
      if (!previous) {
        firstSeen.set(baseName, {
          file: input.file,
          line: decl.startLine,
          kind: decl.kind,
        });
        continue;
      }

      diagnostics.push(
        makeDiagnostic("AX780", input.file, decl.startLine, {
          message: `Top-level ${decl.kind} '${baseName}' is also declared at ${previous.file}:${previous.line} as ${previous.kind}`,
          suggestion:
            "Rename one declaration, move it into a namespace, or merge them. Two top-level types with the same name in the same module produce an `invalid redeclaration` build error and ambiguous initializers.",
        })
      );
    }
  }

  return diagnostics;
}

function isTopLevelDeclaration(decl: SwiftDeclaration, all: SwiftDeclaration[]): boolean {
  for (const other of all) {
    if (other === decl) continue;
    if (decl.bodyStart > other.bodyStart && decl.bodyEnd < other.bodyEnd) {
      return false;
    }
  }
  return true;
}

function declarationIsFileScoped(decl: SwiftDeclaration): boolean {
  return decl.attributes.some((attr) => attr === "private" || attr === "fileprivate");
}

// ─── Rule: AX781 — Optional value passed to non-optional parameter ──

interface FunctionSignature {
  name: string;
  file: string;
  line: number;
  parameters: FunctionParameter[];
}

interface FunctionParameter {
  externalLabel: string | null;
  internalName: string;
  typeText: string;
  isOptional: boolean;
}

function checkCrossFileOptionalArgMismatch(inputs: SwiftValidationInput[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reported = new Set<string>();

  // Build a project-wide index of optional fields declared on indexed types,
  // and a project-wide index of free-function signatures.
  const optionalFields = collectOptionalFields(inputs);
  const functions = collectModuleFunctions(inputs);
  if (optionalFields.size === 0 || functions.length === 0) return diagnostics;

  const functionsByName = new Map<string, FunctionSignature[]>();
  for (const fn of functions) {
    const existing = functionsByName.get(fn.name);
    if (existing) existing.push(fn);
    else functionsByName.set(fn.name, [fn]);
  }

  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const bindings = collectTypedBindingsForOptionalCheck(stripped, optionalFields);

    const callPattern = /\b([a-z_][A-Za-z0-9_]*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = callPattern.exec(stripped)) !== null) {
      const fnName = match[1]!;
      const argsText = match[2] ?? "";
      const candidates = functionsByName.get(fnName);
      if (!candidates) continue;

      for (const fn of candidates) {
        // Skip self-call inside the declaring file at the declaration site itself.
        if (
          fn.file === input.file &&
          fn.line === 1 + countNewlinesUpTo(input.source, match.index)
        ) {
          continue;
        }

        const args = splitTopLevelArgs(argsText);
        for (let i = 0; i < args.length && i < fn.parameters.length; i++) {
          const param = fn.parameters[i]!;
          if (param.isOptional) continue;

          const argExpr = stripArgumentLabel(args[i]!, param.externalLabel);
          const optionalArg = expressionResolvesToOptional(
            argExpr,
            bindings,
            optionalFields
          );
          if (!optionalArg) continue;

          const callLine = 1 + countNewlinesUpTo(input.source, match.index);
          const key = `${input.file}:${callLine}:${fn.name}:${i}`;
          if (reported.has(key)) continue;
          reported.add(key);

          diagnostics.push(
            makeDiagnostic("AX781", input.file, callLine, {
              message: `'${fn.name}' expects '${param.typeText}' for parameter '${param.externalLabel ?? param.internalName}', but '${optionalArg.expression}' is '${optionalArg.optionalType}?' (declared at ${optionalArg.declaredAt})`,
              suggestion:
                "Unwrap with `if let` / `guard let`, supply a default with `??`, or change the parameter to accept the optional. Static validation can't unwrap across files automatically.",
            })
          );
        }
      }
    }
  }

  return diagnostics;
}

function collectOptionalFields(
  inputs: SwiftValidationInput[]
): Map<string, Map<string, { typeText: string; declaredAt: string }>> {
  const index = new Map<string, Map<string, { typeText: string; declaredAt: string }>>();
  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);
    for (const decl of decls) {
      const baseName = baseSwiftTypeName(decl.name);
      if (!baseName) continue;
      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const fieldPattern =
        /\b(?:public|internal|private|fileprivate|open)?\s*(?:static\s+)?(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_.<>\s,]*)\??/g;
      const optionalPattern =
        /\b(?:public|internal|private|fileprivate|open)?\s*(?:static\s+)?(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_.<>\s,]*)\?/g;
      let optMatch: RegExpExecArray | null;
      while ((optMatch = optionalPattern.exec(body)) !== null) {
        const fieldName = optMatch[1]!;
        const typeText = (optMatch[2] ?? "").trim();
        const offsetInSource = decl.bodyStart + optMatch.index;
        const line = 1 + countNewlinesUpTo(input.source, offsetInSource);
        const fields = index.get(baseName) ?? new Map();
        fields.set(fieldName, {
          typeText,
          declaredAt: `${input.file}:${line}`,
        });
        index.set(baseName, fields);
      }
      // Suppress unused-variable warning for fieldPattern — the pattern is
      // documented above as the broad-field shape; the optional pattern is
      // its strict variant.
      void fieldPattern;
    }
  }
  return index;
}

function collectModuleFunctions(inputs: SwiftValidationInput[]): FunctionSignature[] {
  const functions: FunctionSignature[] = [];
  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);
    const funcPattern =
      /\b(?:private\s+|fileprivate\s+|public\s+|internal\s+|static\s+|class\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = funcPattern.exec(stripped)) !== null) {
      // Skip private/fileprivate functions — calling those across files
      // doesn't compile, so the rule wouldn't fire anyway.
      const prefix = stripped.slice(Math.max(0, match.index - 60), match.index);
      if (/\b(?:private|fileprivate)\b\s*$/.test(prefix)) continue;

      const enclosing = decls.find(
        (d) => match!.index > d.bodyStart && match!.index < d.bodyEnd
      );
      // Treat methods on a type the same as free functions for argument
      // checking — the param types are still cross-file resolvable.
      void enclosing;

      const name = match[1]!;
      const paramsText = match[2] ?? "";
      const parameters = parseParameterList(paramsText);
      if (parameters.length === 0) continue;

      functions.push({
        name,
        file: input.file,
        line: 1 + countNewlinesUpTo(input.source, match.index),
        parameters,
      });
    }
  }
  return functions;
}

function parseParameterList(text: string): FunctionParameter[] {
  const params: FunctionParameter[] = [];
  for (const raw of splitTopLevelArgs(text)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Match `external internal: Type` or `name: Type`.
    const m = trimmed.match(
      /^(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^=]+?)(?:\s*=\s*[^,]+)?$/
    );
    if (!m) continue;
    const externalLabel = m[1] ?? m[2]!;
    const internalName = m[2]!;
    const typeText = (m[3] ?? "").trim();
    if (!typeText) continue;
    const isOptional = /\?\s*$/.test(typeText) || /^Optional</.test(typeText);
    params.push({
      externalLabel: externalLabel === "_" ? null : externalLabel,
      internalName,
      typeText: typeText.replace(/\s+/g, " "),
      isOptional,
    });
  }
  return params;
}

function splitTopLevelArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === ">") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function stripArgumentLabel(arg: string, label: string | null): string {
  const trimmed = arg.trim();
  if (label === null) return trimmed;
  const labelMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/s);
  if (labelMatch && labelMatch[1] === label) return labelMatch[2]!.trim();
  return trimmed;
}

function collectTypedBindingsForOptionalCheck(
  stripped: string,
  optionalFields: Map<string, Map<string, unknown>>
): Map<string, string> {
  const bindings = new Map<string, string>();
  const explicit =
    /\b(?:let|var)\s+([a-z_][A-Za-z0-9_]*)\s*:\s*([A-Z][A-Za-z0-9_.]*)\??/g;
  let match: RegExpExecArray | null;
  while ((match = explicit.exec(stripped)) !== null) {
    const typeName = baseSwiftTypeName(match[2] ?? "");
    if (typeName && optionalFields.has(typeName)) bindings.set(match[1]!, typeName);
  }

  const params = /\bfunc\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/g;
  let pmatch: RegExpExecArray | null;
  while ((pmatch = params.exec(stripped)) !== null) {
    for (const raw of splitTopLevelArgs(pmatch[1]!)) {
      const m = raw.match(
        /\b(?:[A-Za-z_][A-Za-z0-9_]*\s+)?([a-z_][A-Za-z0-9_]*)\s*:\s*([A-Z][A-Za-z0-9_.]*)\??/
      );
      if (!m) continue;
      const typeName = baseSwiftTypeName(m[2] ?? "");
      if (typeName && optionalFields.has(typeName)) bindings.set(m[1]!, typeName);
    }
  }
  return bindings;
}

function expressionResolvesToOptional(
  expr: string,
  bindings: Map<string, string>,
  optionalFields: Map<string, Map<string, { typeText: string; declaredAt: string }>>
): { expression: string; optionalType: string; declaredAt: string } | null {
  const cleaned = expr.trim();
  if (!cleaned) return null;
  // Pure member access chain `obj.field` — resolve through the bindings.
  const memberMatch = cleaned.match(
    /^([a-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*$/
  );
  if (!memberMatch) return null;
  const objectName = memberMatch[1]!;
  const memberName = memberMatch[2]!;
  const typeName = bindings.get(objectName);
  if (!typeName) return null;
  const fields = optionalFields.get(typeName);
  if (!fields) return null;
  const field = fields.get(memberName);
  if (!field) return null;
  return {
    expression: cleaned,
    optionalType: field.typeText.replace(/\?\s*$/, ""),
    declaredAt: field.declaredAt,
  };
}

// ─── Rule: AX782 — Dense View body without an affordance ────────────

function checkDenseViewWithoutAffordance(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const decls = findTypeDeclarations(stripped, source);
  for (const decl of decls) {
    if (decl.kind !== "struct") continue;
    if (!hasConformance(decl, "View")) continue;

    const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
    const bodyMatch = body.match(/\bvar\s+body\s*:\s*some\s+View\s*\{/);
    if (!bodyMatch) continue;

    const bodyOpen = body.indexOf("{", bodyMatch.index! + bodyMatch[0].length - 1);
    const bodyClose = findMatchingBrace(body, bodyOpen);
    if (bodyOpen === -1 || bodyClose === -1) continue;

    const bodyContent = body.slice(bodyOpen + 1, bodyClose);
    const denseScroll = findDenseScrollView(bodyContent);
    if (!denseScroll) continue;

    if (hasScopingAffordance(bodyContent, denseScroll.start, denseScroll.end)) continue;

    const offsetInSource = decl.bodyStart + bodyOpen + 1 + denseScroll.start;
    diagnostics.push(
      makeDiagnostic("AX782", file, 1 + countNewlinesUpTo(source, offsetInSource), {
        message: `View '${decl.name}' stacks ${denseScroll.childCount} top-level sections in a ScrollView with no segmented control, disclosure group, or tab to scope what's visible`,
        suggestion:
          "Add a segmented Picker, DisclosureGroup, TabView, or a `.tabItem` so the surface presents one focused area at a time. First-paint density above ~6 sections tends to feel overwhelming.",
      })
    );
  }
}

function findDenseScrollView(
  bodyContent: string
): { start: number; end: number; childCount: number } | null {
  const scrollPattern = /\bScrollView\s*(?:\([^)]*\))?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = scrollPattern.exec(bodyContent)) !== null) {
    const open = bodyContent.indexOf("{", match.index);
    const close = findMatchingBrace(bodyContent, open);
    if (open === -1 || close === -1) continue;

    const inner = bodyContent.slice(open + 1, close);
    const stackMatch = inner.match(/^\s*(?:VStack|LazyVStack)\s*(?:\([^)]*\))?\s*\{/);
    if (!stackMatch) continue;

    const stackOpen = inner.indexOf("{", stackMatch.index! + stackMatch[0].length - 1);
    const stackClose = findMatchingBrace(inner, stackOpen);
    if (stackOpen === -1 || stackClose === -1) continue;

    const stackBody = inner.slice(stackOpen + 1, stackClose);
    const childCount = countTopLevelChildren(stackBody);
    if (childCount > 6) {
      return {
        start: match.index,
        end: close,
        childCount,
      };
    }
  }
  return null;
}

function countTopLevelChildren(stackBody: string): number {
  let depth = 0;
  let count = 0;
  let onChild = false;
  let parenDepth = 0;
  for (let i = 0; i < stackBody.length; i++) {
    const ch = stackBody[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "{") {
      if (depth === 0 && parenDepth === 0) onChild = true;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && parenDepth === 0) onChild = false;
    } else if (depth === 0 && parenDepth === 0) {
      if (ch === "\n") {
        if (onChild) {
          count++;
          onChild = false;
        }
      } else if (!/\s/.test(ch)) {
        if (!onChild) {
          // First non-whitespace char on a new top-level line — treat as a
          // new child expression.
          onChild = true;
        }
      }
    }
  }
  if (onChild) count++;
  return count;
}

function hasScopingAffordance(
  bodyContent: string,
  scrollStart: number,
  scrollEnd: number
): boolean {
  const scrollSlice = bodyContent.slice(scrollStart, scrollEnd + 1);
  // Look for a Picker(.segmented), TabView, DisclosureGroup, or a top-level
  // `if <state>` switch above or inside the scroll view.
  if (/\bPicker\s*\([\s\S]*?pickerStyle\s*\(\s*\.segmented\s*\)/.test(bodyContent)) {
    return true;
  }
  if (/\bDisclosureGroup\s*\(/.test(bodyContent)) return true;
  if (/\bTabView\s*\{/.test(bodyContent)) return true;
  if (/\.tabItem\s*\{/.test(bodyContent)) return true;
  // A top-level `if <stateLikeName>` before or wrapping the ScrollView is
  // also a scoping affordance.
  const before = bodyContent.slice(0, scrollStart);
  if (/\bif\s+[A-Za-z_][A-Za-z0-9_]*\s*\{[\s\S]*$/.test(before)) return true;
  // Also accept an inline switch that gates which children render.
  if (/\bswitch\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(scrollSlice)) return true;
  return false;
}

// ─── Rule: AX787 — Reference to undeclared boolean identifier ────────
//
// Catches the cross-file or in-file pattern where a refactor deletes a
// computed boolean property (e.g. `isAxintShowcase`) but leaves call
// sites that still read it. Without this rule the reference compiles
// "clean" through static validation and Cloud Check, then breaks at
// `xcodebuild` with "Cannot find 'X' in scope". Scoped to the boolean
// shape (is/has/should/can/did/will + UpperCamel) to keep false positives
// low; that shape is the most common refactor leftover.

const BOOLEAN_REF_PATTERN =
  /(?<![.\w@])(is[A-Z][A-Za-z0-9_]*|has[A-Z][A-Za-z0-9_]*|should[A-Z][A-Za-z0-9_]*|can[A-Z][A-Za-z0-9_]*|did[A-Z][A-Za-z0-9_]*|will[A-Z][A-Za-z0-9_]*)\b(?!\s*:)/g;

const SWIFT_BUILTIN_BOOLEAN_NAMES = new Set([
  "isEmpty",
  "isFinite",
  "isInfinite",
  "isNaN",
  "isMultiple",
  "isZero",
  "hasPrefix",
  "hasSuffix",
  "isLess",
  "isLessThan",
  "isEqual",
  "isStrictSubset",
  "isStrictSuperset",
  "isSubset",
  "isSuperset",
  "isDisjoint",
  "isContiguousUTF8",
  "isASCII",
  "isContiguous",
  "isUniquelyReferenced",
]);

function checkUndefinedBooleanIdentifiers(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const declared = collectAllInFileIdentifiers(stripped);
  const reported = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = BOOLEAN_REF_PATTERN.exec(stripped)) !== null) {
    const name = match[1]!;
    if (SWIFT_BUILTIN_BOOLEAN_NAMES.has(name)) continue;
    if (declared.has(name)) continue;

    // Only flag when the identifier appears in a position where it must
    // resolve to something — guard/if/return/ternary/&&/|| context. This
    // filters out string interpolation labels, comments stripped earlier,
    // and named-argument labels that the regex accidentally caught.
    if (!isExpressionPosition(stripped, match.index)) continue;

    const key = `${name}:${match.index}`;
    if (reported.has(key)) continue;
    reported.add(key);

    diagnostics.push(
      makeDiagnostic("AX787", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `Reference to '${name}' but no declaration is in scope. If a recent refactor deleted '${name}', remove or update this call site — Xcode will fail with 'Cannot find ${name} in scope'.`,
        suggestion:
          "Either restore the property/method, or replace the reference with the new shape introduced by the refactor (often a switch over an enum). Check the diff for recently deleted computed properties matching this name.",
      })
    );
  }
}

function collectAllInFileIdentifiers(stripped: string): Set<string> {
  const names = new Set<string>();
  const patterns = [
    // let / var declarations (any access modifier, with or without type)
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g,
    // func declarations
    /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/g,
    // function parameter internal names (after the first label)
    /\bfunc\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/g,
    // case labels (enum cases, switch case let bindings)
    /\bcase\s+(?:let\s+|var\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/g,
    // closure parameter `{ name in` and `{ (name, x) in`
    /\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+in\b/g,
    // if let / guard let / if var / guard var bindings
    /\b(?:if|guard|while)\s+(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g,
    // type names — struct/class/enum/protocol/typealias/extension
    /\b(?:struct|class|enum|protocol|actor|typealias)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(stripped)) !== null) {
      const captured = match[1] ?? "";
      // Function parameter list — split on commas and pick the internal name
      // (the one after an optional external label).
      if (captured.includes(":")) {
        for (const raw of captured.split(",")) {
          const m = raw
            .trim()
            .match(/^(?:[A-Za-z_][A-Za-z0-9_]*\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
          if (m) names.add(m[1]!);
        }
      } else if (captured.includes(",")) {
        // Closure tuple parameter list `{ a, b in`
        for (const raw of captured.split(",")) {
          const trimmed = raw.trim();
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) names.add(trimmed);
        }
      } else if (captured) {
        names.add(captured);
      }
    }
  }
  return names;
}

function isExpressionPosition(stripped: string, refIndex: number): boolean {
  // The BOOLEAN_REF_PATTERN's `(?!\s*:)` lookahead already excludes the
  // argument-label case (`foo(isEnabled: true)`), so any match here is in
  // an expression position by definition. We keep the function for two
  // narrow rejections that the lookahead can't catch:
  //   1. dictionary keys: `["isFoo": ...]` — the colon is far away.
  //   2. attribute argument values: `@Annotation(isFoo)` — too rare to handle.
  // Otherwise default to true so the rule actually fires; the boolean
  // shape filter keeps the surface narrow.
  const start = Math.max(0, refIndex - 24);
  const slice = stripped.slice(start, refIndex);
  // Reject dictionary key context: `[` followed by quoted shape and a
  // colon is a key, not a reference.
  if (/\[\s*$/.test(slice)) return false;
  return true;
}

// ─── Rule: AX787 (string-interpolation extension) ──────────────────────
//
// Companion to checkUndefinedBooleanIdentifiers above. The boolean check
// runs against `stripped` source — which removes string literals, so it
// can't see identifiers used inside `\(...)` interpolations. This pass
// rescans the original source for `\(IDENT)` and flags identifiers that
// don't resolve in the file scope, regardless of name shape.
//
// This is exactly the `\(projectName)` case from the dogfooding entry:
// a helper interpolated a property that didn't exist on the surrounding
// type. Both axint and Cloud Check passed; Xcode caught it.

const STRING_INTERPOLATION_IDENT_PATTERN = /\\\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

const SWIFT_BUILTIN_IDENTIFIERS = new Set([
  // Functions / globals always in scope without import.
  "print",
  "debugPrint",
  "dump",
  "assert",
  "assertionFailure",
  "precondition",
  "preconditionFailure",
  "fatalError",
  "abs",
  "min",
  "max",
  "stride",
  "zip",
  "type",
  "repeatElement",
  "swap",
  "withUnsafePointer",
  "MemoryLayout",
  "ObjectIdentifier",
  "String",
  "Int",
  "Double",
  "Float",
  "Bool",
  "Array",
  "Dictionary",
  "Set",
  "Optional",
  "Result",
  "Range",
  "ClosedRange",
  // SwiftUI helpers commonly used as values.
  "Color",
  "Image",
  "Text",
  "Font",
  "Animation",
  "Spring",
  "EdgeInsets",
  "Angle",
  "Path",
  // Foundation values that show up bare.
  "Date",
  "URL",
  "UUID",
  "Data",
  "Calendar",
  "Locale",
  "TimeZone",
  "Decimal",
  "true",
  "false",
  "nil",
  "self",
  "super",
]);

function checkUndefinedStringInterpolationIdentifiers(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const declared = collectAllInFileIdentifiers(stripped);
  const reported = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = STRING_INTERPOLATION_IDENT_PATTERN.exec(source)) !== null) {
    const name = match[1]!;
    if (name.length < 2) continue; // skip $0/$1-style noise
    if (SWIFT_BUILTIN_IDENTIFIERS.has(name)) continue;
    if (declared.has(name)) continue;

    const key = `${name}:${match.index}`;
    if (reported.has(key)) continue;
    reported.add(key);

    diagnostics.push(
      makeDiagnostic("AX787", file, 1 + countNewlinesUpTo(source, match.index), {
        message: `String interpolation references '${name}', but no declaration is in scope. If a recent refactor renamed or deleted '${name}', the Xcode build will fail with 'Cannot find ${name} in scope'.`,
        suggestion:
          "Either restore/rename the property/method, or grep the surrounding type to find the actual property name. axint cannot resolve names against the live symbol table; this is the most common refactor leftover the validator can flag pre-build.",
      })
    );
  }
}

// ─── Rule: AX788 — HStack child collapses siblings via maxWidth: .infinity ─
//
// SwiftUI's native Divider auto-orients (vertical inside HStack, horizontal
// inside VStack). Custom "divider" or "rule" Views that always chain
// .frame(maxWidth: .infinity) read fine in a VStack but eat all sibling
// horizontal space inside an HStack — the catastrophic failure mode that
// broke SWARM's bulk Divider→SwarmGradientDivider sweep.
//
// We detect any View struct whose body chains frame(maxWidth: .infinity)
// without a corresponding fixed-width frame, then look across the input
// set for HStack {} blocks that instantiate that view as a child.

function checkHStackCollapsesInfinityChild(inputs: SwiftValidationInput[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const dangerousViews = collectInfinityWidthViews(inputs);
  if (dangerousViews.size === 0) return diagnostics;

  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const hstackRe = /\bHStack\s*(?:<[^>]*>)?\s*(?:\([^)]*\))?\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = hstackRe.exec(stripped)) !== null) {
      const open = stripped.indexOf("{", match.index);
      const close = findMatchingBrace(stripped, open);
      if (open === -1 || close === -1) continue;
      const body = stripped.slice(open + 1, close);

      for (const viewName of dangerousViews) {
        const usageRe = new RegExp(`\\b${escapeRegex(viewName)}\\s*\\(`, "g");
        let usage: RegExpExecArray | null;
        while ((usage = usageRe.exec(body)) !== null) {
          // Skip if this exact call has a downstream .frame(width:) or
          // .frame(maxWidth: <number>) override that re-bounds it.
          const tail = body.slice(usage.index, usage.index + 240);
          if (/\.frame\s*\(\s*(?:width|maxWidth)\s*:\s*[0-9]/.test(tail)) continue;
          if (/\.fixedSize\s*\(/.test(tail)) continue;

          const offsetInSource = open + 1 + usage.index;
          diagnostics.push(
            makeDiagnostic(
              "AX788",
              input.file,
              1 + countNewlinesUpTo(input.source, offsetInSource),
              {
                message: `'${viewName}' inside HStack will eat all available horizontal space — its body chains .frame(maxWidth: .infinity), which inside HStack collapses sibling views to their intrinsic width.`,
                suggestion:
                  "Either give '" +
                  viewName +
                  "' a fixed width in this call site (.frame(width: X)), or auto-orient the View itself by reading the parent stack's axis. Native Divider() handles this correctly via its built-in Layout shape.",
              }
            )
          );
        }
      }
    }
  }
  return diagnostics;
}

function collectInfinityWidthViews(inputs: SwiftValidationInput[]): Set<string> {
  const views = new Set<string>();
  for (const input of inputs) {
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);
    for (const decl of decls) {
      if (decl.kind !== "struct") continue;
      if (!hasConformance(decl, "View")) continue;
      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const hasInfinityWidth = /\.frame\s*\(\s*maxWidth\s*:\s*\.infinity\b/.test(body);
      if (!hasInfinityWidth) continue;
      // Skip if the view also clamps with a fixed width somewhere — those
      // are intentional (e.g. flexible container with a hard cap).
      if (/\.frame\s*\(\s*(?:width|maxWidth)\s*:\s*[0-9]/.test(body)) continue;
      views.add(decl.name);
    }
  }
  return views;
}

// ─── Project-context shared helpers ────────────────────────────────────
//
// AX841 and AX842 both need to look at .swift files outside the input set.
// Rather than scan the entire project on every call, we collect a Map of
// `path -> source` once and reuse it for both checks. The walk skips
// node_modules, build, .git, DerivedData and similar noise directories.

const SKIP_PROJECT_DIRS = new Set([
  "node_modules",
  ".git",
  ".build",
  "DerivedData",
  ".axint",
  "build",
  "dist",
  ".next",
  ".vercel",
  ".swiftpm",
  "Pods",
  "Carthage",
]);

function collectProjectSwiftFiles(
  projectRoot: string,
  inputs: SwiftValidationInput[]
): Map<string, string> {
  const root = resolve(projectRoot);
  if (!existsSync(root)) return new Map();

  const files = new Map<string, string>();

  // Pre-populate with the in-flight inputs so we never re-read them from
  // disk and we always validate against the agent's pending edits.
  for (const input of inputs) {
    files.set(resolve(input.file), input.source);
  }

  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return; // sanity bound on absurdly deep trees
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_PROJECT_DIRS.has(name)) continue;
      if (name.startsWith(".")) continue; // skip dotfiles/dirs
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && name.endsWith(".swift")) {
        const resolved = resolve(full);
        if (files.has(resolved)) continue;
        try {
          files.set(resolved, readFileSync(full, "utf8"));
        } catch {
          // unreadable file — skip silently
        }
      }
    }
  };

  walk(root, 0);
  return files;
}

// ─── Rule: AX842 — SwiftUI View has zero call sites in the project ─────
//
// Coarse heuristic version. Walks every .swift file in the project, finds
// `struct X: View` declarations, then checks whether the project contains
// at least one `\bX\(` call site. Zero call sites → almost certainly dead
// code that the live app never renders.
//
// Skips Views that are:
//   - the App's @main scene (rendered by the runtime, not via X())
//   - PreviewProvider declarations (rendered only by Xcode previews)
//   - tagged with `// axint:reachable` so authors can opt out for views
//     constructed via reflection / dynamic wiring

function checkViewReachability(
  inputs: SwiftValidationInput[],
  projectFiles: Map<string, string>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inputPaths = new Set(inputs.map((i) => resolve(i.file)));

  // Build the set of every View struct name and where it was declared.
  const views: Array<{ name: string; file: string; line: number; source: string }> = [];
  for (const [path, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    const decls = findTypeDeclarations(stripped, source);
    for (const decl of decls) {
      if (decl.kind !== "struct") continue;
      if (!hasConformance(decl, "View")) continue;
      // Skip preview helpers — they're only ever rendered by Xcode.
      if (hasConformance(decl, "PreviewProvider")) continue;
      // Skip @main App-conforming structs — runtime renders them.
      if (hasConformance(decl, "App")) continue;
      // Honor an explicit opt-out hint above the declaration.
      const before = source.slice(Math.max(0, decl.bodyStart - 200), decl.bodyStart);
      if (/\/\/\s*axint:reachable\b/.test(before)) continue;
      views.push({ name: decl.name, file: path, line: decl.startLine, source });
    }
  }

  if (views.length === 0) return diagnostics;

  // For each view, scan every project file (including the declaring file
  // for self-instantiation in #Preview blocks) for `\bName(` call sites.
  // We only emit when zero call sites exist anywhere AND the declaring
  // file is in the input set — otherwise we'd noise on every validate-swift
  // run against unrelated files.
  for (const view of views) {
    if (!inputPaths.has(view.file)) continue;

    const callSitePattern = new RegExp(`\\b${escapeRegex(view.name)}\\s*\\(`, "g");
    let callSites = 0;
    for (const [path, source] of projectFiles) {
      // Don't count the declaration itself as a call site.
      const haystack =
        path === view.file
          ? source.replace(
              new RegExp(`\\bstruct\\s+${escapeRegex(view.name)}\\s*:`, "g"),
              ""
            )
          : source;
      const matches = haystack.match(callSitePattern);
      if (matches) callSites += matches.length;
      if (callSites > 0) break;
    }

    if (callSites === 0) {
      diagnostics.push(
        makeDiagnostic("AX842", view.file, view.line, {
          message: `SwiftUI View '${view.name}' has zero call sites anywhere in the project — the live app cannot render it.`,
          suggestion:
            "Either route this View from a live navigation chain (trace from your @main App's body to confirm), delete it as dead code, or add a `// axint:reachable` comment above the declaration if it's instantiated reflectively.",
        })
      );
    }
  }

  return diagnostics;
}

// ─── Rule: AX841 — Member access on a project type that lacks the member ─
//
// Extends AX768 (same-target member resolution) by indexing every type
// declared anywhere in the project, not just within the input set. This is
// what catches the `voiceInbox.items` / `root.foo.bar` pattern where the
// type is defined in a file the agent isn't editing.

function checkProjectIndexMemberAccess(
  inputs: SwiftValidationInput[],
  projectFiles: Map<string, string>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inputPaths = new Set(inputs.map((i) => resolve(i.file)));

  // Build a type → members map across the entire project.
  const projectMembers = new Map<string, Set<string>>();
  // And a type → property → declared-type map for closure-element inference.
  const projectPropertyTypes = new Map<string, Map<string, string>>();
  for (const [, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    const decls = findTypeDeclarations(stripped, source);
    for (const decl of decls) {
      const baseName = baseSwiftTypeName(decl.name);
      if (!baseName) continue;
      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const existing = projectMembers.get(baseName) ?? new Set<string>();
      for (const m of collectDeclaredMemberNames(body)) existing.add(m);
      projectMembers.set(baseName, existing);

      const propertyTypes =
        projectPropertyTypes.get(baseName) ?? new Map<string, string>();
      for (const [name, type] of collectDeclaredMemberTypes(body)) {
        propertyTypes.set(name, type);
      }
      projectPropertyTypes.set(baseName, propertyTypes);
    }
  }

  // Seed system types so e.g. `window.delegate` doesn't fire.
  for (const [typeName, members] of Object.entries(SYSTEM_TYPE_MEMBERS)) {
    const set = projectMembers.get(typeName) ?? new Set<string>();
    for (const m of members) set.add(m);
    projectMembers.set(typeName, set);
  }

  const reported = new Set<string>();
  for (const input of inputs) {
    if (!inputPaths.has(resolve(input.file))) continue;
    const stripped = stripCommentsAndStrings(input.source);
    const bindings = collectTypedBindings(stripped, projectMembers, projectPropertyTypes);
    if (bindings.size === 0) continue;
    const untypedClosureParameters = collectUntypedClosureParameters(stripped);

    const memberAccess = /\b([a-z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = memberAccess.exec(stripped)) !== null) {
      const objectName = match[1]!;
      const memberName = match[2]!;

      // If we successfully inferred the closure parameter's type via
      // ForEach/for-in collection inference (bindClosureLoopVariables),
      // honor it — the inferred binding overrides the untyped-closure
      // skip-list. Without this, AX841 silently misses every `item.foo`
      // inside a typed `ForEach(store.results) { item in ... }` loop.
      const typeName = bindings.get(objectName);
      if (!typeName && untypedClosureParameters.has(objectName)) continue;
      if (KNOWN_CROSS_FILE_MEMBER_NAMES.has(memberName)) continue;

      if (!typeName) continue;

      const members = projectMembers.get(typeName);
      if (!members || members.has(memberName)) continue;

      const key = `${input.file}:${objectName}:${typeName}:${memberName}:${match.index}`;
      if (reported.has(key)) continue;
      reported.add(key);

      // Cheap "did you mean" suggestion via Levenshtein over the indexed
      // members of the resolved type.
      const suggestion = suggestSimilarMember(memberName, members);

      diagnostics.push(
        makeDiagnostic(
          "AX841",
          input.file,
          1 + countNewlinesUpTo(input.source, match.index),
          {
            message: `Value of type '${typeName}' has no member '${memberName}'.${
              suggestion ? ` Did you mean '${suggestion}'?` : ""
            } (resolved via project-context index)`,
            suggestion: suggestion
              ? `Replace '${memberName}' with '${suggestion}' on '${objectName}', or grep the declaring type to confirm the real property name.`
              : `Open the file declaring '${typeName}' and verify the actual property/method name. The compiler will fail with the same diagnostic on the next Xcode build.`,
          }
        )
      );
    }
  }

  return diagnostics;
}

// ─── Rule: AX848 — Nested type / static member access on a project type ─
//
// Closes the gap AX841 leaves open. AX841's regex is anchored on a
// lowercase-first receiver (instance member access). When the receiver
// is itself a type literal — `IntelBriefItem.Kind`, `Color.semantic`,
// `MyEnum.foo` — Swift is doing nested-type / static-member lookup, not
// instance-member lookup, and AX841 ignores it.
//
// AX848 specifically catches the type-on-type form. It only fires when
// the parent type is project-indexed (we know its full member set,
// including nested types and enum cases via collectDeclaredMemberNames).
//
// Skipped: bare `Foo()` calls (constructors, not member access), `Foo.self`,
// `Foo.Type`, `Foo.init`, and types in SYSTEM_TYPE_MEMBERS or
// KNOWN_NESTED_TYPE_NAMES (system-shaped names like `Result.success`).

function checkProjectIndexNestedTypeAccess(
  inputs: SwiftValidationInput[],
  projectFiles: Map<string, string>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inputPaths = new Set(inputs.map((i) => resolve(i.file)));

  // Same indexing pass as AX841. We rebuild it locally so AX848 stays
  // standalone (the validator pipeline runs both rules; the cost of the
  // duplicate scan is negligible against a single tsup build).
  const projectMembers = new Map<string, Set<string>>();
  for (const [, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    const decls = findTypeDeclarations(stripped, source);
    for (const decl of decls) {
      const baseName = baseSwiftTypeName(decl.name);
      if (!baseName) continue;
      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const existing = projectMembers.get(baseName) ?? new Set<string>();
      for (const m of collectDeclaredMemberNames(body)) existing.add(m);
      projectMembers.set(baseName, existing);
    }
  }
  if (projectMembers.size === 0) return diagnostics;

  for (const [typeName, members] of Object.entries(SYSTEM_TYPE_MEMBERS)) {
    const set = projectMembers.get(typeName) ?? new Set<string>();
    for (const m of members) set.add(m);
    projectMembers.set(typeName, set);
  }

  const reported = new Set<string>();
  for (const input of inputs) {
    if (!inputPaths.has(resolve(input.file))) continue;
    const stripped = stripCommentsAndStrings(input.source);

    // Receiver is uppercase-first (= a type literal); accessed name can be
    // any identifier. We exclude trailing `(` (constructor call), `.init`,
    // `.self`, `.Type`, `.Protocol` — those are language forms that don't
    // need member-table validation.
    const nestedAccess = /\b([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let match: RegExpExecArray | null;
    while ((match = nestedAccess.exec(stripped)) !== null) {
      const parentTypeName = match[1]!;
      const accessedName = match[2]!;

      if (LANGUAGE_RESERVED_TYPE_MEMBERS.has(accessedName)) continue;
      if (KNOWN_NESTED_TYPE_NAMES.has(accessedName)) continue;

      // Skip declaration sites: `struct ParentType.Foo`, `extension ParentType.Foo`,
      // `case ParentType.foo`, `static let Parent.Foo`. These match the
      // pattern but aren't member access.
      const before = stripped.slice(Math.max(0, match.index - 32), match.index);
      if (
        /\b(?:struct|class|actor|enum|extension|case|protocol|typealias)\s+$/.test(before)
      ) {
        continue;
      }

      // Skip method invocation following the access: `Parent.factory(...)`.
      // The pattern can match the head; we only fire when the access is
      // resolved as a name lookup, not as a function call. Since static
      // methods are valid members, leaving `(` patterns in keeps the rule
      // honest — but we also need to require that the parent is genuinely
      // project-indexed and that `accessedName` does not appear in its
      // member set. Constructor calls are filtered downstream by the
      // member-set check (the constructor isn't in the member set, so we'd
      // false-positive on every `Foo()` call).
      const after = stripped[match.index + match[0].length];
      if (after === "(") {
        // Could be a constructor-shaped pattern like `Result.success(value)`.
        // We treat parens after a capitalized accessed name as enum-case
        // construction; require the accessed name to be lowercase-first to
        // proceed (typical for static methods / enum cases).
        if (/^[A-Z]/.test(accessedName)) continue;
      }

      const members = projectMembers.get(parentTypeName);
      if (!members) continue;
      if (members.has(accessedName)) continue;

      const key = `${input.file}:${parentTypeName}:${accessedName}:${match.index}`;
      if (reported.has(key)) continue;
      reported.add(key);

      // For type-on-type access we want nested-type-shaped candidates
      // (uppercase-first) to win over a same-name stored property
      // (lowercase-first). `IntelBriefItem.Kind` should suggest `IntelKind`,
      // not the `kind: IntelKind` stored property — the agent is clearly
      // looking up a nested type, and a property name is the wrong fix.
      const suggestion = suggestSimilarMemberWithCasePreference(accessedName, members);

      diagnostics.push(
        makeDiagnostic(
          "AX848",
          input.file,
          1 + countNewlinesUpTo(input.source, match.index),
          {
            message: `'${accessedName}' is not a nested type or static member of '${parentTypeName}'.${
              suggestion ? ` Did you mean '${suggestion}'?` : ""
            } (resolved via project-context index)`,
            suggestion: suggestion
              ? `Replace '${parentTypeName}.${accessedName}' with '${parentTypeName}.${suggestion}', or grep the declaring file to confirm the real nested type name.`
              : `Open the file declaring '${parentTypeName}' and verify the nested type / static member name. Swift will reject this on the next build with 'is not a member type of'.`,
          }
        )
      );
    }
  }

  return diagnostics;
}

// Names that look like member access syntactically but are language forms
// or have meta-type semantics. Filtering these keeps AX848 noise-free.
const LANGUAGE_RESERVED_TYPE_MEMBERS = new Set([
  "self",
  "Self",
  "Type",
  "Protocol",
  "init",
  "deinit",
  "subscript",
]);

// Common nested type / static member names that come from the standard
// library or system frameworks. These would otherwise generate noise on
// project types that happen to share a parent name with a system type.
const KNOWN_NESTED_TYPE_NAMES = new Set([
  // Result + Optional
  "success",
  "failure",
  "some",
  "none",
  // Bool / Int / String shorthand
  "max",
  "min",
  "zero",
  "one",
  "infinity",
  "pi",
  "nan",
  // SwiftUI common namespacing
  "shared",
  "default",
  "global",
  "main",
  "current",
  // Color / Edge / Alignment / Axis static members (SwiftUI)
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "white",
  "black",
  "gray",
  "primary",
  "secondary",
  "accentColor",
  "clear",
  "leading",
  "trailing",
  "top",
  "bottom",
  "center",
  "horizontal",
  "vertical",
  "all",
  "automatic",
  // Animation / Transition
  "easeIn",
  "easeOut",
  "easeInOut",
  "linear",
  "spring",
  "interactiveSpring",
  "interpolatingSpring",
  "slide",
  "scale",
  "opacity",
  // Date / Calendar
  "now",
  "distantFuture",
  "distantPast",
  // Logging
  "info",
  "debug",
  "warning",
  "error",
  "notice",
  "fault",
]);

function suggestSimilarMember(needle: string, haystack: Set<string>): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const candidate of haystack) {
    const distance = levenshtein(needle, candidate);
    const max = Math.max(needle.length, candidate.length);
    if (distance > Math.floor(max / 2)) continue;
    if (!best || distance < best.distance) best = { name: candidate, distance };
  }
  return best ? best.name : null;
}

/**
 * Like {@link suggestSimilarMember} but biased toward case-shape parity
 * with the needle, with a substring-of-candidate preference layered on
 * top. Used by AX848 for type-on-type access where the user typed a
 * capitalized member and the candidate set contains both nested types
 * (uppercase-first) and stored properties (lowercase-first).
 *
 * Ranking, in order:
 *   1. Candidates that share the needle's case shape AND contain the
 *      needle as a substring (e.g. needle "Kind" → candidate "IntelKind").
 *   2. Other candidates that share the needle's case shape, ranked by
 *      Levenshtein.
 *   3. Fall back to standard Levenshtein over the full candidate set if
 *      no case-shape-matching candidate clears the threshold.
 */
function suggestSimilarMemberWithCasePreference(
  needle: string,
  haystack: Set<string>
): string | null {
  const needleStartsUpper = /^[A-Z]/.test(needle);
  const sameCase: string[] = [];
  for (const candidate of haystack) {
    const candidateStartsUpper = /^[A-Z]/.test(candidate);
    if (candidateStartsUpper === needleStartsUpper) sameCase.push(candidate);
  }

  // First pass: substring match on a same-case candidate. This is the
  // common shape for renamed nested types where the full name embeds
  // the original (Kind → IntelKind, Result → ResultV2).
  for (const candidate of sameCase) {
    if (candidate.includes(needle) || needle.includes(candidate)) return candidate;
  }

  // Second pass: Levenshtein over same-case candidates only.
  if (sameCase.length > 0) {
    const sameCaseSet = new Set(sameCase);
    const sameCaseHit = suggestSimilarMember(needle, sameCaseSet);
    if (sameCaseHit) return sameCaseHit;
  }

  // Final fallback: full set, original behavior.
  return suggestSimilarMember(needle, haystack);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

// ─── Rule: AX840 — Cross-module symbol requires unimported framework ───
//
// Bundled table of "if you reference X.Y, you need to `import M`". Covers
// the most common Swift-only modules where agents trip up. The catch
// fires when the file uses one of these symbols and doesn't import the
// declaring module.
//
// To extend: add an entry under MODULE_SYMBOLS. The map value is a list
// of `Type.member` strings that uniquely identify the module — we don't
// fire on bare type names like `URL` (Foundation is auto-imported almost
// everywhere) but on member access where the module signal is clear.

// `SHORTHAND` patterns are full regex sources (no escaping happens) so we
// can match SwiftUI shorthand like `[.text]` / `of: [.image]` / `.fileURL`
// where the parameter type is inferred. These are uniquely-UTType shorthand
// names — bare `.text` outside a UTType context (e.g. a TextField type
// param) won't match because the patterns require list/argument context.
const MODULE_SYMBOLS: Record<string, readonly string[]> = {
  UniformTypeIdentifiers: [
    "UTType.text",
    "UTType.url",
    "UTType.fileURL",
    "UTType.image",
    "UTType.movie",
    "UTType.audio",
    "UTType.pdf",
    "UTType.data",
    "UTType.json",
    "UTType.plainText",
    "UTType.utf8PlainText",
    "UTType.html",
    "UTType.xml",
    "UTType.zip",
    "UTType.folder",
    // SwiftUI shorthand inside `onDrop`, `fileImporter`, `itemProvider`
    // etc. where the parameter is typed as `[UTType]` and Swift infers.
    "SHORTHAND:\\[\\s*\\.(?:text|url|fileURL|image|movie|audio|pdf|data|json|plainText|html|xml|zip|folder)\\b",
    "SHORTHAND:of\\s*:\\s*\\[\\s*\\.(?:text|url|fileURL|image|movie|audio|pdf|data|json|plainText|html|xml|zip|folder)\\b",
  ],
  Combine: [
    "AnyCancellable",
    "PassthroughSubject",
    "CurrentValueSubject",
    "Just(",
    "Empty(",
    "Future(",
    "ObservableObjectPublisher",
  ],
  Charts: [
    "Chart(",
    "BarMark(",
    "LineMark(",
    "PointMark(",
    "AreaMark(",
    "RuleMark(",
    "ChartProxy",
  ],
  AVFoundation: [
    "AVPlayer(",
    "AVAsset(",
    "AVAudioPlayer(",
    "AVAudioSession",
    "AVCaptureSession(",
    "AVURLAsset(",
  ],
  AVKit: ["VideoPlayer("],
  MapKit: [
    "MKMapView(",
    "MKMapItem(",
    "MKCoordinateRegion(",
    "MKMarkerAnnotationView(",
    "Marker(",
    "Annotation(",
    "MapPolyline(",
  ],
  CoreLocation: [
    "CLLocationManager(",
    "CLLocation(",
    "CLLocationCoordinate2D(",
    "CLAuthorizationStatus",
  ],
  CoreImage: ["CIImage(", "CIFilter(", "CIContext(", "CIColor("],
  CoreData: [
    "NSManagedObject",
    "NSManagedObjectContext",
    "NSPersistentContainer(",
    "NSFetchRequest",
    "NSEntityDescription",
  ],
  PhotosUI: ["PhotosPicker(", "PhotosPickerItem("],
  StoreKit: ["Product.products(", "Transaction.currentEntitlements", "AppStore.sync("],
  WidgetKit: [
    "WidgetCenter.shared",
    "TimelineEntry",
    "TimelineProvider",
    "StaticConfiguration(",
    "AppIntentConfiguration(",
  ],
  AppIntents: [
    "AppIntent",
    "AppEntity",
    "EntityQuery",
    "AppShortcut(",
    "AppShortcutsProvider",
    "IntentParameter",
  ],
  WeatherKit: ["WeatherService.shared", "CurrentWeather", "DayWeather"],
  HealthKit: ["HKHealthStore(", "HKQuantityType", "HKWorkout"],
  AuthenticationServices: [
    "ASWebAuthenticationSession(",
    "ASAuthorizationAppleIDProvider(",
    "SignInWithAppleButton(",
  ],
  CryptoKit: [
    "SHA256.hash(",
    "SHA512.hash(",
    "SymmetricKey(",
    "AES.GCM.seal(",
    "Curve25519.Signing",
  ],
};

function checkMissingModuleImports(input: SwiftValidationInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripCommentsAndStrings(input.source);
  const importedModules = collectImportedModules(stripped);
  const reported = new Set<string>();

  for (const [moduleName, symbols] of Object.entries(MODULE_SYMBOLS)) {
    if (importedModules.has(moduleName)) continue;
    for (const symbol of symbols) {
      // Three pattern shapes:
      //   - `SHORTHAND:<regex>` — raw regex, used for SwiftUI shorthand
      //     like `[.text]` where Swift infers the type. The regex source
      //     follows the `SHORTHAND:` prefix verbatim.
      //   - `Foo(`              — must match a constructor / function call.
      //   - `Foo` or `Foo.bar`  — must match as bare identifier / member.
      let core: string;
      let pattern: RegExp;
      if (symbol.startsWith("SHORTHAND:")) {
        const rawRe = symbol.slice("SHORTHAND:".length);
        pattern = new RegExp(rawRe);
        // Display label for the diagnostic — pull the first identifier
        // out of the regex so the message is readable.
        core = rawRe.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? rawRe;
      } else if (symbol.endsWith("(")) {
        core = symbol.slice(0, -1);
        pattern = new RegExp(`\\b${escapeRegex(core)}\\s*\\(`);
      } else {
        core = symbol;
        pattern = new RegExp(`\\b${escapeRegex(core)}\\b`);
      }
      const match = pattern.exec(stripped);
      if (!match) continue;

      const key = `${moduleName}:${symbol}`;
      if (reported.has(key)) continue;
      reported.add(key);

      diagnostics.push(
        makeDiagnostic(
          "AX840",
          input.file,
          1 + countNewlinesUpTo(input.source, match.index),
          {
            message: `'${core}' is declared in the '${moduleName}' module but this file does not import it. Xcode will fail with: "Static property/method '${core.split(".").pop() ?? core}' is not available due to missing import of defining module".`,
            suggestion: `Add \`import ${moduleName}\` to the top of this file. The compiler treats missing-import errors as fatal even when every other gate passes.`,
          }
        )
      );
      // Only one diagnostic per missing module per file — once we tell
      // the agent the import is missing, listing every site is noise.
      break;
    }
  }

  return diagnostics;
}

function collectImportedModules(stripped: string): Set<string> {
  const modules = new Set<string>();
  const pattern = /^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    // `import Foundation.NSURL` style — root module is what matters.
    const root = match[1]!.split(".")[0]!;
    modules.add(root);
  }
  return modules;
}

// ─── Rule: AX844 — Synthesized conformance can't propagate across files ─
//
// Catches the dogfooding pattern where a struct declares Hashable/Equatable/
// Codable but a stored property's type — defined in another file — doesn't
// conform. Swift's compiler walks the stored-property type graph at conf-
// ormance derivation time and rejects the synthesis. axint's other rules
// don't do that walk; this one does, using the project-context index.
//
// Heuristic boundaries: only fires when (a) we have project context, (b) the
// property's type is in the project index (so we know its declared
// conformances), (c) the type doesn't itself declare the protocol, and (d)
// the type isn't a known-conforming primitive (Int, String, Bool, etc).

const SYNTHESIZABLE_PROTOCOLS = [
  "Hashable",
  "Equatable",
  "Codable",
  "Decodable",
  "Encodable",
] as const;
type SynthProtocol = (typeof SYNTHESIZABLE_PROTOCOLS)[number];

// Standard library types every Swift programmer takes for granted as
// conforming to the synthesizable protocols. Not exhaustive but covers the
// common ones used as stored-property types.
const PRIMITIVE_CONFORMING: Record<SynthProtocol, ReadonlySet<string>> = {
  Hashable: new Set([
    "Int",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float",
    "Float32",
    "Float64",
    "Double",
    "CGFloat",
    "Bool",
    "String",
    "Substring",
    "Character",
    "Date",
    "URL",
    "UUID",
    "Data",
    "TimeInterval",
    "Decimal",
  ]),
  Equatable: new Set([
    "Int",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float",
    "Float32",
    "Float64",
    "Double",
    "CGFloat",
    "Bool",
    "String",
    "Substring",
    "Character",
    "Date",
    "URL",
    "UUID",
    "Data",
    "TimeInterval",
    "Decimal",
  ]),
  Codable: new Set([
    "Int",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float",
    "Float32",
    "Float64",
    "Double",
    "CGFloat",
    "Bool",
    "String",
    "Date",
    "URL",
    "UUID",
    "Data",
    "TimeInterval",
    "Decimal",
  ]),
  Decodable: new Set([
    "Int",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float",
    "Float32",
    "Float64",
    "Double",
    "CGFloat",
    "Bool",
    "String",
    "Date",
    "URL",
    "UUID",
    "Data",
    "TimeInterval",
    "Decimal",
  ]),
  Encodable: new Set([
    "Int",
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float",
    "Float32",
    "Float64",
    "Double",
    "CGFloat",
    "Bool",
    "String",
    "Date",
    "URL",
    "UUID",
    "Data",
    "TimeInterval",
    "Decimal",
  ]),
};

interface ConformanceIndexEntry {
  // The conformances this type declares directly via `: A, B, C` syntax,
  // plus conformances added via `extension TypeName: A {}` declarations
  // anywhere in the project.
  conformances: Set<string>;
}

function checkSynthesizedConformancePropagation(
  inputs: SwiftValidationInput[],
  projectFiles: Map<string, string>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inputPaths = new Set(inputs.map((i) => resolve(i.file)));

  // Build a project-wide map of type → declared conformances (incl. extensions).
  const conformanceIndex = collectConformanceIndex(projectFiles);

  for (const input of inputs) {
    if (!inputPaths.has(resolve(input.file))) continue;
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);

    for (const decl of decls) {
      // Only structs synthesize Hashable/Equatable/Codable for free
      // (classes need explicit implementations, enums w/o associated values
      // get them automatically anyway).
      if (decl.kind !== "struct") continue;

      const declaredProtocols: SynthProtocol[] = [];
      for (const proto of SYNTHESIZABLE_PROTOCOLS) {
        if (hasConformance(decl, proto)) declaredProtocols.push(proto);
      }
      if (declaredProtocols.length === 0) continue;

      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const properties = collectStoredPropertyTypes(body);
      if (properties.length === 0) continue;

      for (const prop of properties) {
        const elementType = unwrapCollectionType(prop.typeText);
        const baseName = baseSwiftTypeName(elementType);
        if (!baseName) continue;

        for (const proto of declaredProtocols) {
          if (PRIMITIVE_CONFORMING[proto].has(baseName)) continue;
          const entry = conformanceIndex.get(baseName);
          // Type isn't in our index — could be a system type we don't know
          // about. Don't fire (would produce false positives on Apple SDK
          // types like `BindingType` etc.).
          if (!entry) continue;
          if (entry.conformances.has(proto)) continue;

          const propLine =
            1 + countNewlinesUpTo(input.source, decl.bodyStart + prop.offsetInBody);

          diagnostics.push(
            makeDiagnostic("AX844", input.file, propLine, {
              message: `Synthesized '${proto}' for '${decl.name}' will fail: stored property '${prop.name}' has type '${prop.typeText}' and '${baseName}' does not declare '${proto}' conformance.`,
              suggestion: `Either remove '${proto}' from '${decl.name}', or extend '${baseName}: ${proto}' in its defining file, or change '${prop.name}' to a ${proto}-conforming type. The Swift compiler will reject this on the next build.`,
            })
          );
        }
      }
    }
  }

  return diagnostics;
}

function collectConformanceIndex(
  projectFiles: Map<string, string>
): Map<string, ConformanceIndexEntry> {
  const index = new Map<string, ConformanceIndexEntry>();

  for (const [, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    const decls = findTypeDeclarations(stripped, source);

    for (const decl of decls) {
      const baseName = baseSwiftTypeName(decl.name);
      if (!baseName) continue;
      const entry = index.get(baseName) ?? { conformances: new Set<string>() };

      // Direct conformances from `struct X: A, B, C {`. The decl's own
      // attributes/conformances are tracked elsewhere; we re-extract here
      // from the declaration source to avoid coupling assumptions.
      const beforeBody = source.slice(0, decl.bodyStart);
      const headerMatch = beforeBody.match(
        /\b(?:struct|class|enum|actor|protocol)\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:<[^>]*>)?\s*:\s*([^{]+)\{\s*$/
      );
      if (headerMatch) {
        for (const conformance of headerMatch[1]!.split(",")) {
          const name = baseSwiftTypeName(conformance.trim());
          if (name) entry.conformances.add(name);
        }
      }

      index.set(baseName, entry);
    }

    // Also pick up `extension TypeName: A, B {}` style.
    const extPattern =
      /\bextension\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:<[^>]*>)?\s*:\s*([^{]+)\{/g;
    let extMatch: RegExpExecArray | null;
    while ((extMatch = extPattern.exec(stripped)) !== null) {
      const baseName = baseSwiftTypeName(extMatch[1]!);
      if (!baseName) continue;
      const entry = index.get(baseName) ?? { conformances: new Set<string>() };
      for (const conformance of extMatch[2]!.split(",")) {
        const name = baseSwiftTypeName(conformance.trim());
        if (name) entry.conformances.add(name);
      }
      index.set(baseName, entry);
    }
  }

  return index;
}

interface StoredPropertyInfo {
  name: string;
  typeText: string;
  offsetInBody: number;
}

function collectStoredPropertyTypes(body: string): StoredPropertyInfo[] {
  const properties: StoredPropertyInfo[] = [];
  // Match `let foo: Type` or `var foo: Type = …` patterns. Type capture
  // starts with `[`, `(`, or a letter so we cover array/dict sugar like
  // `[Foo]` and tuple types like `(String, Int)` in addition to bare names.
  // Skips computed properties via the `(?=\s*(?:=|$|\{|\n))` lookahead.
  const pattern =
    /(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s+)?(?:public|internal|private|fileprivate|open|static|class)?\s*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([[(A-Za-z_][A-Za-z0-9_.<>?![\](), :\s]*?)(?=\s*(?:=|\{|\n|$))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const name = match[1]!;
    const typeText = (match[2] ?? "").trim().replace(/\s+/g, " ");
    if (!typeText) continue;
    if (typeText.endsWith("{") || /\bget\b/.test(typeText)) continue;
    properties.push({ name, typeText, offsetInBody: match.index });
  }
  return properties;
}

function unwrapCollectionType(typeText: string): string {
  let t = typeText.trim();
  // Strip optional sugar.
  while (t.endsWith("?") || t.endsWith("!")) t = t.slice(0, -1).trim();
  // Array sugar: [Foo] -> Foo
  const arrayMatch = t.match(/^\[\s*(.+)\s*\]$/);
  if (arrayMatch) return unwrapCollectionType(arrayMatch[1]!);
  // Dictionary sugar: [K: V] -> we care about V (the more interesting type)
  const dictMatch = t.match(/^\[\s*[^:]+\s*:\s*(.+)\s*\]$/);
  if (dictMatch) return unwrapCollectionType(dictMatch[1]!);
  // Generic collections: Set<Foo>, Array<Foo>, Optional<Foo>
  const genMatch = t.match(/^(?:Set|Array|Optional|Dictionary)<\s*([^,>]+)/);
  if (genMatch) return unwrapCollectionType(genMatch[1]!);
  return t;
}

// ─── Rule: AX843 — State-machine orphan ─────────────────────────────────
//
// Catches the dogfooding pattern where an enum case is assigned somewhere
// (e.g. `Navigator.rightPane = .voiceInbox`) but no `switch` or pattern
// match anywhere reads it. The case is dead state — the writer thinks
// it's wiring something up; the reader was never built or got dropped in
// a refactor (the SocialShellView voice-inbox case).
//
// Conservative scope to keep noise down:
//   - Only fires when project context is loaded (we need the full read
//     surface, not just what's in the input set).
//   - Only fires for enums declared in the input set (otherwise we'd
//     warn on every system enum case the agent uses).
//   - "Read" means: appears in `case .X:`, `case .X(let …):`, `is .X`,
//     or `== .X` patterns.
//   - Severity is `info` because false positives are possible (cases
//     might be read via reflection, JSON decoding, etc.).

function checkStateMachineOrphans(
  inputs: SwiftValidationInput[],
  projectFiles: Map<string, string>
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inputPaths = new Set(inputs.map((i) => resolve(i.file)));

  // For each enum declared in the input set, collect its cases.
  for (const input of inputs) {
    if (!inputPaths.has(resolve(input.file))) continue;
    const stripped = stripCommentsAndStrings(input.source);
    const decls = findTypeDeclarations(stripped, input.source);

    for (const decl of decls) {
      if (decl.kind !== "enum") continue;
      const body = stripped.slice(decl.bodyStart, decl.bodyEnd);
      const cases = collectEnumCases(body);
      if (cases.length === 0) continue;

      for (const enumCase of cases) {
        const writeCount = countCaseWrites(projectFiles, decl.name, enumCase.name);
        if (writeCount === 0) continue; // never written, so not an "orphan"

        const readCount = countCaseReads(projectFiles, enumCase.name, decl.name);
        if (readCount > 0) continue;

        const offsetInSource = decl.bodyStart + enumCase.offsetInBody;
        diagnostics.push(
          makeDiagnostic(
            "AX843",
            input.file,
            1 + countNewlinesUpTo(input.source, offsetInSource),
            {
              message: `Enum case '${decl.name}.${enumCase.name}' is assigned ${writeCount} time(s) in the project but no switch/pattern reads it.`,
              suggestion: `Either add a consumer (a 'switch ${enumCase.name === "default" ? "value" : "value"}' or 'case .${enumCase.name}:' branch) somewhere reachable from the live root, or remove the case if the feature was dropped. Common cause: a refactor replaced the consumer view but kept the writer.`,
            }
          )
        );
      }
    }
  }

  return diagnostics;
}

function collectEnumCases(body: string): Array<{ name: string; offsetInBody: number }> {
  const cases: Array<{ name: string; offsetInBody: number }> = [];
  // `case foo`, `case foo, bar`, `case foo(String)` — capture each name.
  const pattern = /\bcase\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const startOffset = match.index + match[0].indexOf(match[1]!);
    let cursor = startOffset;
    for (const raw of match[1]!.split(",")) {
      const name = raw.trim();
      if (name) {
        const offset = body.indexOf(name, cursor);
        cases.push({ name, offsetInBody: offset >= 0 ? offset : cursor });
        cursor = offset + name.length;
      }
    }
  }
  return cases;
}

function countCaseWrites(
  projectFiles: Map<string, string>,
  enumName: string,
  caseName: string
): number {
  // Writes look like `Foo.bar = ...`, `someExpr = .bar`, `someExpr = Foo.bar`.
  // We're conservative: only count `= .caseName` and `= EnumName.caseName`.
  let count = 0;
  const directRe = new RegExp(`=\\s*\\.${escapeRegex(caseName)}\\b`, "g");
  const qualifiedRe = new RegExp(
    `=\\s*${escapeRegex(enumName)}\\.${escapeRegex(caseName)}\\b`,
    "g"
  );
  for (const [, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    count += (stripped.match(directRe) ?? []).length;
    count += (stripped.match(qualifiedRe) ?? []).length;
  }
  return count;
}

function countCaseReads(
  projectFiles: Map<string, string>,
  caseName: string,
  enumName: string
): number {
  // Reads: `case .caseName`, `is .caseName`, `== .caseName`, `case let .caseName`,
  // `case EnumName.caseName`. We don't try to scope to switches over the right
  // enum — too brittle. We just count any of these patterns; if zero, no read.
  let count = 0;
  const patterns = [
    new RegExp(`\\bcase\\s+(?:let\\s+|var\\s+)?\\.${escapeRegex(caseName)}\\b`, "g"),
    new RegExp(
      `\\bcase\\s+(?:let\\s+|var\\s+)?${escapeRegex(enumName)}\\.${escapeRegex(caseName)}\\b`,
      "g"
    ),
    new RegExp(`\\bis\\s+\\.${escapeRegex(caseName)}\\b`, "g"),
    new RegExp(`==\\s*\\.${escapeRegex(caseName)}\\b`, "g"),
    new RegExp(`==\\s*${escapeRegex(enumName)}\\.${escapeRegex(caseName)}\\b`, "g"),
    // if case .caseName = expr  syntax
    new RegExp(
      `\\bif\\s+case\\s+(?:let\\s+|var\\s+)?\\.${escapeRegex(caseName)}\\b`,
      "g"
    ),
  ];
  for (const [, source] of projectFiles) {
    const stripped = stripCommentsAndStrings(source);
    for (const pattern of patterns) {
      count += (stripped.match(pattern) ?? []).length;
    }
  }
  return count;
}

// ─── Rule: AX845 — @MainActor static method in init default-value ──────
//
// Catches the dogfooding pattern where a `@MainActor` class/struct has an
// init parameter whose default value calls one of the same type's static
// methods (e.g. `init(base: URL = MyStore.defaultBase())`). Default-value
// expressions evaluate at the call-site's isolation context — which is
// often non-isolated (SwiftUI environment injection, parallel construction).
// Swift 6 rejects the actor crossing.
//
// Fix the agent should propose: mark the static helper `nonisolated` if it
// doesn't actually touch MainActor state. Single-keyword fix.
//
// Conservative scope: only fires on `static func` references (not `static
// let` constants, which are evaluated once at type initialization). Single-
// file analysis — no project context needed.

function checkMainActorStaticInDefaultValue(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  const decls = findTypeDeclarations(stripped, source);
  for (const decl of decls) {
    if (decl.kind !== "class" && decl.kind !== "struct") continue;
    if (!hasAttribute(decl, "@MainActor")) continue;

    const body = stripped.slice(decl.bodyStart, decl.bodyEnd);

    // Collect the type's static methods that aren't explicitly nonisolated.
    const isolatedStatics = collectIsolatedStaticMethods(body);
    if (isolatedStatics.size === 0) continue;

    // Find every init declaration's parameter list and inspect default values.
    const initPattern = /\binit\s*\(([^)]*)\)/g;
    let initMatch: RegExpExecArray | null;
    while ((initMatch = initPattern.exec(body)) !== null) {
      const paramsText = initMatch[1] ?? "";
      const initStartInBody = initMatch.index;

      // Walk each top-level parameter, looking for `= TypeName.staticMember(`.
      for (const rawParam of splitTopLevelArgs(paramsText)) {
        const eqIdx = findTopLevelEquals(rawParam);
        if (eqIdx === -1) continue;
        const defaultExpr = rawParam.slice(eqIdx + 1).trim();

        // Match `TypeName.foo(` and `Self.foo(` patterns.
        const callPattern = new RegExp(
          `\\b(?:${escapeRegex(decl.name)}|Self)\\.([A-Za-z_][A-Za-z0-9_]*)\\s*\\(`,
          "g"
        );
        let callMatch: RegExpExecArray | null;
        while ((callMatch = callPattern.exec(defaultExpr)) !== null) {
          const memberName = callMatch[1]!;
          if (!isolatedStatics.has(memberName)) continue;

          const offsetInSource = decl.bodyStart + initStartInBody;
          diagnostics.push(
            makeDiagnostic("AX845", file, 1 + countNewlinesUpTo(source, offsetInSource), {
              message: `@MainActor type '${decl.name}' has an init parameter default that calls static method '${memberName}()' — Swift 6 rejects this because default-value expressions evaluate at the caller's isolation context, which may not be MainActor.`,
              suggestion: `Mark '${memberName}()' as 'nonisolated' (preferred — it's a one-keyword fix if the method doesn't touch MainActor state). Alternatively, move the default into the body of init or remove the default and require callers to provide the value explicitly.`,
            })
          );
        }
      }
    }
  }
}

function collectIsolatedStaticMethods(typeBody: string): Set<string> {
  const isolated = new Set<string>();
  // Match `static func X(...)` declarations. Capture the name. Then check
  // back ~100 chars to see if `nonisolated` precedes it on the same line
  // or attribute block.
  const pattern = /\bstatic\s+func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(typeBody)) !== null) {
    const name = match[1]!;
    const before = typeBody.slice(Math.max(0, match.index - 120), match.index);
    if (/\bnonisolated\b\s*$/.test(before)) continue;
    if (/\bnonisolated\b[^{};]*$/m.test(before)) continue;
    isolated.add(name);
  }
  return isolated;
}

function findTopLevelEquals(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === ">") depth--;
    else if (c === "=" && depth === 0 && text[i + 1] !== "=" && text[i - 1] !== "=") {
      return i;
    }
  }
  return -1;
}

// ─── Rule: AX846 — @ViewBuilder requires a View return type ────────────
//
// Catches the dogfooding pattern where `@ViewBuilder` annotates a property
// or function whose return type isn't `some View` / `View`. The result-
// builder transform produces `_ConditionalContent<A, B>` for if/else, and
// `_ConditionalContent` only conforms to `View` — never to `Shape`,
// `Layout`, `ToolbarContent`, etc. So `@ViewBuilder some Shape` is
// unsatisfiable and Xcode rejects it.
//
// Single-file analysis, no project context required. Fires per declaration.

const VIEWBUILDER_LIKE_RETURN_TYPES = new Set([
  "View",
  "AnyView",
  "EmptyView",
  "TupleView",
  "Group",
  // Other result builders Apple ships — not exhaustive, but covers the
  // ones a developer would plausibly @ViewBuilder against by mistake.
]);

function checkViewBuilderReturnType(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  // Match `@ViewBuilder ... var name : ReturnType {` and similar for func.
  // We capture the return type so we can validate it.
  const propertyPattern =
    /@ViewBuilder\b[^{};]*?\b(?:var|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(some\s+[A-Za-z_][A-Za-z0-9_.]*|[A-Za-z_][A-Za-z0-9_.<>?[\]]*)\s*\{/g;
  const funcPattern =
    /@ViewBuilder\b[^{};]*?\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*->\s*(some\s+[A-Za-z_][A-Za-z0-9_.]*|[A-Za-z_][A-Za-z0-9_.<>?[\]]*)/g;

  for (const pattern of [propertyPattern, funcPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(stripped)) !== null) {
      const name = match[1]!;
      const returnTypeRaw = match[2]!.trim();
      const baseName = baseSwiftTypeName(returnTypeRaw.replace(/^some\s+/, ""));
      if (!baseName) continue;
      if (VIEWBUILDER_LIKE_RETURN_TYPES.has(baseName)) continue;

      // Special case: if the return type is something obviously View-shaped
      // by suffix convention (ends in "View"), skip — the dev knows what
      // they're doing. e.g. `some MyCustomView`.
      if (baseName.endsWith("View")) continue;

      diagnostics.push(
        makeDiagnostic("AX846", file, 1 + countNewlinesUpTo(source, match.index), {
          message: `@ViewBuilder on '${name}' returns '${returnTypeRaw}' but @ViewBuilder produces View-shaped content (_ConditionalContent / TupleView / EmptyView). '${baseName}' is not a View protocol — Xcode will reject this.`,
          suggestion:
            baseName === "Shape"
              ? "Drop @ViewBuilder and return AnyShape directly: write `private var name: AnyShape { if cond { return AnyShape(Circle()) } else { return AnyShape(...) } }`. AnyShape is the canonical type-erased Shape and preserves Shape methods like strokeBorder."
              : `Drop @ViewBuilder and return Any${baseName} (if available) explicitly with branches that wrap each result. @ViewBuilder is exclusively for View-returning helpers.`,
        })
      );
    }
  }
}

// ─── Rule: AX847 — type-erased SwiftUI protocol method missing ─────────
//
// Catches the dogfooding pattern where a developer type-erases to AnyShape
// (or AnyView / AnyTransition) and then calls a method that lives on a
// sub-protocol the erasure dropped. The canonical example: AnyShape only
// conforms to Shape, but `.strokeBorder` is on InsettableShape — so
// `anyShape.strokeBorder(...)` fails compile.
//
// Bundled table of "type-erased name -> methods that DON'T exist on the
// erased surface". Walks property declarations, let/var bindings, and
// computed properties for variables typed as one of these erased names,
// then scans for forbidden method calls on them.

const TYPE_ERASURE_LOST_METHODS: Record<string, Record<string, string>> = {
  AnyShape: {
    strokeBorder:
      "Use .stroke instead. strokeBorder lives on InsettableShape; AnyShape only conforms to Shape. The visual difference (half-pixel inset) is invisible at lineWidths <= 1pt. For perfect inset rendering, write a custom AnyInsettableShape wrapper.",
    inset:
      "AnyShape erases the InsettableShape conformance. Either keep the original concrete type (Circle / RoundedRectangle), or write a custom AnyInsettableShape wrapper.",
  },
  // Future: AnyView, AnyTransition, AnyLayout — add as incidents surface.
};

function checkTypeErasedProtocolMethods(
  source: string,
  stripped: string,
  file: string,
  diagnostics: Diagnostic[]
) {
  // Find every binding/property typed as a known type-erased protocol.
  // Covers `let x: AnyShape`, `var x: AnyShape`, `private var x: AnyShape`,
  // and computed properties `var x: AnyShape { ... }`.
  const erasedBindings = new Map<string, string>();
  const erasedNames = Object.keys(TYPE_ERASURE_LOST_METHODS);
  const namePattern = erasedNames.map(escapeRegex).join("|");
  const declRegex = new RegExp(
    `\\b(?:let|var)\\s+([a-z_][A-Za-z0-9_]*)\\s*:\\s*(${namePattern})\\b`,
    "g"
  );
  let declMatch: RegExpExecArray | null;
  while ((declMatch = declRegex.exec(stripped)) !== null) {
    erasedBindings.set(declMatch[1]!, declMatch[2]!);
  }

  if (erasedBindings.size === 0) return;

  const reported = new Set<string>();
  for (const [varName, erasedType] of erasedBindings) {
    const lostMethods = TYPE_ERASURE_LOST_METHODS[erasedType]!;
    for (const [methodName, advice] of Object.entries(lostMethods)) {
      const callRegex = new RegExp(
        `\\b${escapeRegex(varName)}\\.${escapeRegex(methodName)}\\s*\\(`,
        "g"
      );
      let callMatch: RegExpExecArray | null;
      while ((callMatch = callRegex.exec(stripped)) !== null) {
        const key = `${varName}:${methodName}:${callMatch.index}`;
        if (reported.has(key)) continue;
        reported.add(key);

        diagnostics.push(
          makeDiagnostic("AX847", file, 1 + countNewlinesUpTo(source, callMatch.index), {
            message: `'${varName}' is typed as '${erasedType}' but '.${methodName}(' lives on a sub-protocol that ${erasedType} does not conform to. Xcode will reject this with "Value of type '${erasedType}' has no member '${methodName}'".`,
            suggestion: advice,
          })
        );
      }
    }
  }
}
