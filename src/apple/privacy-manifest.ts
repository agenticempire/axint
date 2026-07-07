export const BACKGROUND_INFERENCE_ENTITLEMENT =
  "com.apple.developer.background-tasks.continued-processing.inference";

export interface PrivacyAccessedApiType {
  category: string;
  reasons: string[];
}

export interface PrivacyManifestConfig {
  tracking: boolean;
  trackingDomains: string[];
  collectedDataTypes: Array<Record<string, unknown>>;
  accessedApiTypes: PrivacyAccessedApiType[];
}

export function privacyManifestForAgenticFeature(
  overrides: Partial<PrivacyManifestConfig> = {}
): PrivacyManifestConfig {
  return {
    tracking: false,
    trackingDomains: [],
    collectedDataTypes: [],
    accessedApiTypes: [],
    ...overrides,
  };
}

export function generatePrivacyManifest(config: PrivacyManifestConfig): string {
  const manifest = {
    NSPrivacyTracking: config.tracking,
    NSPrivacyTrackingDomains: config.trackingDomains,
    NSPrivacyCollectedDataTypes: config.collectedDataTypes,
    NSPrivacyAccessedAPITypes: config.accessedApiTypes.map((api) => ({
      NSPrivacyAccessedAPIType: api.category,
      NSPrivacyAccessedAPITypeReasons: api.reasons,
    })),
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function backgroundInferenceEntitlementFragment(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `    <key>${BACKGROUND_INFERENCE_ENTITLEMENT}</key>`,
    `    <true/>`,
    `</dict>`,
    `</plist>`,
    ``,
  ].join("\n");
}
