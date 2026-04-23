import { describe, expect, it } from "vitest";
import {
  compileExtensionFromIR,
  compileExtensionSource,
} from "../../src/core/compiler.js";
import {
  generateSwiftExtension,
  generateSwiftExtensionTarget,
  generateExtensionInfoPlist,
  generateExtensionInfoPlistAll,
} from "../../src/core/extension-generator.js";
import { parseExtensionSource } from "../../src/core/extension-parser.js";
import {
  validateExtension,
  validateSwiftExtensionSource,
} from "../../src/core/extension-validator.js";
import type { IRExtension } from "../../src/core/types.js";

// ─── Fixtures ───────────────────────────────────────────────────────

const PIZZA_EXTENSIONS: IRExtension = {
  name: "PizzaShare",
  targets: [
    {
      principalClass: "ShareHandler",
      kind: "share",
      displayName: "Share with Pizza",
      maxItemCount: 1,
      activationTypes: ["NSExtensionActivationSupportsImageWithMaxCount"],
    },
    {
      principalClass: "PushHandler",
      kind: "notificationService",
      displayName: "Pizza Push Handler",
    },
  ],
  sourceFile: "<test>",
};

const PIZZA_EXTENSIONS_SOURCE = `
import { defineExtension } from "@axint/compiler";

export default defineExtension({
  name: "PizzaShare",
  targets: [
    {
      principalClass: "ShareHandler",
      kind: "share",
      displayName: "Share with Pizza",
      maxItemCount: 1,
      activationTypes: ["NSExtensionActivationSupportsImageWithMaxCount"],
    },
    {
      principalClass: "PushHandler",
      kind: "notificationService",
      displayName: "Pizza Push Handler",
    },
  ],
});
`;

// ─── Generator ──────────────────────────────────────────────────────

describe("generateSwiftExtensionTarget", () => {
  it("emits a UIViewController subclass for share targets", () => {
    const swift = generateSwiftExtensionTarget(PIZZA_EXTENSIONS.targets[0]);
    expect(swift).toContain("import UIKit");
    expect(swift).toContain("class ShareHandler: UIViewController {");
    expect(swift).toContain("override func isContentValid()");
    expect(swift).toContain("override func didSelectPost()");
  });

  it("emits a UNNotificationServiceExtension subclass for notification-service targets", () => {
    const swift = generateSwiftExtensionTarget(PIZZA_EXTENSIONS.targets[1]);
    expect(swift).toContain("import UserNotifications");
    expect(swift).toContain("class PushHandler: UNNotificationServiceExtension {");
    expect(swift).toContain("override func didReceive(_ request: UNNotificationRequest");
    expect(swift).toContain("override func serviceExtensionTimeWillExpire()");
  });

  it("emits a notification-content controller that imports both UIKit frameworks", () => {
    const swift = generateSwiftExtensionTarget({
      principalClass: "ContentController",
      kind: "notificationContent",
      displayName: "Rich Push UI",
    });
    expect(swift).toContain("import UserNotificationsUI");
    expect(swift).toContain("import UserNotifications");
    expect(swift).toContain("class ContentController: UIViewController {");
    expect(swift).toContain("func didReceive(_ notification: UNNotification)");
  });
});

describe("generateSwiftExtension", () => {
  it("concatenates every target's Swift blob", () => {
    const swift = generateSwiftExtension(PIZZA_EXTENSIONS);
    expect(swift).toContain("class ShareHandler: UIViewController");
    expect(swift).toContain("class PushHandler: UNNotificationServiceExtension");
  });
});

describe("generateExtensionInfoPlist", () => {
  it("emits NSExtensionPointIdentifier and principal class for share targets", () => {
    const plist = generateExtensionInfoPlist(PIZZA_EXTENSIONS.targets[0]);
    expect(plist).toContain(
      "<key>NSExtensionPointIdentifier</key>\n    <string>com.apple.share-services</string>"
    );
    expect(plist).toContain("$(PRODUCT_MODULE_NAME).ShareHandler");
    expect(plist).toContain("NSExtensionActivationSupportsImageWithMaxCount");
    expect(plist).toContain("<integer>1</integer>");
  });

  it("skips NSExtensionAttributes for notification targets", () => {
    const plist = generateExtensionInfoPlist(PIZZA_EXTENSIONS.targets[1]);
    expect(plist).toContain("com.apple.usernotifications.service");
    expect(plist).not.toContain("NSExtensionAttributes");
  });

  it("falls back to TRUEPREDICATE when activationTypes is omitted", () => {
    const plist = generateExtensionInfoPlist({
      principalClass: "ActionHandler",
      kind: "action",
      displayName: "Run Action",
    });
    expect(plist).toContain("<string>TRUEPREDICATE</string>");
  });
});

describe("generateExtensionInfoPlistAll", () => {
  it("joins every target's fragment with a blank line separator", () => {
    const plist = generateExtensionInfoPlistAll(PIZZA_EXTENSIONS);
    expect(plist).toContain("ShareHandler");
    expect(plist).toContain("PushHandler");
    expect(plist.split("\n\n").length).toBeGreaterThan(1);
  });
});

// ─── IR Validator ───────────────────────────────────────────────────

