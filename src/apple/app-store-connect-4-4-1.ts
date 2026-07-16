export interface AppStoreConnect441Change {
  id: string;
  kind: "added" | "deprecated";
  summary: string;
  replacement?: string;
}

export const APP_STORE_CONNECT_4_4_1_CHANGES: readonly AppStoreConnect441Change[] = [
  {
    id: "iap-versioned-metadata",
    kind: "added",
    summary:
      "In-app purchase metadata, localizations, review images, and review submission are scoped to InAppPurchaseVersion.",
  },
  {
    id: "subscription-versioned-metadata",
    kind: "added",
    summary:
      "Subscription metadata, localizations, promotional images, and review submission are scoped to SubscriptionVersion.",
  },
  {
    id: "subscription-group-versioned-metadata",
    kind: "added",
    summary:
      "Subscription-group metadata, localizations, localized custom app names, and review submission are scoped to SubscriptionGroupVersion.",
  },
  {
    id: "version-review-submission-items",
    kind: "added",
    summary:
      "Review submissions accept inAppPurchaseVersion, subscriptionVersion, and subscriptionGroupVersion relationships.",
  },
  {
    id: "age-rating-social-media",
    kind: "added",
    summary:
      "Age-rating declarations include socialMedia and socialMediaAgeRestricted Boolean attributes.",
  },
  {
    id: "legacy-purchase-localizations",
    kind: "deprecated",
    summary: "In-app purchase localization v1 resources are deprecated.",
    replacement: "Use v2 localizations scoped to InAppPurchaseVersion.",
  },
  {
    id: "legacy-purchase-images",
    kind: "deprecated",
    summary: "In-app purchase image v1 resources are deprecated.",
    replacement: "Use v2 images scoped to InAppPurchaseVersion.",
  },
  {
    id: "legacy-purchase-submissions",
    kind: "deprecated",
    summary: "In-app purchase submission resources are deprecated.",
    replacement: "Add an InAppPurchaseVersion relationship to a review submission item.",
  },
  {
    id: "legacy-subscription-metadata",
    kind: "deprecated",
    summary:
      "Subscription and subscription-group v1 localization/image/submission resources are deprecated.",
    replacement: "Use version-scoped v2 resources and review submission items.",
  },
];

export interface AppStoreConnectMigrationFinding {
  severity: "warning" | "info";
  code: "ASC441_VERSIONED_METADATA" | "ASC441_LEGACY_RESOURCE" | "ASC441_AGE_RATING";
  message: string;
  recommendation: string;
}

const LEGACY_RESOURCE_PATTERNS = [
  /\/v1\/inAppPurchaseLocalizations(?:\/|$)/,
  /\/v1\/inAppPurchaseImages(?:\/|$)/,
  /\/v1\/inAppPurchaseSubmissions(?:\/|$)/,
  /\/v1\/subscriptionLocalizations(?:\/|$)/,
  /\/v1\/subscriptionImages(?:\/|$)/,
  /\/v1\/subscriptionGroupLocalizations(?:\/|$)/,
  /\/v1\/subscriptionSubmissions(?:\/|$)/,
];

export function analyzeAppStoreConnect441Request(input: {
  path: string;
  body?: unknown;
}): AppStoreConnectMigrationFinding[] {
  const findings: AppStoreConnectMigrationFinding[] = [];

  if (LEGACY_RESOURCE_PATTERNS.some((pattern) => pattern.test(input.path))) {
    findings.push({
      severity: "warning",
      code: "ASC441_LEGACY_RESOURCE",
      message: `${input.path} uses an App Store Connect resource deprecated by API 4.4.1.`,
      recommendation:
        "Create or select the matching purchase/subscription metadata version, then use its version-scoped v2 localization or image endpoint.",
    });
  }

  if (
    /\/v1\/reviewSubmissionItems(?:\/|$)/.test(input.path) &&
    hasLegacyCommerceRelationship(input.body) &&
    !hasVersionRelationship(input.body)
  ) {
    findings.push({
      severity: "warning",
      code: "ASC441_VERSIONED_METADATA",
      message:
        "The review submission item does not reference an in-app purchase, subscription, or subscription-group version.",
      recommendation:
        "Send an inAppPurchaseVersion, subscriptionVersion, or subscriptionGroupVersion relationship.",
    });
  }

  if (
    /ageRating/i.test(input.path) &&
    isRecord(input.body) &&
    !hasSocialMediaAgeRating(input.body)
  ) {
    findings.push({
      severity: "info",
      code: "ASC441_AGE_RATING",
      message:
        "The age-rating payload does not declare the API 4.4.1 social media attributes.",
      recommendation:
        "Review the app and set socialMedia and socialMediaAgeRestricted explicitly.",
    });
  }

  return findings;
}

function hasVersionRelationship(body: unknown): boolean {
  const serialized = JSON.stringify(body ?? {});
  return /"(?:inAppPurchaseVersion|subscriptionVersion|subscriptionGroupVersion)"/.test(
    serialized
  );
}

function hasLegacyCommerceRelationship(body: unknown): boolean {
  const serialized = JSON.stringify(body ?? {});
  return /"(?:inAppPurchase|subscription|subscriptionGroup)"/.test(serialized);
}

function hasSocialMediaAgeRating(body: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(body);
  return (
    serialized.includes('"socialMedia"') &&
    serialized.includes('"socialMediaAgeRestricted"')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
