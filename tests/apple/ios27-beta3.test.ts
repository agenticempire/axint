import { describe, expect, it } from "vitest";
import {
  IOS27_BETA3_RULES,
  activeIOS27Beta3Rules,
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
        "foundationmodels.pcc-greedy-decoding",
        "appintents.relevantentities.workout-audio",
        "shortcuts.use-model-on-device-output",
        "siri.callkit-phone-start-call",
        "siri.openintent-ambiguity",
        "swiftui.state-macro-initialization",
        "swiftui.tabview-visible-selection",
        "swiftui.document-protocol-migration",
        "backgroundassets.ondemandresources-deprecation",
        "coreai.aot-recompile-beta3",
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

  it("distinguishes resolved beta issues from active compatibility risks", () => {
    expect(findIOS27Beta3Rule("foundationmodels.pcc-simulator")?.status).toBe("resolved");
    expect(
      activeIOS27Beta3Rules().some((rule) => rule.id === "foundationmodels.pcc-simulator")
    ).toBe(false);
    expect(
      activeIOS27Beta3Rules().some(
        (rule) => rule.id === "foundationmodels.pcc-greedy-decoding"
      )
    ).toBe(true);
  });
});
