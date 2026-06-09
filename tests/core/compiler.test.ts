import { describe, it, expect } from "vitest";
import { compileSource } from "../../src/core/compiler.js";

const VALID_SOURCE = `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message to a contact",
  params: {
    recipient: param.string("Who to message"),
    body: param.string("Message content"),
  },
  perform: async ({ recipient, body }) => {
    return { sent: true };
  },
});
`;

describe("compileSource", () => {
  it("compiles valid source to Swift successfully", () => {
    const result = compileSource(VALID_SOURCE, "test.ts");

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.swiftCode).toContain("struct SendMessageIntent: AppIntent");
    expect(result.output!.swiftCode).toContain("import AppIntents");
    expect(result.output!.swiftCode).toContain("func perform()");
    expect(result.output!.ir.name).toBe("SendMessage");
    expect(result.output!.ir.parameters).toHaveLength(2);
  });

  it("produces a valid outputPath", () => {
    const result = compileSource(VALID_SOURCE, "test.ts");
    expect(result.output!.outputPath).toBe("SendMessageIntent.swift");
  });

  it("returns a diagnostic for source without defineIntent()", () => {
    const result = compileSource("const x = 42;", "bad.ts");
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX001")).toBe(true);
  });

  it("fails for non-PascalCase intent name", () => {
    const source = VALID_SOURCE.replace('"SendMessage"', '"sendMessage"');
    const result = compileSource(source, "test.ts");

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "AX100")).toBe(true);
  });

  it("returns warnings alongside success", () => {
    const source = `
defineIntent({
  name: "Test",
  title: "Test",
  description: "Test",
  params: {
    item: param.string(""),
  },
  perform: async () => {},
});
`;
    const result = compileSource(source, "test.ts");
    // Empty param description triggers AX104 warning, but should still succeed
    expect(result.success).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "AX104")).toBe(true);
  });

  it("snapshot: full pipeline output", () => {
    const result = compileSource(VALID_SOURCE, "test.ts");
    expect(result.output!.swiftCode).toMatchSnapshot();
  });

  it("compiles entity query depth features into Swift", () => {
    const source = `
import { defineIntent, defineEntity, param } from "@axint/sdk";

defineEntity({
  name: "Trail",
  display: {
    title: "name",
    subtitle: "region",
    image: "figure.hiking",
  },
  properties: {
    id: param.string("Trail ID"),
    name: param.string("Trail name"),
    region: param.string("Trail region"),
    distanceKm: param.double("Distance in kilometers"),
  },
  query: "property",
});

export default defineIntent({
  name: "PlanTrail",
  title: "Plan Trail",
  description: "Plans a trail outing",
  parameterSummary: {
    when: "region",
    then: "Plan \${trail} in \${region}",
    otherwise: "Plan \${trail}",
  },
  params: {
    activity: param.dynamicOptions("ActivityOptions", param.string("Activity type")),
    trail: param.entity("Trail", "Trail to open"),
    region: param.string("Region", { required: false }),
  },
  perform: async () => {
    return { ok: true };
  },
});
`;
    const result = compileSource(source, "trail-depth.ts");
    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain("struct Trail: AppEntity");
    expect(result.output?.swiftCode).toContain("struct TrailQuery: EntityPropertyQuery");
    expect(result.output?.swiftCode).toContain(
      "struct ActivityOptions: DynamicOptionsProvider"
    );
    expect(result.output?.swiftCode).toContain(
      "static var parameterSummary: some ParameterSummary"
    );
  });

  it("emits WWDC26 App schema macros and entity AI affordances", () => {
    const source = `
import { defineIntent, defineEntity, param } from "@axint/sdk";

defineEntity({
  name: "Message",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesEntity.message",
  syncable: true,
  indexed: true,
  indexedQuery: true,
  ownership: "shared",
  intentValueRepresentation: "IntentValueRepresentation(exporting: \\\\.name)",
  display: {
    title: "name",
    subtitle: "thread",
  },
  properties: {
    id: param.string("Stable message ID"),
    name: param.string("Message summary"),
    thread: param.string("Thread title"),
  },
  query: "string",
});

export default defineIntent({
  name: "SendMessage",
  title: "Send Message",
  description: "Sends a message through the app",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesIntent.sendMessage",
  conformsTo: ["LongRunningIntent", "CancellableIntent"],
  supportedModes: "[.foreground, .background]",
  allowedExecutionTargets: ".main",
  params: {
    target: param.entity("Message", "Message thread"),
    body: param.string("Message body"),
  },
  perform: async () => {
    return { ok: true };
  },
});
`;
    const result = compileSource(source, "wwdc26.ts");

    expect(result.success).toBe(true);
    expect(result.output?.ir.schemaDomain).toBe("messages");
    expect(result.output?.swiftCode).toContain("import CoreTransferable");
    expect(result.output?.swiftCode).toContain(
      "@AppEntity(schema: AppSchema.MessagesEntity.message)"
    );
    expect(result.output?.swiftCode).toContain(
      "struct Message: AppEntity, SyncableEntity, IndexedEntity, OwnershipProvidingEntity"
    );
    expect(result.output?.swiftCode).toContain(
      "struct MessageQuery: EntityStringQuery, IndexedEntityQuery"
    );
    expect(result.output?.swiftCode).toContain(
      "var ownership: EntityOwnership { .shared }"
    );
    expect(result.output?.swiftCode).toContain(
      "static var transferRepresentation: some TransferRepresentation"
    );
    expect(result.output?.swiftCode).toContain(
      "@AppIntent(schema: AppSchema.MessagesIntent.sendMessage)"
    );
    expect(result.output?.swiftCode).toContain(
      "struct SendMessageIntent: AppIntent, LongRunningIntent, CancellableIntent"
    );
    expect(result.output?.swiftCode).toContain(
      "static var supportedModes: IntentModes { [.foreground, .background] }"
    );
    expect(result.output?.swiftCode).toContain(
      "static var allowedExecutionTargets: ExecutionTargets { .main }"
    );
  });
});
