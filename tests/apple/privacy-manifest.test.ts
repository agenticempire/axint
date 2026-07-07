import { describe, expect, it } from "vitest";
import {
  BACKGROUND_INFERENCE_ENTITLEMENT,
  generatePrivacyManifest,
  privacyManifestForAgenticFeature,
} from "../../src/apple/privacy-manifest.js";

describe("Apple privacy manifest helpers", () => {
  it("generates PrivacyInfo.xcprivacy JSON with required reason APIs", () => {
    const manifest = generatePrivacyManifest(
      privacyManifestForAgenticFeature({
        tracking: false,
        accessedApiTypes: [
          {
            category: "NSPrivacyAccessedAPICategoryFileTimestamp",
            reasons: ["C617.1"],
          },
        ],
      })
    );

    expect(manifest).toContain("NSPrivacyTracking");
    expect(manifest).toContain("NSPrivacyAccessedAPITypes");
    expect(manifest).toContain("C617.1");
  });

  it("exports the iOS 27 Beta 3 background inference entitlement", () => {
    expect(BACKGROUND_INFERENCE_ENTITLEMENT).toBe(
      "com.apple.developer.background-tasks.continued-processing.inference"
    );
  });
});
