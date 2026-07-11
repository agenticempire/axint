import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyProductInterest,
  recordProductInterestEvent,
} from "../../src/telemetry/product-insights.js";
import {
  getAdoptionTelemetryStatus,
  renderAdoptionTelemetryStatus,
} from "../../src/telemetry/adoption.js";

const OLD_ENV = { ...process.env };
let dir = "";
let bodies: unknown[] = [];

describe("privacy-safe product interest telemetry", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "axint-interest-"));
    bodies = [];
    process.env = {
      ...OLD_ENV,
      AXINT_TELEMETRY_CONFIG: join(dir, "telemetry.json"),
      AXINT_PROJECT_TELEMETRY_CONFIG: join(dir, "project.json"),
      AXINT_TELEMETRY_ENDPOINT: "https://example.test/adoption",
      AXINT_TELEMETRY: "standard",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...OLD_ENV };
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("classifies domains, goals, and explicit Apple surfaces", () => {
    const result = classifyProductInterest({
      text: "Build a calorie tracking health widget with a Live Activity",
      insightKind: "project_brief",
      querySource: "suggest-cli",
      resultCount: 3,
      targetPlatform: "iOS",
    });

    expect(result).toMatchObject({
      taxonomyVersion: "2026-07-v2",
      projectCategory: "health-fitness",
      projectGoal: "track-monitor",
      resultBucket: "few",
      targetPlatform: "iOS",
      projectLifecycle: "greenfield",
      deliveryTarget: "app-feature",
      complexityBucket: "contained",
    });
    expect(result.appleSurfaces).toEqual(
      expect.arrayContaining(["widgetkit", "live-activities"])
    );
    expect(result.featureAreas).toEqual(
      expect.arrayContaining(["notifications-background", "health-sensors"])
    );
  });

  it("sends only allowlisted labels and never the raw project text", async () => {
    const secretText =
      "Fix Project Nightingale at /Users/alice/SecretApp using token sk-private-123 and a broken HealthKit widget";
    const result = await recordProductInterestEvent({
      text: secretText,
      insightKind: "project_brief",
      querySource: "suggest-mcp",
      source: "mcp",
      version: "0.0.0-test",
      resultCount: 0,
      targetPlatform: "iOS",
    });

    expect(result.sent).toBe(true);
    const serialized = JSON.stringify(bodies);
    expect(serialized).not.toContain("Nightingale");
    expect(serialized).not.toContain("/Users/alice");
    expect(serialized).not.toContain("sk-private-123");

    const batch = bodies[0] as {
      events: Array<{ event_name: string; metadata: Record<string, unknown> }>;
    };
    const event = batch.events.find(
      (candidate) => candidate.event_name === "axint_interest_observed"
    );
    expect(event?.metadata).toMatchObject({
      insight_kind: "project_brief",
      project_category: "health-fitness",
      project_goal: "repair-debug",
      result_bucket: "none",
      query_source: "suggest-mcp",
      target_platform: "iOS",
      project_lifecycle: "brownfield",
      delivery_target: "bug-fix",
    });
    expect(event?.metadata.apple_surfaces).toContain("widgetkit");
  });

  it("does not send before explicit telemetry consent", async () => {
    delete process.env.AXINT_TELEMETRY;
    const result = await recordProductInterestEvent({
      text: "Build a private health app",
      insightKind: "project_brief",
      querySource: "suggest-cli",
      source: "cli",
      version: "0.0.0-test",
    });

    expect(result).toEqual({
      sent: false,
      reason: "explicit telemetry consent is not recorded",
    });
    expect(bodies).toEqual([]);
  });

  it("reports environment consent without rendering a null timestamp", () => {
    const status = getAdoptionTelemetryStatus();
    expect(status).toMatchObject({
      enabled: true,
      explicitConsent: true,
      sharingLevel: "standard",
      consentAt: null,
      consentVersion: "2026-07",
    });
    expect(renderAdoptionTelemetryStatus(status, "markdown")).toContain(
      "Explicit consent: yes (environment)"
    );
  });

  it("abstains when no allowlisted category or goal is present", () => {
    const result = classifyProductInterest({
      text: "Nightingale Zephyr",
      insightKind: "registry_search",
      querySource: "registry-cli",
    });
    expect(result.projectCategory).toBe("unknown");
    expect(result.projectGoal).toBe("unknown");
    expect(result.appleSurfaces).toEqual([]);
  });
});
