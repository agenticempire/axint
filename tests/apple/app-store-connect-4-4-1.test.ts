import { describe, expect, it } from "vitest";
import { analyzeAppStoreConnect441Request } from "../../src/apple/app-store-connect-4-4-1.js";

describe("App Store Connect API 4.4.1 migration checks", () => {
  it("finds deprecated metadata endpoints", () => {
    expect(
      analyzeAppStoreConnect441Request({
        path: "/v1/subscriptionLocalizations/123",
      }).map((finding) => finding.code)
    ).toContain("ASC441_LEGACY_RESOURCE");
  });

  it("requires version relationships in commerce review submissions", () => {
    expect(
      analyzeAppStoreConnect441Request({
        path: "/v1/reviewSubmissionItems",
        body: {
          data: {
            relationships: {
              subscription: { data: { type: "subscriptions", id: "1" } },
            },
          },
        },
      }).map((finding) => finding.code)
    ).toContain("ASC441_VERSIONED_METADATA");

    expect(
      analyzeAppStoreConnect441Request({
        path: "/v1/reviewSubmissionItems",
        body: {
          data: {
            relationships: {
              subscriptionVersion: { data: { type: "subscriptionVersions", id: "1" } },
            },
          },
        },
      })
    ).toHaveLength(0);
  });

  it("does not treat ordinary app-version review items as commerce migrations", () => {
    expect(
      analyzeAppStoreConnect441Request({
        path: "/v1/reviewSubmissionItems",
        body: {
          data: {
            relationships: {
              appStoreVersion: { data: { type: "appStoreVersions", id: "1" } },
            },
          },
        },
      })
    ).toHaveLength(0);
  });

  it("checks the new social media age-rating declarations", () => {
    expect(
      analyzeAppStoreConnect441Request({
        path: "/v1/ageRatingDeclarations/123",
        body: { data: { attributes: {} } },
      }).map((finding) => finding.code)
    ).toContain("ASC441_AGE_RATING");
  });
});
