# Apple Platform Gap Analysis for Axint

Date: 2026-07-07  
Repository: `/Users/nimanejat/agenticempire/axint`  
Audit goal: identify every Apple 2026/WWDC26-era capability that can improve Axint as the Apple-native execution layer for AI coding agents.

## Executive Summary

Axint is already pointed at the right Apple future. The codebase has first-class compiler surfaces for App Intents, App Entities, App Enums, App Shortcuts, SwiftUI views, WidgetKit widgets, Live Activities, app shells, extensions, Fix Packets, Cloud Check, MCP, CLI, SPM plugins, and Xcode-facing repair workflows. The strongest existing adoption is in App Intents and repair diagnostics: `schema`, `schemaDomain`, `ValueRepresentation` / `IntentValueRepresentation`, `RelevantEntities`, `EntityCollection`, `SyncableEntity`, `IndexedEntity`, `IndexedEntityQuery`, `OwnershipProvidingEntity`, `LongRunningIntent`, `CancellableIntent`, `ExecutionTargets`, AppIntentsTesting scaffolding, and Cloud Check readiness checks all appear in the tree.

The biggest gap is that several WWDC26 concepts are detected or documented but not yet modeled as complete compiler surfaces. Axint can often warn that a modern Apple capability is missing, but it cannot always generate the correct Swift, tests, entitlements, privacy files, package manifests, examples, or repair instructions. The highest-impact work is to turn these partial recognizers into generated, testable, repairable APIs.

Highest priority:

1. Replace the current AppIntentsTesting checklist scaffold with concrete out-of-process integration tests for intents, entity queries, Spotlight indexing, and View Annotations.
2. Add first-class App Intents advanced APIs: `@UnionValue`, richer native parameter types, `ProgressReportingIntent`, `LongRunningIntent.performBackgroundTask`, `CancellableIntent.onCancel`, dialog/snippet responses, `authenticationPolicy`, confirmations, and execution-target validation.
3. Promote Siri/App Schema and Spotlight semantic index readiness from regex-based Cloud Check hints to generated source, IR validation, source validation, and proof artifacts.
4. Add a Foundation Models / Core AI package surface with safety, transcript, evaluation, availability, Private Cloud Compute fallback, and local-model deployment proof.
5. Package Axint for Xcode 27 plugins: skills, MCP server, and agent instructions, so Xcode’s agent ecosystem can install Axint as a native agentic coding extension rather than only an external MCP command.

Verification performed during this audit:

- `npm run typecheck` passes on the current tree.
- I did not run the full Vitest/Python suite because this audit did not modify production code and the working tree already contains many unrelated in-progress changes.
- After the initial pass, the official iOS & iPadOS 27 Beta 3 release notes were checked and incorporated as a release-note delta. The original audit covered the WWDC26 Siri/App Schema direction, but not every Beta 3 known issue and rename.

## Apple Sources Reviewed

Primary Apple sources used for this audit:

