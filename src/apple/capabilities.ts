export type AppleTarget =
  | "ios16"
  | "ios17"
  | "ios18"
  | "ios26"
  | "ios27"
  | "ipados16"
  | "ipados17"
  | "ipados18"
  | "ipados26"
  | "ipados27"
  | "macos13"
  | "macos14"
  | "macos15"
  | "macos26"
  | "macos27"
  | "watchos9"
  | "watchos10"
  | "watchos11"
  | "watchos26"
  | "watchos27"
  | "visionos1"
  | "visionos2"
  | "visionos26"
  | "visionos27";

export type AppleCapabilityId =
  | "appintents.appSchemas"
  | "appintents.entityCollection"
  | "appintents.indexedEntity"
  | "appintents.intentValueRepresentation"
  | "appintents.longRunning"
  | "appintents.relevantEntities"
  | "appintents.syncableEntity"
  | "appintents.unionValue"
  | "appintents.viewAnnotations"
  | "appintentstesting.framework"
  | "appstoreconnect.accessibilityLabels"
  | "appstoreconnect.versionedCommerceMetadata"
  | "backgroundassets.framework"
  | "backgroundtasks.continuedProcessingInference"
  | "coreai.framework"
  | "foundationmodels.dynamicProfiles"
  | "foundationmodels.evaluations"
  | "foundationmodels.privateCloudCompute"
  | "metrickit.metricManager"
  | "swiftui.liquidGlass"
  | "swiftui.document"
  | "swiftui.stateMacro"
  | "widgetkit.systemExtraLargePortrait"
  | "xcode.agentPlugins";

export interface AppleCapability {
  id: AppleCapabilityId;
  framework: string;
  introduced: Partial<Record<AppleTarget, true>>;
  summary: string;
  volatile?: boolean;
}

export const APPLE_TARGETS: readonly AppleTarget[] = [
  "ios16",
  "ios17",
  "ios18",
  "ios26",
  "ios27",
  "ipados16",
  "ipados17",
  "ipados18",
  "ipados26",
  "ipados27",
  "macos13",
  "macos14",
  "macos15",
  "macos26",
  "macos27",
  "watchos9",
  "watchos10",
  "watchos11",
  "watchos26",
  "watchos27",
  "visionos1",
  "visionos2",
  "visionos26",
  "visionos27",
] as const;

const ALL_27_TARGETS: Partial<Record<AppleTarget, true>> = {
  ios27: true,
  ipados27: true,
  macos27: true,
  watchos27: true,
  visionos27: true,
};

const IOS_MAC_27_TARGETS: Partial<Record<AppleTarget, true>> = {
  ios27: true,
  ipados27: true,
  macos27: true,
};

