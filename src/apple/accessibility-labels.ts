export const ACCESSIBILITY_LABEL_FEATURES = [
  "voiceOver",
  "voiceControl",
  "largerText",
  "darkInterface",
  "differentiateWithoutColor",
  "sufficientContrast",
  "reducedMotion",
  "captions",
  "audioDescriptions",
] as const;

export type AccessibilityLabelFeature = (typeof ACCESSIBILITY_LABEL_FEATURES)[number];
export type AccessibilityDevice = "iphone" | "ipad" | "mac" | "vision";
export type AccessibilityEvidenceStatus = "pass" | "fail" | "not-applicable";

export interface AccessibilityCommonTask {
  id: string;
  title: string;
  devices?: readonly AccessibilityDevice[];
}

export interface AccessibilityTaskEvidence {
  taskId: string;
  device: AccessibilityDevice;
  feature: AccessibilityLabelFeature;
  status: AccessibilityEvidenceStatus;
  artifact?: string;
  notes?: string;
}

export interface AccessibilityFeatureAssessment {
  device: AccessibilityDevice;
  feature: AccessibilityLabelFeature;
  claimable: boolean;
  passedTasks: string[];
  failedTasks: string[];
  missingTasks: string[];
  notApplicableTasks: string[];
}

export interface AccessibilityNutritionAssessment {
  generatedAt: string;
  commonTasks: AccessibilityCommonTask[];
  evidence: AccessibilityTaskEvidence[];
  features: AccessibilityFeatureAssessment[];
  claimable: Array<{
    device: AccessibilityDevice;
    features: AccessibilityLabelFeature[];
  }>;
}

const DEVICE_FEATURES: Record<AccessibilityDevice, readonly AccessibilityLabelFeature[]> =
  {
    iphone: ACCESSIBILITY_LABEL_FEATURES,
    ipad: ACCESSIBILITY_LABEL_FEATURES,
    mac: ACCESSIBILITY_LABEL_FEATURES.filter((feature) => feature !== "largerText"),
    vision: ACCESSIBILITY_LABEL_FEATURES,
  };

export function evaluateAccessibilityNutritionLabels(input: {
  commonTasks: AccessibilityCommonTask[];
  evidence: AccessibilityTaskEvidence[];
  devices?: AccessibilityDevice[];
}): AccessibilityNutritionAssessment {
  const commonTasks = uniqueTasks(input.commonTasks);
  const evidence = dedupeEvidence(input.evidence);
  const devices = input.devices ?? ["iphone", "ipad", "mac", "vision"];
  const features: AccessibilityFeatureAssessment[] = [];

  for (const device of devices) {
    for (const feature of DEVICE_FEATURES[device]) {
      const applicableTasks = commonTasks.filter(
        (task) => !task.devices || task.devices.includes(device)
      );
      const passedTasks: string[] = [];
      const failedTasks: string[] = [];
      const missingTasks: string[] = [];
      const notApplicableTasks: string[] = [];

      for (const task of applicableTasks) {
        const result = evidence.find(
          (item) =>
            item.taskId === task.id && item.device === device && item.feature === feature
        );
        if (!result) {
          missingTasks.push(task.id);
        } else if (result.status === "pass") {
          passedTasks.push(task.id);
        } else if (result.status === "fail") {
          failedTasks.push(task.id);
        } else {
          notApplicableTasks.push(task.id);
        }
      }

      features.push({
        device,
        feature,
        claimable:
          applicableTasks.length > 0 &&
          failedTasks.length === 0 &&
          missingTasks.length === 0 &&
          passedTasks.length + notApplicableTasks.length === applicableTasks.length,
        passedTasks,
        failedTasks,
        missingTasks,
        notApplicableTasks,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    commonTasks,
    evidence,
    features,
    claimable: devices.map((device) => ({
      device,
      features: features
        .filter((assessment) => assessment.device === device && assessment.claimable)
        .map((assessment) => assessment.feature),
    })),
  };
}

export function renderAccessibilityNutritionLabelReport(
  assessment: AccessibilityNutritionAssessment
): string {
  const lines = [
    "# Accessibility Nutrition Label Evidence",
    "",
    `Generated: ${assessment.generatedAt}`,
    "",
    "A feature is claimable only when every applicable common task has passing or explicitly not-applicable evidence.",
    "",
  ];

  for (const device of assessment.claimable) {
    lines.push(`## ${deviceTitle(device.device)}`, "");
    if (device.features.length === 0) {
      lines.push("No accessibility feature is ready to claim yet.", "");
    } else {
      lines.push(`Claimable: ${device.features.map(featureTitle).join(", ")}`, "");
    }

    for (const feature of assessment.features.filter(
      (item) => item.device === device.device
    )) {
      const status = feature.claimable ? "claimable" : "not ready";
      lines.push(`- ${featureTitle(feature.feature)}: ${status}`);
      if (feature.failedTasks.length > 0) {
        lines.push(`  Failed tasks: ${feature.failedTasks.join(", ")}`);
      }
      if (feature.missingTasks.length > 0) {
        lines.push(`  Missing evidence: ${feature.missingTasks.join(", ")}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function uniqueTasks(tasks: AccessibilityCommonTask[]): AccessibilityCommonTask[] {
  const byId = new Map<string, AccessibilityCommonTask>();
  for (const task of tasks) {
    const id = task.id.trim();
    if (!id) throw new Error("Accessibility common tasks require a non-empty id.");
    if (byId.has(id)) throw new Error(`Duplicate accessibility task id: ${id}`);
    byId.set(id, { ...task, id });
  }
  return [...byId.values()];
}

function dedupeEvidence(
  evidence: AccessibilityTaskEvidence[]
): AccessibilityTaskEvidence[] {
  const byKey = new Map<string, AccessibilityTaskEvidence>();
  for (const item of evidence) {
    const key = `${item.taskId}:${item.device}:${item.feature}`;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function deviceTitle(device: AccessibilityDevice): string {
  return {
    iphone: "iPhone",
    ipad: "iPad",
    mac: "Mac",
    vision: "Apple Vision",
  }[device];
}

function featureTitle(feature: AccessibilityLabelFeature): string {
  return {
    voiceOver: "VoiceOver",
    voiceControl: "Voice Control",
    largerText: "Larger Text",
    darkInterface: "Dark Interface",
    differentiateWithoutColor: "Differentiate Without Color Alone",
    sufficientContrast: "Sufficient Contrast",
    reducedMotion: "Reduced Motion",
    captions: "Captions",
    audioDescriptions: "Audio Descriptions",
  }[feature];
}
