export type IOS27Beta3RuleSeverity = "error" | "warning" | "info";

export interface IOS27Beta3Rule {
  id: string;
  framework: string;
  severity: IOS27Beta3RuleSeverity;
  summary: string;
  workaround?: string;
  source: "iOS & iPadOS 27 Beta 3 Release Notes";
}

export const IOS27_BETA3_RULES: readonly IOS27Beta3Rule[] = [
  {
    id: "appintents.schema.calendar.deleteEvents-renamed",
    framework: "AppIntents",
    severity: "warning",
    summary: "calendar.deleteEvents was renamed to calendar.deleteEvent.",
    workaround: "Rename schema references to calendar.deleteEvent.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.schema.notes-name-attributedstring",
    framework: "AppIntents",
    severity: "info",
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
    summary:
      "Schema defaults might not apply for Set parameters unless an explicit @Parameter default is present.",
    workaround: "Emit an explicit default value such as an empty set.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.entitydisplay.siri-symbol-fallback",
    framework: "AppIntents",
    severity: "warning",
    summary: "Non-SF Symbol custom images for app entities might not appear in Siri.",
    workaround: "Prefer SF Symbols or provide a Siri-safe fallback symbol.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.entitystringquery.siri-resolution",
    framework: "AppIntents",
    severity: "warning",
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
    summary:
      "Shortcuts can show duplicate number options when a UnionValue includes multiple number-related cases.",
    workaround: "Use one number-related case, such as Int or Double, but not both.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "appintents.unionvalue.place-string-resolution",
    framework: "AppIntents",
    severity: "warning",
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
    summary:
      "Transferable IntentValueRepresentation for PHAsset can require import _Photos_AppIntents.",
    workaround: "Emit import _Photos_AppIntents when PHAsset transfer code is generated.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.siri.drag-resource-loading",
    framework: "UIKit",
    severity: "warning",
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
    summary:
      "Background Neural Engine access requires the continued-processing inference entitlement.",
    workaround:
      "Add com.apple.developer.background-tasks.continued-processing.inference for background inference.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "foundationmodels.pcc-simulator",
    framework: "FoundationModels",
    severity: "warning",
    summary: "Private Cloud Compute might not work in simulators.",
    workaround: "Verify PCC paths on a physical OS 27 device.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "foundationmodels.tool-overcalling",
    framework: "FoundationModels",
    severity: "warning",
    summary:
      "On-device Foundation Models can call tools excessively when tool calling and guided generation are combined.",
    workaround:
      "Constrain instructions, improve attachment labels, and add evaluations for tool-call count.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.launch-screen-required",
    framework: "UIKit",
    severity: "error",
    summary: "iOS and iPadOS apps built with the 27 SDK must include a launch screen.",
    workaround:
      "Add UILaunchStoryboardName, UILaunchStoryboards, UILaunchScreen, or UILaunchScreens.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "uikit.scene-lifecycle-required",
    framework: "UIKit",
    severity: "error",
    summary: "Apps built with the latest SDK must adopt the scene-based lifecycle.",
    workaround: "Generate UIScene/SwiftUI App lifecycle configuration.",
    source: "iOS & iPadOS 27 Beta 3 Release Notes",
  },
  {
    id: "metrickit.metricmanager-preferred",
    framework: "MetricKit",
    severity: "info",
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

export function normalizeIOS27Beta3Schema(schema: string): string {
  return SCHEMA_RENAMES.get(schema) ?? schema;
}

export function isDeprecatedIOS27Beta3Schema(schema: string): boolean {
  return normalizeIOS27Beta3Schema(schema) !== schema;
}
