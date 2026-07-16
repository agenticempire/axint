export type IOS27Beta3RuleSeverity = "error" | "warning" | "info";
export type IOS27Beta3RuleStatus = "active" | "resolved" | "new-feature" | "deprecation";

export interface IOS27Beta3Rule {
  id: string;
  framework: string;
  severity: IOS27Beta3RuleSeverity;
  status: IOS27Beta3RuleStatus;
  summary: string;
  workaround?: string;
  source: "iOS & iPadOS 27 Beta 3 Release Notes";
}

export const IOS27_BETA3_RULES: readonly IOS27Beta3Rule[] = [
  {
    id: "appintents.schema.calendar.deleteEvents-renamed",
    framework: "AppIntents",
    severity: "warning",
    status: "deprecation",
    summary: "calendar.deleteEvents was renamed to calendar.deleteEvent.",
    workaround: "Rename schema references to calendar.deleteEvent.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.schema.notes-name-attributedstring",
    framework: "AppIntents",
    severity: "info",
    status: "new-feature",
    summary:
      "notes.createNote and notes.updateNote now accept name parameters typed as AttributedString.",
    workaround:
      "Generate the schema-backed name parameter as AttributedString instead of String when requested.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.parameter.set-default",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "Schema defaults might not apply for Set parameters unless an explicit @Parameter default is present.",
    workaround: "Emit an explicit default value such as an empty set.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.entitydisplay.siri-symbol-fallback",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary: "Non-SF Symbol custom images for app entities might not appear in Siri.",
    workaround: "Prefer SF Symbols or provide a Siri-safe fallback symbol.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.entitystringquery.siri-resolution",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "Siri might not resolve some entity types when only EntityStringQuery is provided.",
    workaround:
      "Index the entity in Spotlight or provide an IntentValueQuery when it is Siri-facing.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.unionvalue.duplicate-number-cases",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "Shortcuts can show duplicate number options when a UnionValue includes multiple number-related cases.",
    workaround: "Use one number-related case, such as Int or Double, but not both.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.unionvalue.place-string-resolution",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "Siri may pass String values for UnionValue cases that accept PlaceDescriptorEntity and String.",
    workaround:
      "Include a String case and manually convert the String to PlaceDescriptorEntity when needed.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.unionvalue.widget-configuration",
    framework: "WidgetKit",
    severity: "warning",
    status: "active",
    summary:
      "@UnionValue in WidgetConfigurationIntent can prevent widget timelines from rendering.",
    workaround:
      "Use one AppEntity with a kind discriminator instead of a UnionValue property.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.intentvaluerepresentation.phasset-import",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "Transferable IntentValueRepresentation for PHAsset can require import _Photos_AppIntents.",
    workaround: "Emit import _Photos_AppIntents when PHAsset transfer code is generated.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.siri.drag-resource-loading",
    framework: "UIKit",
    severity: "warning",
    status: "active",
    summary:
      "Siri can load resources from drag interactions when Apple Intelligence is invoked from context menus.",
    workaround:
      "Avoid animations and modal UI in dragInteraction(_:sessionWillBegin:); do them in sessionDidMove instead.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "coreai.background-neural-engine-entitlement",
    framework: "CoreAI",
    severity: "warning",
    status: "active",
    summary:
      "Background Neural Engine access requires the continued-processing inference entitlement.",
    workaround:
      "Add com.apple.developer.background-tasks.continued-processing.inference for background inference.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "foundationmodels.pcc-simulator",
    framework: "FoundationModels",
    severity: "info",
    status: "resolved",
    summary: "Beta 3 fixed Private Cloud Compute support in simulators.",
    workaround:
      "Remove physical-device-only workarounds that were added solely for the earlier simulator issue, then verify both simulator and device paths.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "foundationmodels.tool-overcalling",
    framework: "FoundationModels",
    severity: "warning",
    status: "active",
    summary:
      "On-device Foundation Models can call tools excessively when tool calling and guided generation are combined.",
    workaround:
      "Constrain instructions, improve attachment labels, and add evaluations for tool-call count.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "foundationmodels.pcc-greedy-decoding",
    framework: "FoundationModels",
    severity: "warning",
    status: "active",
    summary: "PrivateCloudComputeLanguageModel always uses greedy decoding.",
    workaround:
      "Pass GenerationOptions(samplingMode: .randomThreshold(0.95, seed: 42)) or another explicit seeded sampling mode.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.relevantentities.workout-audio",
    framework: "AppIntents",
    severity: "warning",
    status: "active",
    summary:
      "RelevantEntities registered for the workout audio context might not appear in the Fitness media picker.",
    workaround:
      "Keep the registration path, add a direct in-app fallback picker, and avoid treating Fitness suggestions as completion proof.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "shortcuts.duration-linkmetadata-describe-change",
    framework: "Shortcuts",
    severity: "warning",
    status: "active",
    summary:
      "Describe a change might discard shortcuts whose app intent uses Duration or LPLinkMetadata.",
    workaround:
      "Tell users to press Undo when the model discards the action, and include this flow in shortcut editing tests.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "shortcuts.use-model-on-device-output",
    framework: "Shortcuts",
    severity: "warning",
    status: "active",
    summary:
      "The Use Model action might fail with the On-Device option for some output types.",
    workaround:
      "Offer a compatible output type or the Cloud option and test every output shape the app documents.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "siri.maps-custom-values",
    framework: "Siri",
    severity: "warning",
    status: "active",
    summary:
      "Siri ignores custom navigation preference, transport, and incident values for maps.startNavigation and maps.reportIncident.",
    workaround:
      "Prefer supported schema values and verify custom-value requests with Siri before promising the behavior.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "siri.callkit-phone-start-call",
    framework: "Siri",
    severity: "warning",
    status: "active",
    summary:
      "Starting a call with Siri might fail in apps that use CallKit and the phone.startCall schema.",
    workaround:
      "Keep a direct CallKit fallback and add Siri call-start integration proof on OS 27.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "siri.openintent-ambiguity",
    framework: "Siri",
    severity: "warning",
    status: "active",
    summary:
      "Siri might choose the wrong OpenIntent or system.open intent when multiple entity targets are available.",
    workaround:
      "Make target types, phrases, and entity resolution distinct, then test ambiguous utterances explicitly.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.state-macro-initialization",
    framework: "SwiftUI",
    severity: "warning",
    status: "new-feature",
    summary:
      "The macro-based @State implementation avoids repeated initial-value evaluation and tightens initializer behavior.",
    workaround:
      "When init assigns a state property, omit the declaration-site initial value and assign the property explicitly.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.state-macro-synthesized-init",
    framework: "SwiftUI",
    severity: "warning",
    status: "new-feature",
    summary:
      "The @State macro can disable private synthesized memberwise initializers and require more explicit generic types.",
    workaround:
      "Assign stored members explicitly in custom initializers and spell out generic state types when inference fails.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.tabview-visible-selection",
    framework: "SwiftUI",
    severity: "error",
    status: "active",
    summary:
      "TabView can crash when its selection points to a hidden or unavailable tab.",
    workaround:
      "Reconcile selection before hiding/removing a tab and keep a visible fallback selection.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.document-protocol-migration",
    framework: "SwiftUI",
    severity: "warning",
    status: "deprecation",
    summary:
      "FileDocument and ReferenceFileDocument are deprecated in favor of ReadableDocument, WritableDocument, and Document.",
    workaround:
      "Adopt ReadableDocument for read-only files or Document for read/write documents.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.document-concurrency",
    framework: "SwiftUI",
    severity: "warning",
    status: "new-feature",
    summary:
      "Document readers and writers use @concurrent, while DocumentGroup factories and URLDocumentConfiguration are main-actor isolated.",
    workaround:
      "Replace nonisolated document methods with @concurrent and keep document factory/configuration access on MainActor.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.menu-image-visibility",
    framework: "SwiftUI",
    severity: "info",
    status: "new-feature",
    summary:
      "SwiftUI hides most menu item symbol images by default on iPadOS and macOS 27.",
    workaround:
      "Use labelStyle(.titleAndIcon) only for object/concept icons that should remain visible.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.text-selection-gesture",
    framework: "SwiftUI",
    severity: "warning",
    status: "new-feature",
    summary:
      "Selectable Text gains system selection gestures that can compete with custom gestures.",
    workaround:
      "Use highPriorityGesture for custom gestures that must supersede text selection.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.toolbar-minimization-rename",
    framework: "SwiftUI",
    severity: "warning",
    status: "deprecation",
    summary: "toolbarMinimizationBehavior replaces toolbarMinimizeBehavior.",
    workaround: "Rename the modifier to toolbarMinimizationBehavior.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "swiftui.textfield-style-migration",
    framework: "SwiftUI",
    severity: "info",
    status: "deprecation",
    summary:
      "squareBorder and roundedBorder text field styles are soft deprecated in favor of bordered.",
    workaround: "Use .textFieldStyle(.bordered) and textInputBorderShape when needed.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.menu-image-visibility",
    framework: "UIKit",
    severity: "info",
    status: "new-feature",
    summary: "UIKit hides most menu element images by default on iPadOS and macOS 27.",
    workaround:
      "Set preferredImageVisibility only where the Human Interface Guidelines call for a visible image.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.external-display-scene-accessory",
    framework: "UIKit",
    severity: "warning",
    status: "new-feature",
    summary:
      "windowExternalDisplayNonInteractive scenes are no longer offered automatically.",
    workaround:
      "Register a UISceneAccessory.externalNonInteractive scene accessory explicitly.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.navigation-bar-minimization",
    framework: "UIKit",
    severity: "warning",
    status: "deprecation",
    summary:
      "UINavigationItem.navigationBarMinimization replaces barMinimizeBehavior and barMinimizationSafeAreaAdjustment.",
    workaround:
      "Migrate navigation bar minimization configuration to navigationBarMinimization.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "backgroundassets.ondemandresources-deprecation",
    framework: "BackgroundAssets",
    severity: "warning",
    status: "deprecation",
    summary: "On Demand Resources and NSBundleResourceRequest are deprecated.",
    workaround: "Move downloadable asset workflows to Background Assets.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "coreai.converter-minimum-version",
    framework: "CoreAI",
    severity: "warning",
    status: "active",
    summary:
      "On-device specialization can fail for .aimodel files converted with coreai-torch 0.4.0.",
    workaround: "Convert models with coreai-torch 0.4.1 or newer.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "coreai.aot-recompile-beta3",
    framework: "CoreAI",
    severity: "warning",
    status: "active",
    summary:
      "On-device specialization can fail for .aimodelc files compiled with Xcode 27 beta 2 or earlier.",
    workaround: "Recompile the source .aimodel with Xcode 27 beta 3.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "coreai.aot-compilation",
    framework: "CoreAI",
    severity: "warning",
    status: "active",
    summary: "Ahead-of-time compilation can fail unexpectedly for some models.",
    workaround:
      "Retain the source model, record the toolchain used, and keep a specialization fallback path.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "coreai.app-group-cache",
    framework: "CoreAI",
    severity: "warning",
    status: "active",
    summary: "App-group cache support might fail for some model types.",
    workaround: "Specialize under the default cache when the app-group cache fails.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.launch-screen-required",
    framework: "UIKit",
    severity: "error",
    status: "active",
    summary: "iOS and iPadOS apps built with the 27 SDK must include a launch screen.",
    workaround:
      "Add UILaunchStoryboardName, UILaunchStoryboards, UILaunchScreen, or UILaunchScreens.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.scene-lifecycle-required",
    framework: "UIKit",
    severity: "error",
    status: "active",
    summary: "Apps built with the latest SDK must adopt the scene-based lifecycle.",
    workaround: "Generate UIScene/SwiftUI App lifecycle configuration.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "metrickit.metricmanager-preferred",
    framework: "MetricKit",
    severity: "info",
    status: "new-feature",
    summary:
      "MetricManager, MetricReport, and DiagnosticReport are preferred over original MXMetricManager APIs.",
    workaround: "Generate MetricManager-based proof snippets for OS 27 targets.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
];

const RULES_BY_ID = new Map(IOS27_BETA3_RULES.map((rule) => [rule.id, rule]));

const SCHEMA_RENAMES = new Map([
  [".calendar.deleteEvents", ".calendar.deleteEvent"],
  ["calendar.deleteEvents", "calendar.deleteEvent"],
  ["AppSchema.Calendar.deleteEvents", "AppSchema.Calendar.deleteEvent"],
  ["AppSchema.CalendarIntent.deleteEvents", "AppSchema.CalendarIntent.deleteEvent"],
]);

export function findIOS27Beta3Rule(id: string): IOS27Beta3Rule | undefined {
  return RULES_BY_ID.get(id);
}

export function activeIOS27Beta3Rules(): readonly IOS27Beta3Rule[] {
  return IOS27_BETA3_RULES.filter((rule) => rule.status === "active");
}

export function normalizeIOS27Beta3Schema(schema: string): string {
  return SCHEMA_RENAMES.get(schema) ?? schema;
}

export function isDeprecatedIOS27Beta3Schema(schema: string): boolean {
  return normalizeIOS27Beta3Schema(schema) !== schema;
}
