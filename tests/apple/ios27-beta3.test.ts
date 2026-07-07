import { describe, expect, it } from "vitest";
import {
  IOS27_BETA3_RULES,
  findIOS27Beta3Rule,
  normalizeIOS27Beta3Schema,
} from "../../src/apple/ios27-beta3.js";

describe("iOS 27 Beta 3 release-note rules", () => {
  it("tracks Siri and App Intents compatibility risks", () => {
    expect(IOS27_BETA3_RULES.map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        "appintents.schema.calendar.deleteEvents-renamed",
        "appintents.schema.notes-name-attributedstring",
        "appintents.entitystringquery.siri-resolution",
        "appintents.unionvalue.widget-configuration",
        "uikit.siri.drag-resource-loading",
        "coreai.background-neural-engine-entitlement",
      ])
    );
  });

  it("normalizes deprecated App Schema spellings", () => {
    expect(normalizeIOS27Beta3Schema(".calendar.deleteEvents")).toBe(
      ".calendar.deleteEvent"
    );
    expect(normalizeIOS27Beta3Schema("AppSchema.Calendar.deleteEvents")).toBe(
      "AppSchema.Calendar.deleteEvent"
    );
  });

  it("exposes actionable workarounds", () => {
    expect(
      findIOS27Beta3Rule("appintents.unionvalue.widget-configuration")?.workaround
    ).toContain("kind discriminator");
  });
});