export const APPLE_CAPABILITIES: readonly AppleCapability[] = [
  {
    id: "appintents.appSchemas",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "System-defined app schemas for Siri, Shortcuts, and Apple Intelligence.",
  },
  {
    id: "appintents.entityCollection",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Large entity-set parameter transport through EntityCollection.",
  },
  {
    id: "appintents.indexedEntity",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Spotlight semantic index integration for AppEntity types.",
  },
  {
    id: "appintents.intentValueRepresentation",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Transferable representations for App Intent entity values.",
  },
  {
    id: "appintents.longRunning",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Long-running and cancellable intent execution.",
  },
  {
    id: "appintents.relevantEntities",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Contextual RelevantEntities suggestions.",
  },
  {
    id: "appintents.syncableEntity",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Cross-device identity continuity for entities.",
  },
  {
    id: "appintents.unionValue",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Heterogeneous App Intents parameter values via @UnionValue.",
    volatile: true,
  },
  {
    id: "appintents.viewAnnotations",
    framework: "AppIntents",
    introduced: IOS_MAC_27_TARGETS,
    summary: "On-screen entity annotations for Siri and Apple Intelligence.",
  },
  {
    id: "appintentstesting.framework",
    framework: "AppIntentsTesting",
    introduced: IOS_MAC_27_TARGETS,
    summary: "Out-of-process App Intents integration testing.",
  },
  {
    id: "appstoreconnect.accessibilityLabels",
    framework: "AppStoreConnect",
    introduced: ALL_27_TARGETS,
    summary: "Per-device accessibility declarations backed by common-task evidence.",
  },
  {
    id: "appstoreconnect.versionedCommerceMetadata",
    framework: "AppStoreConnectAPI",
    introduced: ALL_27_TARGETS,
    summary:
      "Version-scoped in-app purchase, subscription, and subscription-group metadata.",
  },
  {
    id: "backgroundassets.framework",
    framework: "BackgroundAssets",
    introduced: ALL_27_TARGETS,
    summary: "Background asset downloads replacing On Demand Resources.",
  },
  {
    id: "backgroundtasks.continuedProcessingInference",
    framework: "BackgroundTasks",
    introduced: { ios27: true, ipados27: true },
    summary: "Background Neural Engine inference entitlement for continued processing.",
    volatile: true,
  },
  {
    id: "coreai.framework",
    framework: "CoreAI",
    introduced: ALL_27_TARGETS,
    summary: "On-device model deployment, specialization, and runtime inference.",
    volatile: true,
  },
  {
    id: "foundationmodels.dynamicProfiles",
    framework: "FoundationModels",
    introduced: ALL_27_TARGETS,
    summary: "Dynamic profile instructions and lifecycle modifiers for agentic apps.",
    volatile: true,
  },
  {
    id: "foundationmodels.evaluations",
    framework: "Evaluations",
    introduced: ALL_27_TARGETS,
    summary: "Evaluation suites for model quality and safety proof.",
    volatile: true,
  },
  {
    id: "foundationmodels.privateCloudCompute",
    framework: "FoundationModels",
    introduced: ALL_27_TARGETS,
    summary: "Private Cloud Compute fallback for Foundation Models workloads.",
    volatile: true,
  },
  {
    id: "metrickit.metricManager",
    framework: "MetricKit",
    introduced: ALL_27_TARGETS,
    summary: "Swift-first MetricManager reports and diagnostics.",
  },
  {
    id: "swiftui.liquidGlass",
    framework: "SwiftUI",
    introduced: ALL_27_TARGETS,
    summary: "Liquid Glass, toolbar, document, and resizability-era SwiftUI APIs.",
  },
  {
    id: "swiftui.document",
    framework: "SwiftUI",
    introduced: ALL_27_TARGETS,
    summary:
      "ReadableDocument, WritableDocument, and Document with asynchronous URL-based I/O.",
  },
  {
    id: "swiftui.stateMacro",
    framework: "SwiftUI",
    introduced: ALL_27_TARGETS,
    summary: "Macro-based @State initialization with stable expression evaluation.",
    volatile: true,
  },
  {
    id: "widgetkit.systemExtraLargePortrait",
    framework: "WidgetKit",
    introduced: IOS_MAC_27_TARGETS,
    summary: "New portrait extra-large widget family.",
  },
  {
    id: "xcode.agentPlugins",
    framework: "Xcode",
    introduced: { macos27: true },
    summary: "Xcode 27 agent plugins, skills, MCP, and ACP integration.",
  },
];

const CAPABILITIES_BY_ID = new Map(
  APPLE_CAPABILITIES.map((capability) => [capability.id, capability])
);

const TARGETS = new Set<string>(APPLE_TARGETS);

export function isAppleTarget(value: string): value is AppleTarget {
  return TARGETS.has(value);
}

export function getAppleCapability(
  id: AppleCapabilityId | string
): AppleCapability | undefined {
  return CAPABILITIES_BY_ID.get(id as AppleCapabilityId);
}

export function supportsAppleCapability(
  target: AppleTarget | string,
  capabilityId: AppleCapabilityId | string
): boolean {
  const capability = getAppleCapability(capabilityId);
  if (!capability || !isAppleTarget(target)) return false;
  return capability.introduced[target] === true;
}