describe("validateExtension", () => {
  it("accepts a well-formed provider", () => {
    expect(validateExtension(PIZZA_EXTENSIONS)).toEqual([]);
  });

  it("rejects a non-PascalCase provider name (AX830)", () => {
    const diags = validateExtension({ ...PIZZA_EXTENSIONS, name: "pizzaShare" });
    expect(diags.map((d) => d.code)).toContain("AX830");
  });

  it("rejects an empty targets list (AX831)", () => {
    const diags = validateExtension({ ...PIZZA_EXTENSIONS, targets: [] });
    expect(diags.map((d) => d.code)).toContain("AX831");
  });

  it("rejects a principalClass that isn't a Swift type name (AX832)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [{ ...PIZZA_EXTENSIONS.targets[0], principalClass: "shareHandler" }],
    });
    expect(diags.map((d) => d.code)).toContain("AX832");
  });

  it("rejects duplicate principalClass names (AX833)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [
        PIZZA_EXTENSIONS.targets[0],
        { ...PIZZA_EXTENSIONS.targets[1], principalClass: "ShareHandler" },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX833");
  });

  it("rejects an empty displayName (AX834)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [{ ...PIZZA_EXTENSIONS.targets[0], displayName: "   " }],
    });
    expect(diags.map((d) => d.code)).toContain("AX834");
  });

  it("rejects maxItemCount on notification targets (AX835)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [{ ...PIZZA_EXTENSIONS.targets[1], maxItemCount: 1 }],
    });
    expect(diags.map((d) => d.code)).toContain("AX835");
  });

  it("rejects activationTypes on notification targets (AX836)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [
        {
          ...PIZZA_EXTENSIONS.targets[1],
          activationTypes: ["NSExtensionActivationSupportsImageWithMaxCount"],
        },
      ],
    });
    expect(diags.map((d) => d.code)).toContain("AX836");
  });

  it("rejects maxItemCount < 1 on share targets (AX837)", () => {
    const diags = validateExtension({
      ...PIZZA_EXTENSIONS,
      targets: [{ ...PIZZA_EXTENSIONS.targets[0], maxItemCount: 0 }],
    });
    expect(diags.map((d) => d.code)).toContain("AX837");
  });
});

describe("validateSwiftExtensionSource", () => {
  it("flags missing framework imports (AX838)", () => {
    const diags = validateSwiftExtensionSource("class ShareHandler: UIViewController {}");
    expect(diags.map((d) => d.code)).toContain("AX838");
  });

  it("flags missing principal class declaration (AX839)", () => {
    const diags = validateSwiftExtensionSource("import UIKit\nstruct Foo {}");
    expect(diags.map((d) => d.code)).toContain("AX839");
  });

  it("accepts Swift with both import and principal class", () => {
    expect(
      validateSwiftExtensionSource(
        "import UIKit\nclass ShareHandler: UIViewController {}"
      )
    ).toEqual([]);
  });
});

// ─── Parser + end-to-end compile ───────────────────────────────────

describe("parseExtensionSource", () => {
  it("parses a defineExtension call into an IRExtension", () => {
    const ir = parseExtensionSource(PIZZA_EXTENSIONS_SOURCE, "pizza.ts");
    expect(ir.name).toBe("PizzaShare");
    expect(ir.targets).toHaveLength(2);
    expect(ir.targets[0].principalClass).toBe("ShareHandler");
    expect(ir.targets[0].kind).toBe("share");
    expect(ir.targets[0].maxItemCount).toBe(1);
    expect(ir.targets[0].activationTypes).toEqual([
      "NSExtensionActivationSupportsImageWithMaxCount",
    ]);
    expect(ir.targets[1].kind).toBe("notificationService");
    expect(ir.sourceFile).toBe("pizza.ts");
  });

  it("throws when defineExtension is missing (AX820)", () => {
    expect.assertions(1);
    try {
      parseExtensionSource("const x = 1;", "nope.ts");
    } catch (err) {
      expect((err as { code: string }).code).toBe("AX820");
    }
  });

  it("throws on an unknown kind (AX827)", () => {
    expect.assertions(1);
    try {
      parseExtensionSource(
        `
        import { defineExtension } from "@axint/compiler";
        export default defineExtension({
          name: "Bad",
          targets: [{ principalClass: "X", kind: "widget", displayName: "X" }],
        });
      `,
        "bad.ts"
      );
    } catch (err) {
      expect((err as { code: string }).code).toBe("AX827");
    }
  });
});

describe("compileExtensionSource", () => {
  it("produces valid Swift + Info.plist for a well-formed source", () => {
    const result = compileExtensionSource(PIZZA_EXTENSIONS_SOURCE, "pizza.ts");
    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.output?.swiftCode).toContain("class ShareHandler: UIViewController");
    expect(result.output?.swiftCode).toContain(
      "class PushHandler: UNNotificationServiceExtension"
    );
    expect(result.output?.infoPlistFragment).toContain("com.apple.share-services");
    expect(result.output?.infoPlistFragment).toContain(
      "com.apple.usernotifications.service"
    );
    expect(result.output?.outputPath).toMatch(/PizzaShareExtensions\.swift$/);
  });

  it("reports IR validation errors before generation", () => {
    const result = compileExtensionFromIR({ ...PIZZA_EXTENSIONS, targets: [] });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain("AX831");
  });
});