- [Apple Newsroom: Apple accelerates app development with new intelligence frameworks and advanced tools](https://www.apple.com/newsroom/2026/06/apple-aids-app-development-with-new-intelligence-frameworks-and-advanced-tools/)
- [WWDC26 Apple Intelligence guide](https://developer.apple.com/wwdc26/guides/apple-intelligence/)
- [WWDC26 iOS guide](https://developer.apple.com/wwdc26/guides/ios/)
- [iOS & iPadOS 27 Beta 3 Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes)
- [WWDC26 App Store guide](https://developer.apple.com/wwdc26/guides/app-store/)
- [Inside Apple Intelligence and Xcode: Special Presentation](https://developer.apple.com/videos/play/wwdc2026/382/)
- [Discover new capabilities in the App Intents framework](https://developer.apple.com/videos/play/wwdc2026/345/)
- [Build intelligent Siri experiences with App Schemas](https://developer.apple.com/videos/play/wwdc2026/240/)
- [Explore advanced App Intents features for Siri and Apple Intelligence](https://developer.apple.com/videos/play/wwdc2026/343/)
- [Validate your App Intents adoption with AppIntentsTesting](https://developer.apple.com/videos/play/wwdc2026/295/)
- [LLM search using Core Spotlight](https://developer.apple.com/videos/play/wwdc2026/246/)
- [What’s new in the Foundation Models framework](https://developer.apple.com/videos/play/wwdc2026/241/)
- [Build agentic app experiences with the Foundation Models framework](https://developer.apple.com/videos/play/wwdc2026/242/)
- [Meet the Evaluations framework](https://developer.apple.com/videos/play/wwdc2026/298/)
- [Meet Core AI](https://developer.apple.com/videos/play/wwdc2026/324/)
- [What’s new in SwiftUI](https://developer.apple.com/videos/play/wwdc2026/269/)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Modernize your UIKit app](https://developer.apple.com/videos/play/wwdc2026/278/)
- [WidgetKit foundations](https://developer.apple.com/videos/play/wwdc2026/277/)
- [Secure your app: mitigate risks to agentic features](https://developer.apple.com/videos/play/wwdc2026/347/)
- [Meet Trust Insights](https://developer.apple.com/videos/play/wwdc2026/379/)
- [What’s new in Xcode 27](https://developer.apple.com/videos/play/wwdc2026/258/)
- [Xcode, agents, and you](https://developer.apple.com/videos/play/wwdc2026/259/)
- [Giving external agents access to Xcode](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode)
- [Enhance your presence on the App Store](https://developer.apple.com/videos/play/wwdc2026/205/)
- [Unlock in-game content with StoreKit and Background Assets](https://developer.apple.com/videos/play/wwdc2026/378/)
- [Background Tasks](https://developer.apple.com/documentation/backgroundtasks)
- [Performing long-running tasks on iOS and iPadOS](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados)
- [Meet the new MetricKit](https://developer.apple.com/videos/play/wwdc2026/222/)
- [What’s new in image understanding](https://developer.apple.com/videos/play/wwdc2026/237/)
- [Meet the Now Playing framework](https://developer.apple.com/videos/play/wwdc2026/312/)
- [Discover generated subtitles and subtitle styles](https://developer.apple.com/videos/play/wwdc2026/256/)
- [Build next-generation experiences with visionOS 27](https://developer.apple.com/videos/play/wwdc2026/287/)
- [Speedrun your game port with agentic coding](https://developer.apple.com/videos/play/wwdc2026/357/)

## iOS & iPadOS 27 Beta 3 Delta

This section is a late addendum based on Apple's official iOS & iPadOS 27 Beta 3 release notes. It should be treated as higher volatility than the WWDC sessions because beta release-note bugs and workarounds can change quickly.

Important correction: the original audit included the broad Siri/App Schema and Apple Intelligence strategy from WWDC26, but it did not include all Beta 3 Siri/App Intents release-note items. The deltas below should be folded into the P0/P1 work.

### Siri and App Intents

What Apple introduced or changed:

- `notes.createNote` and `notes.updateNote` schemas now accept a `name` parameter of type `AttributedString`.
- The `calendar.deleteEvents` schema was renamed to `calendar.deleteEvent`.
- Siri currently has several third-party App Intents edge cases: non-SF Symbol entity images may not appear, schema defaults for `Set` parameters may not apply unless explicitly provided with `@Parameter`, `EntityStringQuery` alone may not resolve some entities, third-party search results may not be tappable, and Siri can choose the wrong `OpenIntent` / `system.open` intent when multiple intents target different entity types.
- `@UnionValue` is both important and fragile in Beta 3: Shortcuts can display duplicate number choices when a union includes multiple number-like cases; Siri may pass `String` instead of `PlaceDescriptorEntity` for a union that accepts both; WidgetKit timelines can fail when a `WidgetConfigurationIntent` uses a `@UnionValue` property.
- Transferable `IntentValueRepresentation` for `PHAsset` can require `import _Photos_AppIntents`.
- Siri can load resources from UIKit drag interactions when Apple Intelligence is invoked from a context menu. Apps should avoid animations or modal UI in `dragInteraction(_:sessionWillBegin:)` and do those actions in `dragInteraction(_:sessionDidMove:)`.

Relevance to Axint:

Very high. These are directly in Axint's App Intents, App Entity, App Schema, WidgetKit, UIKit validation, and Siri-readiness lane.

Current Axint implementation:

- Axint has schema-domain fields, entity indexing fields, `ValueRepresentation`, `IntentValueRepresentation`, `RelevantEntities`, `IndexedEntity`, and AppIntentsTesting scaffolding.
- Axint does not yet have a schema alias/deprecation registry, schema-specific parameter typing, `@UnionValue` validation, Siri issue workarounds, or UIKit drag-resource linting.

Gap:

The current roadmap says "add UnionValue" and "add App Schema support," but Beta 3 shows that a correct implementation also needs beta-aware rules and repair guidance. Without those rules, Axint could generate code that compiles but performs poorly in Siri, Shortcuts, Widgets, or Spotlight.

Recommended implementation:

- Add a release-note capability table in `src/apple/capabilities.ts` for `ios27.beta3` with schema renames, known issues, and workarounds.
- Add an App Schema registry entry:

```ts
{
  id: "appintents.schema.calendar.deleteEvent",
  introduced: "ios27-beta3",
  replaces: ["calendar.deleteEvents"],
  repair: "Rename calendar.deleteEvents to calendar.deleteEvent."
}
```

- Validate `notes.createNote` / `notes.updateNote` parameters so `name` may be generated as `AttributedString`.
- Add `@UnionValue` constraints:
  - Warn when a union includes more than one number-like case.
  - Warn when `PlaceDescriptorEntity` and `String` appear together and generate an explicit conversion helper.
  - Disallow or warn on `@UnionValue` inside `WidgetConfigurationIntent`; suggest a single `AppEntity` with a `kind` discriminator.
- Add Siri entity-resolution validation:
  - Entity types intended for Siri should provide Spotlight indexing or `IntentValueQuery` when only `EntityStringQuery` is present.
  - Entity display images used in Siri should prefer SF Symbols or provide a known fallback.
- Add a `PHAsset` import repair: when generated Swift references `Transferable IntentValueRepresentation` for `PHAsset`, emit `import _Photos_AppIntents`.
- Add UIKit source validation for `UIDragInteractionDelegate` methods that present modals or animate in `sessionWillBegin` when the app targets iOS 27.

Impact:

- User experience: very high for Siri reliability and Shortcuts editability.
- Performance: medium; fewer repeated failed entity resolutions and widget timeline failures.
- Reliability: very high; these rules catch known Beta 3 breakpoints before generated apps reach device testing.
- Maintainability: high; a release-note registry prevents one-off validators from scattering across the compiler.
- App Store readiness: high; Siri/App Intents regressions are visible review and quality risks.

Priority:

P0. This should be added before shipping an iOS 27 App Intents support claim.

### Apple Intelligence, Dictation, Foundation Models, and Core AI

What Apple introduced or changed:

- Dictation can use a new on-device model through the Advanced Dictation Preview setting.
- Core AI improves Neural Engine behavior for large models and now attributes Neural Engine memory usage to the app process in Instruments.
- Background Neural Engine access requires the `com.apple.developer.background-tasks.continued-processing.inference` entitlement.
- Foundation Models Beta 3 resolves several `@Generable`, `onPrompt`, and `model(_:)` issues, while retaining important known issues: Private Cloud Compute may not work in simulators, tool-calling plus guided generation may over-call tools, and `PrivateCloudComputeLanguageModel` uses greedy decoding unless a sampling mode is specified.
- Apple Intelligence Report may omit some Home Intelligence Private Cloud Compute data.

Relevance to Axint:

High. Axint's audit already recommended Foundation Models and Core AI surfaces, but Beta 3 adds specific entitlement, simulator, transcript, sampling, and evaluation rules.

Current Axint implementation:

- Axint has templates and Cloud Check regexes for Foundation Models, Evaluations, Private Cloud Compute fallback, Core AI deployment, and model proof.
- Axint does not generate entitlement fragments for background inference, does not model simulator/device availability for Private Cloud Compute, and does not validate sampling/tool-calling safeguards.

Recommended implementation:

- Extend the privacy/entitlement generator with `continued-processing.inference`.
- Add Core AI model proof fields for expected compute device, AOT/specialization state, cache policy, memory budget, and Instruments capture path.
- Generate Foundation Models availability guards that distinguish simulator, physical device, on-device model, and Private Cloud Compute.
- Add lint rules for tool over-calling risk and require evaluation cases for any generated tool-calling profile.
- Add an optional Dictation/Speech template note that Advanced Dictation Preview is system-controlled and should not be represented as an app-owned API.

Impact:

- User experience: high for model-backed features that should keep working offline or on physical devices.
- Performance: high for large local models and background inference.
- Reliability: high; prevents simulator-only proof from being mistaken for production readiness.
- App Store readiness: medium to high; entitlement and privacy wording must be correct.

Priority:

P1, with the entitlement rule elevated to P0 for any generated Core AI background workflow.

### UIKit, SwiftUI, WidgetKit, MetricKit, StoreKit, and App Store Readiness

What Apple introduced or changed:

- Apps built with the iOS 27 SDK must include a launch screen before App Store acceptance.
- Apps built with the latest SDK must adopt the scene-based life cycle.
- iPad continuous resizability has Beta 3 pitfalls around `UISupportedInterfaceOrientations` and `UIRequiresFullScreen`.
- UIKit menu/context-menu images are reduced by default; `preferredImageVisibility` controls exceptions.
- SwiftUI adds or changes status-bar color, `AsyncImage` caching, interactive text selection, macro-backed `@State`, document APIs, `TabsPickerStyle`, `TextInputBorderShape`, toolbar minimization, and `Document` protocol guidance.
- WidgetKit has a Beta 3 known issue with `@UnionValue` in configuration intents.
- MetricKit adds `MetricManager`, `MetricReport`, `DiagnosticReport`, `MemoryExceptionDiagnostic`, `terminationCategory`, `MetalFrameRateMetric`, and state-contextual diagnostics; old `MXMetricManager` APIs are no longer recommended for new adoption.
- StoreKit adds offer-code `VerificationResult`, assigned managed purchases, subscription bundles/suites, and Advanced Commerce partner fields.
- Trust Insights is now available with an entitlement and network connectivity.

Relevance to Axint:

Medium to high. Axint should not generate app shells, widgets, UI, or proof packs that miss these rules.

Recommended implementation:

- Add App Store readiness validation for launch screen keys and scene-based lifecycle.
- Add iPadOS 27 resizability checks: all orientations for continuously resizable iPad apps, avoid `UIRequiresFullScreen` in generated shells unless requested, and test resize matrices.
- Add UIKit/SwiftUI menu-image visibility and toolbar minimization rules.
- Add SwiftUI validators for new `@State` macro pitfalls and `TabView` hidden-selection crashes.
- Extend WidgetKit modernization with the Beta 3 `@UnionValue` configuration workaround.
- Add MetricKit 27 proof templates that prefer `MetricManager` and collect memory, termination, state, and Metal frame pacing diagnostics.
- Add StoreKit 27 template support only where Axint generates commerce examples; otherwise keep this as an optional domain pack.
- Treat Trust Insights as a privacy-sensitive optional template requiring entitlement documentation.

Impact:

- User experience: medium to high for generated UI shells and widgets.
- Performance: high when MetricKit proof is used.
- Reliability: high for app launch, scenes, widgets, and resize behavior.
- Maintainability: medium; mostly validator/template work.
- App Store readiness: very high because launch screen and scene lifecycle can become hard submission blockers.

Priority:

P1 for generated app shells/widgets; P2 for optional StoreKit/Trust Insights templates.

## Axint Codebase Map

Primary implementation surfaces inspected:

- Compiler IR and dispatch: `src/core/types.ts`, `src/core/compiler.ts`, `src/core/surface.ts`.
- App Intents and entities: `src/core/parser.ts`, `src/core/generator.ts`, `src/core/validator.ts`, `src/core/app-enum-*`, `src/core/app-shortcut-*`.
- SwiftUI generation: `src/core/view-*`, `src/core/view-body-*`, `src/mcp/view-blueprints.ts`.
- WidgetKit: `src/core/widget-*`.
- Live Activities: `src/core/live-activity-*`, `src/core/swift-validator-live-activities.ts`.
- Existing Swift repair: `src/core/swift-validator.ts`, `src/core/swift-fixer.ts`, `src/core/swift-fix-rules.ts`, `src/repair/*`.
- Apple Intelligence helpers: `src/apple-intelligence/appintents-testing.ts`, `examples/wwdc26-apple-intelligence.ts`, `src/templates/index.ts`.
- Cloud Check and readiness lanes: `src/cloud/check.ts`, `src/cloud/swift-typecheck.ts`, `src/core/tool-contract.ts`.
- CLI and MCP: `src/cli/*`, `src/mcp/*`.
- Xcode integration: `extensions/xcode/*`, `spm-plugin/*`.
- SDK parity: `src/sdk/index.ts`, `python/axint/*`, `src/mcp/schema-compile.ts`.
- Distribution and public truth: `README.md`, `ROADMAP.md`, `docs/*`, `extensions/*`, `metrics.json`, `package.json`.

## Capability Matrix

| Area | Apple 2026 / WWDC26 direction | Axint status | Gap |
| --- | --- | --- | --- |
| App Intents + Siri AI | App Schemas, semantic index, View Annotations, natural language actions, system-driven future language support | Partially adopted | Schema fields exist; generated view annotations, Spotlight indexing proof, concrete AppIntentsTesting, confirmations, and snippet/dialog generation are incomplete |
| Advanced App Intents | `ValueRepresentation`, `RelevantEntities`, `EntityCollection`, `SyncableEntity`, richer native parameter types, `@UnionValue`, long-running/cancellable intents, `ExecutionTargets` | Partially adopted | Several fields generate, but union/native types/progress/background task/cancel handler/dialog/snippet/auth are missing or shallow |
| AppIntentsTesting | Out-of-process tests for intents, entities, queries, Spotlight, View Annotations, no UI automation | Shallow scaffold | Current generator emits checklist comments and `#expect(true)` rather than executable framework calls |
| Foundation Models | Native Swift API with model abstraction, image input, Private Cloud Compute, third-party models, Dynamic Profiles, system Vision/Spotlight tools, Evaluations, `fm` CLI, Python SDK | Template/check only | No first-class IR/compiler surface or proof artifact format for model sessions/tools/evals/transcripts |
| Core AI / MLX | On-device model deployment, AOT compilation, specialization/cache, Instruments profiling, MLX agentic local workflows | Template/check only | No model asset manifest, availability guard, AOT proof, or generated integration shell |
| Xcode 27 agents | Built-in agents, plugins with skills/MCP/ACP, Device Hub, previews, localization, Organizer crash/perf workflows | External MCP and Source Editor Extension | No Xcode 27 plugin bundle for skills/MCP/agent config; extension remains old Source Editor Extension model |
| SwiftUI / Liquid Glass | Automatic new look, custom glass effects, toolbar overflow, prominent tabs, resizability, Document APIs, reorderable containers, performance improvements | Basic generator + validators | Generated view DSL lacks modern SwiftUI controls/modifiers and preview matrices; validators do not flag Liquid Glass/resizability/accessibility pitfalls |
| UIKit/AppKit modernization | Resizable iPhone/iPad layouts, tab/navigation updates, SwiftUI interop, agent modernization skills | Mostly not targeted | Axint inspects SwiftUI more deeply than UIKit/AppKit and does not generate modernization plans |
| WidgetKit | Configurable widgets with App Intents, interactive buttons/toggles, dynamic styling, tinted/clear modes, new families, remote widgets on Mac | Basic static timeline widget | No `AppIntentConfiguration`, interactive controls, dynamic styling modifiers, app group guidance, or new family support |
| Live Activities / ActivityKit | Long-running intent progress as Live Activity, Dynamic Island essentials, cancellation | Partial | Activity generator exists; no start/update/cancel helper, Info.plist entitlement fragments, push-token support, or long-running intent bridge |
| Background Tasks / Background Assets | Continued processing, BG tasks, managed/localized background asset packs | Mostly missing | Axint does not generate BackgroundTasks or Background Assets surfaces; relevant for long-running work/model assets |
| StoreKit / App Store | StoreKit Testing, product metadata, retention messaging, Asset Library, creative assets | Mostly not targeted | Useful mostly for templates/App Store readiness, not core compiler; no StoreKit validator/templates beyond broad examples |
| CloudKit / SwiftData | Stable IDs, sync, persistent stores, semantic search content | Indirect | `SyncableEntity` exists, but generated persistence strategy and stable ID proof are missing |
| Speech / AVFoundation / Now Playing / Vision | Generated subtitles, responsive camera, Now Playing, Music Understanding, Vision image understanding | Not core | Useful as domain templates and Info.plist/privacy validators |
| Metal / performance | Metal 4, command-line debugging, Core AI custom kernels, Xcode Cloud Metal support | Not core | Relevant only for Core AI/GPU entitlement/long-running background GPU validators |
| Accessibility | Custom controls, multiple assistive tech paths, Device Hub accessibility settings | Partial validators | Axint checks identifiers/hit testing, but not custom control labels/traits/actions/direct touch/VoiceOver order |
| Privacy/security | Agentic feature threat modeling, indirect prompt injection, confirmation/auth, App Attest, Trust Insights, privacy manifests | Partial Cloud Check | Need generated `PrivacyInfo.xcprivacy`, required-reason API checks, threat-model artifacts, App Attest/Trust Insights templates |
| App Store readiness | Minimum SDK requirements, App Store visual assets, product page preview, IAP submissions | Docs-level only | Add App Store readiness pack for generated app shells and distribution proof |

## Prioritized Opportunities

### P0. Concrete AppIntentsTesting Harness

What Apple introduced and why it matters:

Apple introduced AppIntentsTesting as an integration testing framework that runs intents through the same system infrastructure used by Siri, Shortcuts, Spotlight, and Widgets. Apple emphasizes that the tests run out of process from a standard XCUITest bundle, require no app-code import, and validate real system paths without UI automation.

Relevance to Axint:

This is directly aligned with Axint’s thesis: proof beats generated Swift. AppIntentsTesting is the missing runtime-proof layer for the exact surface Axint generates.

Current implementation:

- `src/apple-intelligence/appintents-testing.ts` emits imports, a suite, comments, and `#expect(true)`.
- `src/cli/appintents.ts` exposes `axint appintents test`.
- Tests only assert that strings like `AppIntentsTesting`, `Spotlight`, and `appEntityIdentifier` appear.

Gap:

The harness is a readiness checklist, not a real integration test. It does not generate `IntentDefinitions(bundleIdentifier:)`, execute intent names, inspect result dialogs/values, test entity queries, validate Spotlight indexing, or verify view annotations.

Recommended implementation:

- Add `AppIntentsTestPlan` extraction from generated Swift and/or IR.
- Generate XCTest-based UI test files using AppIntentsTesting APIs behind `#if canImport(AppIntentsTesting)`.
- Add CLI options: `--bundle-id`, `--intent`, `--entity`, `--spotlight`, `--view-annotations`, `--xctest`.
- Add a `compile` output companion when `--emit-appintents-tests` is set.
- Add Cloud Check evidence ingestion for AppIntentsTesting output.

Impact:

- User experience: very high. Users can prove Siri/Shortcuts/Spotlight behavior without manually testing every system surface.
- Performance: medium. Prevents costly system resolution bugs before release.
- Reliability: very high. Turns generated App Intent code into real integration proof.
- Maintainability: high. Codifies system testing instead of ad hoc comments.
- App Store readiness: high. Reduces Siri/App Intents regressions before review.

Concrete code direction:

```ts
export interface AppIntentsTestingHarnessInput {
  swiftSource: string;
  moduleName?: string;
  fileName?: string;
  bundleIdentifier?: string;
  mode?: "checklist" | "xctest";
}

export interface DiscoveredAppIntent {
  typeName: string;
  title?: string;
  parameters: string[];
  schema?: string;
}

export interface DiscoveredAppEntity {
  typeName: string;
  queryType?: string;
  indexed: boolean;
  syncable: boolean;
}
```

Add tests:

- `tests/apple-intelligence/appintents-testing.test.ts`: assert generated XCTest code includes bundle ID, intent execution, entity query cases, Spotlight case, and View Annotation case.
- `tests/cli/appintents.test.ts`: assert `--bundle-id` and `--mode xctest` work.

### P0. Full App Schema, Spotlight Semantic Index, and View Annotation Support

What Apple introduced and why it matters:

Apple’s WWDC26 App Intelligence and iOS guidance says App Schemas let Siri understand app content/actions using system-defined entity and intent schemas. Entity schemas contribute content to Spotlight’s semantic index. View Annotations connect on-screen content back to entities so users can refer to what they see conversationally.

Relevance to Axint:

This is the center of Axint’s market. Axint already generates App Entities and App Intents; making them first-class Siri AI and Spotlight citizens is a core differentiator.

Current implementation:

- `IRIntent`, `IREntity`, and `IRAppEnum` have `schema` and `schemaDomain`.
- Entity generation emits `@AppEntity(schema:)`, `SyncableEntity`, `IndexedEntity`, `OwnershipProvidingEntity`, `RelevantEntities`, and `IndexedEntityQuery`.
- Cloud Check has `AXCLOUD-WWDC26-*` checks for View Annotations, storage IDs, entity richness, and schema readiness.

Gap:

- View Annotations are only checked by regex; there is no view IR for `.appEntityIdentifier(...)` or `UserActivity`.
- Spotlight indexing is not generated as a runnable app lifecycle or data-store integration.
- `SyncableEntity` ID semantics are shallow; no stable/local ID modeling.
- There is no schema-domain capability registry that maps supported schema domains to required properties, intent kinds, or availability.

Recommended implementation:

- Add `IRViewAnnotation` and view modifiers for entity annotations.
- Add `IRSpotlightIndexingPlan` generated helper files for schema-backed entities.
- Add stable ID options to `IREntity`: `idStrategy: "stable" | "syncablePair" | "localOnly"` and `stableIdProperty`.
- Add schema-domain capability registry in `src/apple/capabilities.ts`.
- Make Cloud Check consume structured capability metadata instead of maintaining a parallel regex-only understanding.

Impact:

- User experience: very high. Enables natural-language Siri actions and on-screen references.
- Performance: high. Entity resolution and indexing become deliberate rather than accidental.
- Reliability: very high. Stable IDs and indexing proof prevent broken Siri continuity.
- Maintainability: high. One capability registry avoids duplicate schema knowledge.
- App Store readiness: high. Apple Intelligence integrations become provable.

Concrete code direction:

```ts
export interface IRViewAnnotation {
  nodePath?: string;
  entityName: string;
  identifierExpression: string;
  strategy: "appEntityIdentifier" | "userActivity";
}

export interface IRView {
  name: string;
  props: IRViewProp[];
  state: IRViewState[];
  body: ViewBodyNode[];
  annotations?: IRViewAnnotation[];
  modifiers?: Record<string, ViewModifier[]>;
  sourceFile: string;
}
```

### P0. Advanced App Intents as First-Class IR

What Apple introduced and why it matters:

Apple’s new App Intents features include `ValueRepresentation`, `RelevantEntities`, `EntityCollection`, `SyncableEntity`, richer native parameter types such as `Duration` and `PersonNameComponents`, `@UnionValue`, `LongRunningIntent`, `CancellableIntent`, and `ExecutionTargets`. Apple highlights `EntityCollection` for large entity sets, `SyncableEntity` for cross-device continuity, and `LongRunningIntent` for work beyond the normal 30-second limit with progress and cancellation.

Relevance to Axint:

Axint exists to encode App Intent ceremony safely for agents. These features are exactly the kind of Apple-specific detail agents miss.

Current implementation:

- Partial support exists in `src/core/types.ts`, `src/core/generator.ts`, `src/core/parser.ts`, `src/core/validator.ts`, `src/sdk/index.ts`, tests, and `examples/wwdc26-apple-intelligence.ts`.
- Current conformances include `LongRunningIntent` and `CancellableIntent`, but generated `perform()` is still a generic placeholder.
- `EntityCollection` exists as an IR type.
- `ValueRepresentation` is accepted as a raw Swift expression.

Gap:

- No `@UnionValue` surface.
- No `PersonNameComponents`, `IntentFile`, currency, measurement, contact, location/place descriptor, media, or native `Duration` parameter strategy.
- `LongRunningIntent` does not generate `performBackgroundTask`, progress updates, cancellation handler, or GPU entitlement hints.
- No `ProgressReportingIntent` conformance.
- No `ProvidesDialog`, `ShowsSnippetView`, `ReturnsValue`, confirmation, or authentication policy modeling.
- `ValueRepresentation` is a raw string escape hatch instead of typed representation options.

Recommended implementation:

- Add `defineUnionValue()` / `IRUnionValue`.
- Expand `IRPrimitiveType` or introduce `IRAppleNativeType`.
- Add intent execution config:

```ts
export interface IRIntentExecution {
  mode?: "foreground" | "background" | "longRunning";
  progress?: { totalUnitCountExpression: string; completedUnitCountExpression: string };
  cancellation?: { handlerName?: string; cleanupExpression?: string };
  authenticationPolicy?: string;
  confirmation?: { dialog: string; sensitive: boolean };
  dialog?: string;
  snippetView?: string;
}
```

- Generate different `perform()` templates based on execution config.
- Add validator rules for mismatches, such as `LongRunningIntent` without background task, sensitive verbs without confirmation/auth, or `CancellableIntent` without `onCancel`.

Impact:

- User experience: very high. Generated Siri/Shortcuts/Widgets behavior becomes richer and safer.
- Performance: high. `EntityCollection` and execution targeting prevent slow or unsafe runs.
- Reliability: very high. Background, cancellation, and process-target behavior become explicit.
- Maintainability: medium-high. Requires more IR but reduces raw Swift escape hatches.
- App Store readiness: high. Confirmation/auth and entitlements improve review posture.

### P0. Foundation Models, Evaluations, and Agentic Safety Surface

What Apple introduced and why it matters:

Foundation Models now spans on-device models, image input, Private Cloud Compute, third-party/open-source model integrations through a model abstraction layer, system Vision/Spotlight tools, Dynamic Profiles, context management, tool calling, `fm` CLI, Python SDK, and the Evaluations framework. Apple also published security guidance for agentic features, especially indirect prompt injection, data exfiltration, unintended actions, confirmations, authentication, and prompt/data boundaries.

Relevance to Axint:

Axint’s users are AI coding agents creating Apple-native apps. Foundation Models and agentic safety should become a generation/proof surface alongside App Intents, not merely a sample template.

Current implementation:

- `src/templates/index.ts` has Foundation Models, Evaluations, and Core AI templates.
- `src/cloud/check.ts` detects Foundation Models, Dynamic Profiles, Evaluations, Private Cloud Compute fallback, prompt injection, data boundaries, and Core AI deployment proof via source/evidence heuristics.
- `examples/wwdc26-apple-intelligence.ts` includes comments referencing `FoundationModels` and `LanguageModelSession`.

Gap:

- No `defineModelTool`, `defineModelSession`, `defineEvaluation`, or `defineAgenticFeature` surface.
- No generated transcript redaction/persistence policy.
- No Evaluations dataset/report artifact.
- No Private Cloud Compute availability/fallback generation.
- No generated lifecycle modifiers or profile boundaries.
- Cloud Check is ahead of the compiler and SDK.

Recommended implementation:

- Add `src/apple-intelligence/foundation-models.ts` with structured generators for:
  - model session wrapper,
  - tool definitions,
  - dynamic profile/instruction boundary,
  - transcript redaction,
  - evaluation dataset,
  - Private Cloud Compute fallback.
- Add SDK helpers: `defineModelTool`, `defineModelSession`, `defineEvaluation`.
- Add Cloud Check evidence parser for evaluation reports.
- Add templates for “safe agentic feature”, “RAG with SpotlightSearchTool”, and “image input with Vision tool”.

Impact:

- User experience: high. Users get native AI features with fewer unsafe defaults.
- Performance: medium. Availability and context checks avoid slow/failing model use.
- Reliability: very high. Evaluations convert probabilistic behavior into trackable regression proof.
- Maintainability: high. Shared templates reduce one-off AI code.
- App Store readiness: high. Security and privacy boundaries become reviewable.

### P0. Xcode 27 Plugin Packaging

What Apple introduced and why it matters:

Xcode 27 integrates coding agents directly into the editor and supports plugins containing skills, MCP servers, and Agent Client Protocol configurations. Apple positions these plugins as the way to bring external tools and agent expertise into Xcode’s native agent workflow.

Relevance to Axint:

Axint is already an MCP server for Apple-native generation. It should be installable as an Xcode 27 plugin with curated Axint skills and MCP wiring, not only as a raw `npx` command.

Current implementation:

- `extensions/xcode/README.md` documents MCP setup and a native Source Editor Extension.
- `spm-plugin/*` integrates generation/validation at build time.
- `extensions/claude-code/.claude-plugin/plugin.json` exists but is stale at version `0.3.8`.
- No Xcode 27 plugin bundle exists.

Gap:

- No `extensions/xcode/plugin` bundle with plugin manifest, Axint skills, MCP server declaration, or ACP guidance.
- No CLI command to install/export Axint skills into Xcode’s plugin location.
- Existing Source Editor Extension is useful but not the new Xcode agent plugin model.

Recommended implementation:

- Add `extensions/xcode/plugin/` with:
  - plugin manifest after verifying Apple’s final schema,
  - `skills/axint-apple-native-generation.md`,
  - `skills/axint-repair-loop.md`,
  - `skills/axint-app-intents-testing.md`,
  - MCP server config for local and remote Axint.
- Add `axint xcode plugin install/status`.
- Add tests that validate manifest version, package version, MCP command, and skill file presence.

Impact:

- User experience: very high for Xcode-native users.
- Performance: medium. Better agent context reduces misfires.
- Reliability: high. Xcode agents get Axint’s proof loop as built-in knowledge.
- Maintainability: medium. New distribution surface needs version sync.
- App Store readiness: medium-high. Better Xcode workflows shorten proof loops.

### P1. WidgetKit Modernization

What Apple introduced and why it matters:

WidgetKit guidance emphasizes glanceable, relevant, personalizable widgets; configurable widgets through App Intents; interactive buttons/toggles; dynamic styling; testing in tinted/clear modes; remote widget behavior on Mac; and support for more families, including the extra-large portrait family.

Relevance to Axint:

Axint has a widget compiler, and widgets are one of its core advertised surfaces.

Current implementation:

- `src/core/widget-generator.ts` emits `StaticConfiguration`, `TimelineProvider`, `EntryView`, `.supportedFamilies`, and a simple preview.
- `src/core/widget-validator.ts` and Swift validator catch some basic WidgetKit errors.

Gap:

- No `AppIntentConfiguration`.
- No interactive button/toggle generation with App Intent actions.
- No dynamic styling helpers such as `containerBackground(for: .widget)` and `widgetAccentedRenderingMode`.
- No app group/shared data strategy.
- No preview matrix for families/rendering modes.
- `WidgetFamily` lacks `systemExtraLargePortrait`.

Recommended implementation:

- Extend `IRWidget` with `configurationIntent`, `interactiveActions`, `styling`, `previewMatrix`, and `sharedContainer`.
- Generate `AppIntentConfiguration` when configuration exists.
- Generate buttons/toggles backed by App Intents.
- Add validator checks for missing widget backgrounds, too many config parameters, and unsupported families by target.

Impact:

- User experience: high.
- Performance: medium-high due to better timeline/reload/app group practices.
- Reliability: high for widget interactions and tinted modes.
- Maintainability: medium.
- App Store readiness: high for widget-heavy apps.

### P1. SwiftUI, Liquid Glass, Resizability, and Accessibility

What Apple introduced and why it matters:

SwiftUI apps automatically adopt the updated Liquid Glass look when built for the new releases, while custom elements may need glass effects, resizability, toolbar overflow handling, prominent tabs, document APIs, reorderable containers, lazy state initialization, and custom-control accessibility work. Xcode 27 also provides SwiftUI, accessibility, sizing, testing, and performance agent skills.

Relevance to Axint:

Axint generates SwiftUI views and full app shells. It also validates real SwiftUI code from existing projects.

Current implementation:

- `src/core/view-generator.ts` supports basic containers, text, images, buttons, lists, navigation links, raw Swift, state/props, and previews.
- `src/core/swift-validator.ts` catches several SwiftUI bugs: property-wrapper `let`, hit-testing overlays, invalid frame overloads, type erasure chains, missing explicit returns, HStack collapse, accessibility identifier propagation, etc.
- `src/mcp/view-blueprints.ts` contains richer generated raw Swift.

Gap:

- View IR does not model modern SwiftUI controls/modifiers.
- No Liquid Glass-specific modifiers or validation.
- No preview matrix for resizable iPhone/iPad/Mac, Dynamic Type, Reduce Transparency, VoiceOver, or tinted modes.
- No custom-control accessibility IR: labels, traits, values, actions, direct touch, adjustable actions, rotor order.
- No Document/reorderable container support.

Recommended implementation:

- Add `ViewModifier` factories for `glassEffect`, `containerBackground`, toolbar visibility/overflow, `Tab(role:)`, `accessibilityLabel`, `accessibilityValue`, `accessibilityHint`, `accessibilityAction`, and `accessibilityAdjustableAction`.
- Add preview generation options for device sizes and accessibility settings.
- Add validators for custom controls without accessible label/role/action and Liquid Glass contrast risks.
- Add schema compile component kinds for toolbars, tab bars, document lists, and reorderable grids.

Impact:

- User experience: high.
- Performance: medium-high.
- Reliability: medium-high.
- Maintainability: high if body generation is unified through `view-body-emitter.ts`.
- App Store readiness: high through accessibility quality.

### P1. Live Activities and Long-Running Intent Bridge

What Apple introduced and why it matters:

Apple positions `LongRunningIntent` as a way for intents to exceed the normal 30-second window, report progress, and surface progress automatically as a Live Activity. Cancellation support is part of the user experience and reliability story.

Relevance to Axint:

Axint already has a Live Activity compiler and App Intent compiler. Bridging them creates a high-value Apple-native workflow for uploads, exports, model runs, and content processing.

Current implementation:

- `IRLiveActivity`, parser, validator, generator, and Swift validator rules exist.
- Intent conformances include `LongRunningIntent` and `CancellableIntent`.

Gap:

- No generated start/update/end helper.
- No generated bridge from `LongRunningIntent` progress to ActivityKit-specific UI.
- No Info.plist and entitlement guidance for Live Activities.
- No cancellation cleanup path.
- No push token / remote update support.

Recommended implementation:

- Add `defineLongRunningIntent()` convenience or execution config on `defineIntent`.
- Add ActivityKit fragments and validator diagnostics for missing `NSSupportsLiveActivities`.
- Generate helper APIs for start/update/end and cancellation.
- Add an example that compiles both intent and live activity together.

Impact:

- User experience: high.
- Performance: high for long-running tasks.
- Reliability: high.
- Maintainability: medium.
- App Store readiness: high for background/progress-heavy features.

### P1. Privacy, Security, and App Store Readiness

What Apple introduced and why it matters:

Apple’s agentic security guidance focuses on indirect prompt injection, data exfiltration, unintended actions, confirmation, authentication, and secure prompt design. Trust Insights addresses social-engineering risk for sensitive categories. App Store requirements continue to emphasize SDK freshness, privacy manifests, required reason APIs, entitlements, and reviewable metadata.

Relevance to Axint:

Axint generates code that can touch calendars, health, messages, payments, files, photos, AI models, and background tasks. It should generate security/privacy artifacts alongside Swift.

Current implementation:

- `generateInfoPlistFragment()` and `generateEntitlementsFragment()` exist.
- Validator checks HealthKit entitlement/usage-description pairing and placeholder privacy strings.
- Cloud Check has prompt injection, data-boundary, confirmation, auth, PCC fallback, and Core AI proof checks.
- `SECURITY.md` exists.

Gap:

- No `PrivacyInfo.xcprivacy` generation.
- Entitlements are emitted as booleans only, with a comment for typed entitlements.
- No required-reason API analysis for generated or inspected Swift.
- No App Attest, Trust Insights, sensitive-action, or transaction-hardening templates.
- No formal agentic threat-model artifact.

Recommended implementation:

- Add `IRPrivacyManifest` and `generatePrivacyInfoManifest()`.
- Add `IRSecurityBoundary` for intents/model sessions.
- Add validator rules:
  - sensitive App Intent mutation without confirmation,
  - model prompt uses untrusted interpolated content,
  - missing redaction policy,
  - file/photo/calendar/health usage without privacy manifest reason.
- Add `axint privacy audit` CLI/MCP tool.

Impact:

- User experience: medium-high.
- Performance: low.
- Reliability: high.
- Maintainability: high.
- App Store readiness: very high.

### P1. Performance Proof: MetricKit, Instruments, and Xcode 27 Device Hub

What Apple introduced and why it matters:

Xcode 27 surfaces Organizer crash/hang/performance insights and Instruments top functions. MetricKit and StateReporting help correlate performance and diagnostics by app state.

Relevance to Axint:

Axint’s repair loop already consumes build/test/runtime evidence. Performance evidence should become another proof lane.

Current implementation:

- `axint run`, repair intelligence, Cloud Check, Swift typecheck, and snapshot affinity exist.
- No MetricKit or StateReporting ingestion.

Gap:

- No `mxdiagnostic` / Organizer export parsing.
- No app-state performance proof in Fix Packets.
- No generated MetricKit subscriber template.

Recommended implementation:

- Add `src/performance/metrickit.ts` parser for MetricKit payload JSON.
- Add repair classifications for hangs, launch latency, and memory pressure.
- Add template `metrickit-state-reporting`.
- Add Cloud Check evidence fields for performance diagnostics.

Impact:

- User experience: medium-high.
- Performance: very high.
- Reliability: high.
- Maintainability: medium.
- App Store readiness: medium-high.

### P1. SDK, Schema Compile, and Python Parity

What Apple introduced and why it matters:

Apple’s new surfaces are broad enough that Axint needs a single source of truth. If TypeScript, Python, JSON schema, `.axint`, MCP, templates, and docs diverge, agents will generate incomplete Apple integrations.

Relevance to Axint:

Axint explicitly supports TypeScript, Python, JSON schema mode, and preview `.axint`.

Current implementation:

- TypeScript SDK contains many WWDC26 fields.
- `src/mcp/schema-compile.ts` only supports minimal intent/view/widget/app/component fields.
- Python mirrors older surfaces and likely lags the newest WWDC26 App Intents fields.

Gap:

- JSON schema path cannot express app schemas, entities, `EntityCollection`, App Shortcuts, App Enums, Live Activities, advanced execution, widgets configs, or model/eval proof.
- Python SDK parity is incomplete for newer surfaces.
- No generated JSON Schema for all public IR types.

Recommended implementation:

- Build canonical `src/core/ir-schema.ts`.
- Generate TS types, JSON schema, docs tables, and Python dataclasses from one capability registry where feasible.
- Add parity tests using golden IR fixtures across TS, schema compile, Python, and `.axint`.

Impact:

- User experience: high.
- Performance: low.
- Reliability: high.
- Maintainability: very high.
- App Store readiness: medium.

### P2. Core AI, MLX, Metal, and Background Assets

What Apple introduced and why it matters:

Core AI is Apple’s new on-device model deployment framework with conversion, optimization, AOT compilation, specialization/cache, profiling, and Swift APIs. Background Assets can deliver large or localized model/game assets efficiently. MLX and Metal command-line tools support local model experimentation and GPU work.

Relevance to Axint:

Core AI is relevant for Axint-generated AI app features, but not for the compiler’s own Node runtime. Background Assets matter for apps shipping large model or media assets.

Current implementation:

- Templates and Cloud Check hints mention Core AI.
- No generated Core AI package or Background Assets pack.

Gap:

- No model availability guards.
- No AOT compile proof.
- No model asset manifest.
- No memory/latency evidence schema.
- No background GPU entitlement checks.

Recommended implementation:

- Add optional templates rather than core IR first:
  - `core-ai-local-inference`,
  - `core-ai-aot-model-pack`,
  - `managed-background-model-assets`,
  - `metal-tensor-custom-op`.
- Add Cloud Check proof fields: model id, compiled artifact path, target device, memory budget, latency budget, fallback.

Impact:

- User experience: medium.
- Performance: high for AI-heavy generated apps.
- Reliability: medium-high.
- Maintainability: medium.
- App Store readiness: medium.

### P2. CloudKit, SwiftData, and Stable Persistence

What Apple introduced and why it matters:

Siri cross-device continuity and semantic index quality depend on durable, stable IDs. CloudKit and SwiftData are common ways to back that durability.

Relevance to Axint:

Axint’s generated App Entities need stable identity and persistence guidance.

Current implementation:

- `SyncableEntity` is available.
- Entity query methods return empty arrays with comments.

Gap:

- No persistence-backed query implementation templates.
- No CloudKit record ID or SwiftData model generation.
- No proof that IDs survive relaunch/device sync.

Recommended implementation:

- Add `entityStore` config to `defineEntity`.
- Generate `SwiftDataEntityStore` and `CloudKitEntityStore` templates.
- Add tests proving generated queries compile and use stable ID fields.

Impact:

- User experience: high for Siri/Search.
- Performance: medium.
- Reliability: very high.
- Maintainability: medium.
- App Store readiness: medium-high.

### P2. App Store, StoreKit, and Distribution Readiness

What Apple introduced and why it matters:

App Store Connect adds Asset Library, product page header/search creative assets, product page preview, streamlined IAP submissions, and retention messaging.

Relevance to Axint:

Axint is not primarily an App Store product generator, but generated app shells and starter kits need a distribution-readiness checklist.

Current implementation:

- Axint has release docs and starter proof pages.
- No App Store metadata pack.

Gap:

- No generated `AppStoreReadiness.md`.
- No StoreKit Testing template.
- No subscription retention messaging template.
- No creative asset checklist.

Recommended implementation:

- Add `axint appstore readiness` command that emits a checklist from project capabilities.
- Add StoreKit/IAP template packages, especially for commerce apps.
- Add generated privacy/metadata review checklist into starter apps.

Impact:

- User experience: medium.
- Performance: low.
- Reliability: medium.
- Maintainability: medium.
- App Store readiness: high.

### P2. Domain Templates for Speech, AVFoundation, Now Playing, Vision, Music Understanding

What Apple introduced and why it matters:

WWDC26 includes new or updated media frameworks: generated subtitles/subtitle styling, AVFoundation camera responsiveness and high-resolution capture, Now Playing framework, Music Understanding, and Vision image understanding with Foundation Models.

Relevance to Axint:

These are not core compiler surfaces, but they are valuable Registry/template packages for agents building media apps.

Current implementation:

- Axint templates cover common App Intent domains.
- No first-party media templates for these frameworks.

Gap:

- Missing Info.plist/privacy key generation for camera, microphone, speech recognition, media library, photos.
- No Now Playing, generated subtitles, Vision+FoundationModels, or Music Understanding examples.

Recommended implementation:

- Add templates:
  - `now-playing-controls`,
  - `generated-subtitles-player`,
  - `vision-foundation-model-image-search`,
  - `music-understanding-analysis`,
  - `responsive-camera-capture`.
- Add privacy validators for related usage descriptions.

Impact:

- User experience: medium.
- Performance: framework-dependent.
- Reliability: medium.
- Maintainability: medium.
- App Store readiness: medium-high due to privacy keys.

### P2. visionOS and Spatial Preview

What Apple introduced and why it matters:

visionOS 27 adds spatial workflows, Spatial Preview, object tracking, immersive media, and richer 3D tooling. SwiftUI and WidgetKit also reach across platforms.

Relevance to Axint:

Axint has `visionOS` scene guards but does not deeply generate spatial experiences.

Current implementation:

- `CompilerOptions.target` includes `ios26`, `macos26`; scene guards include `visionOS`.
- No `visionos27`, `ios27`, `macos27`, watchOS, tvOS target matrix.

Gap:

- No target availability registry.
- No RealityKit/spatial preview templates.
- No visionOS-specific widget/app preview guidance.

Recommended implementation:

- Add target versions: `ios27`, `ipados27`, `macos27`, `visionos27`, `watchos27`, `tvos27`.
- Add `platformAvailability` metadata to every capability.
- Add `spatial-preview` and `visionos-ornament-shell` templates.

Impact:

- User experience: medium.
- Performance: medium.
- Reliability: medium.
- Maintainability: high if backed by the capability registry.
- App Store readiness: medium.

### P3. Design Assets: Icon Composer, SF Symbols, Liquid Glass Assets

What Apple introduced and why it matters:

Apple’s latest design stack includes Liquid Glass, Icon Composer, new visual asset placements, updated SF Symbols, and clear/tinted rendering modes.

Relevance to Axint:

Axint generates app shells and public proof previews; it can help agents avoid generic or inaccessible visuals.

Current implementation:

- Docs assets and starters exist.
- No icon/asset generation or validation.

Gap:

- No app icon checklist.
- No SF Symbol availability validation.
- No tinted/clear mode asset proof.

Recommended implementation:

- Add optional design-readiness checklist and asset manifest validator.
- Add generated preview matrix for icons/widgets in color, tinted, dark, light, high contrast, and Reduce Transparency.

Impact:

- User experience: medium.
- Performance: low.
- Reliability: low-medium.
- Maintainability: low-medium.
- App Store readiness: medium.

### P3. Public Truth and Distribution Hygiene

What Apple introduced and why it matters:

Xcode 27 and agent plugin ecosystems reward precise metadata. Marketplace scanners also penalize stale versions or inconsistent tool counts.

Relevance to Axint:

Axint is distributed through npm, MCP, editor integrations, Xcode docs, SPM plugins, and multiple agent configs.

Current implementation:

- `metrics.json` says 36 MCP tools, 33 templates, 216 diagnostics.
- `extensions/xcode/README.md` says 35 tools.
- `extensions/claude-desktop/manifest.json` says 26 bundled templates.
- `extensions/claude-code/.claude-plugin/plugin.json` is version `0.3.8`.

Gap:

- Public truth is partly stale on this branch.
- This is not an Apple API feature gap, but it affects Xcode/plugin/App Store-like trust.

Recommended implementation:

- Extend `scripts/check-release-parity.mjs` or `scripts/check-readme-mcp-docs.mjs` to cover every extension manifest and README.
- Generate extension metadata from `metrics.json` and `package.json`.

Impact:

- User experience: medium.
- Performance: none.
- Reliability: medium.
- Maintainability: high.
- App Store readiness: medium as a trust signal.

## Recommended Roadmap

### Phase 1: Proof and Siri Readiness

1. Concrete AppIntentsTesting harness.
2. Capability registry for Apple schemas/features/availability.
3. View Annotation and Spotlight indexing generation.
4. Advanced App Intent execution config: confirmation/auth/dialog/progress/cancel.

Exit criteria:

- `axint compile` can emit Swift, plist, entitlements, privacy manifest, and AppIntentsTesting harness for a schema-backed intent/entity.
- Cloud Check consumes test output and raises confidence from static readiness to runtime proof.

### Phase 2: Widget, Live Activity, SwiftUI Modernization

1. WidgetKit `AppIntentConfiguration`, interactivity, dynamic styling, new families.
2. Live Activity + long-running intent bridge.
3. SwiftUI accessibility/resizability/Liquid Glass modifiers and validators.

Exit criteria:

- Axint can generate a configurable interactive widget that passes static validation and has preview/testing guidance.
- Axint can generate a long-running upload/export intent with progress and cancellation.

### Phase 3: Foundation Models and Agentic Safety

1. Model session/tool/evaluation SDK.
2. Transcript redaction and prompt-injection safety.
3. Private Cloud Compute fallback and model availability proof.
4. Core AI optional templates.

Exit criteria:

- Axint can generate a Foundation Models feature with tool calls, an evaluation dataset, a redaction policy, and Cloud Check proof.

### Phase 4: Xcode 27 Distribution and Platform Breadth

1. Xcode 27 plugin bundle.
2. Python/schema/.axint parity.
3. App Store readiness packs.
4. Domain templates for AVFoundation, Speech/subtitles, Now Playing, Vision, CloudKit/SwiftData.

Exit criteria:

- Xcode users can install Axint as a plugin with skills and MCP.
- Every public authoring path can express the same Apple capability subset.

## Detailed Implementation Plan

The task-by-task plan is saved separately at:

- `docs/superpowers/plans/2026-07-07-wwdc26-apple-roadmap.md`

## Residual Risks

- Some Apple APIs are beta-era as of July 7, 2026. Names and signatures may change before final OS/Xcode releases. Axint should isolate all new API names in a capability registry and annotate beta availability.
- AppIntentsTesting exact API calls should be verified against the installed Xcode 27 SDK before final code generation. The current branch does not include SDK symbol tests.
- The working tree had many pre-existing modifications before this audit. The report avoids changing production files to keep those changes safe.
