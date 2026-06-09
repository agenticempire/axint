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

  it("emits P1 protocol conformances and entity collection parameters", () => {
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
  display: {
    title: "name",
  },
  properties: {
    id: param.string("Stable message ID"),
    name: param.string("Message summary"),
  },
  query: "string",
});

export default defineIntent({
  name: "SummarizeMessages",
  title: "Summarize Messages",
  description: "Summarizes selected messages with progress",
  schemaDomain: "messages",
  schema: "AppSchema.MessagesIntent.sendMessage",
  conformsTo: ["LongRunningIntent", "ProgressReportingIntent"],
  params: {
    messages: param.entityCollection("Message", "Messages to summarize"),
    tags: param.array(param.string("Tag"), "Tags", { required: false }),
  },
  perform: async () => {
    return { ok: true };
  },
});
`;
    const result = compileSource(source, "p1.ts");

    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain(
      "struct SummarizeMessagesIntent: AppIntent, LongRunningIntent, ProgressReportingIntent"
    );
    expect(result.output?.swiftCode).toContain("var messages: [Message]");
    expect(result.output?.swiftCode).toContain("var tags: [String]?");
  });

  it("emits Foundation Models, Evaluations, and preview proof support", () => {
    const source = `
import { defineIntent, param } from "@axint/sdk";

export default defineIntent({
  name: "SummarizeWithModel",
  title: "Summarize With Model",
  description: "Summarizes selected text with Apple Intelligence proof.",
  schemaDomain: "assistant",
  schema: "AppSchema.AssistantIntent.summarize",
  params: {
    sourceText: param.string("Text to summarize"),
  },
  model: {
    sessionName: "MessageSummarySession",
    provider: "apple-on-device",
    useCase: "summarization",
    instructions: "Summarize the input for a busy reader.",
    prompt: "Summarize the selected text.",
    dynamicProfile: "MessageSummaryProfile",
    guardrails: ["sensitive-content", "locale-aware"],
    generable: {
      name: "MessageSummary",
      fields: {
        summary: "String",
        actionItems: "[String]",
      },
    },
    tools: [
      {
        name: "MessageSearchTool",
        description: "Searches local messages for cited context.",
        argumentsType: "MessageSearchArguments",
        outputType: "[Message]",
      },
    ],
  },
  evaluation: {
    suite: "MessageSummaryEvaluations",
    scenarios: ["short-thread", "long-thread"],
    criteria: ["preserves sender intent", "returns action items"],
  },
  previewProof: {
    view: "MessageSummaryView",
    variants: ["light", "dark", "landscape", "accessibilityExtraLarge"],
    widgetTimeline: true,
    liveActivityStates: ["queued", "complete"],
  },
  perform: async ({ sourceText }) => {
    return { summary: sourceText };
  },
});
`;
    const result = compileSource(source, "model-proof.ts");

    expect(result.success).toBe(true);
    expect(result.output?.ir.model?.provider).toBe("apple-on-device");
    expect(result.output?.ir.evaluation?.suite).toBe("MessageSummaryEvaluations");
    expect(result.output?.ir.previewProof?.view).toBe("MessageSummaryView");
    expect(result.output?.swiftCode).toContain("import FoundationModels");
    expect(result.output?.swiftCode).toContain("@Generable");
    expect(result.output?.swiftCode).toContain("struct MessageSummary: Generable");
    expect(result.output?.swiftCode).toContain("struct MessageSearchTool: Tool");
    expect(result.output?.swiftCode).toContain("enum MessageSummarySessionFactory");
    expect(result.output?.swiftCode).toContain("LanguageModelSession");
    expect(result.output?.swiftCode).toContain("Dynamic Profile: MessageSummaryProfile");
    expect(result.output?.swiftCode).toContain("enum MessageSummaryEvaluations");
    expect(result.output?.swiftCode).toContain("AppIntentsTesting");
    expect(result.output?.swiftCode).toContain("Preview Snapshot proof matrix");
  });
});
