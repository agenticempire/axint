import { describe, expect, it } from "vitest";

import { compileFromIR, compileSource, irFromJSON } from "../../src/core/compiler.js";

const ADVANCED_SOURCE = `
import { defineIntent, defineEntity, param } from "@axint/compiler";

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
    distanceKm: param.double("Distance"),
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

describe("irFromJSON advanced bridge", () => {
  it("round-trips advanced intent IR emitted by the TypeScript compiler", () => {
    const parsed = compileSource(ADVANCED_SOURCE, "trail-depth.ts");

    expect(parsed.success).toBe(true);
    expect(parsed.output).toBeDefined();

    const bridged = irFromJSON(
      JSON.parse(JSON.stringify(parsed.output!.ir)) as Record<string, unknown>
    );

    expect(bridged.entities?.[0]?.queryType).toBe("property");
    expect(bridged.parameterSummary).toEqual({
      kind: "when",
      parameter: "region",
      then: {
        kind: "summary",
        template: "Plan ${trail} in ${region}",
      },
      otherwise: {
        kind: "summary",
        template: "Plan ${trail}",
      },
    });
    expect(bridged.parameters[0].type).toEqual({
      kind: "dynamicOptions",
      providerName: "ActivityOptions",
      valueType: { kind: "primitive", value: "string" },
    });

    const result = compileFromIR(bridged);
    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain("struct TrailQuery: EntityPropertyQuery");
    expect(result.output?.swiftCode).toContain(
      "struct ActivityOptions: DynamicOptionsProvider"
    );
    expect(result.output?.swiftCode).toContain(
      "static var parameterSummary: some ParameterSummary"
    );
  });

  it("normalizes Python-style flat JSON for entities, enums, and dynamic options", () => {
    const bridged = irFromJSON({
      name: "CreateTrailPlan",
      title: "Create Trail Plan",
      description: "Creates a new trail plan",
      domain: "navigation",
      parameterSummary: "Plan ${trail} in ${region}",
      entities: [
        {
          name: "Trail",
          displayRepresentation: {
            title: "name",
            subtitle: "region",
          },
          queryType: "property",
          properties: [
            { name: "id", type: "string", description: "Trail ID" },
            { name: "name", type: "string", description: "Trail name" },
            { name: "region", type: "string", description: "Trail region" },
          ],
        },
      ],
      parameters: [
        {
          name: "trail",
          type: "entity",
          entityName: "Trail",
          description: "Trail to open",
        },
        {
          name: "activity",
          type: "dynamicOptions",
          providerName: "ActivityOptions",
          valueType: "string",
          description: "Activity type",
        },
        {
          name: "difficulty",
          type: "enum",
          enumCases: ["easy", "hard"],
          description: "Difficulty",
        },
        {
          name: "region",
          type: "string",
          description: "Trail region",
          optional: true,
        },
      ],
      returnType: "string",
    });

    expect(bridged.parameters[0].type).toEqual({
      kind: "entity",
      entityName: "Trail",
      properties: [
        {
          name: "id",
          type: { kind: "primitive", value: "string" },
          title: "Trail ID",
          description: "Trail ID",
          isOptional: false,
          defaultValue: undefined,
        },
        {
          name: "name",
          type: { kind: "primitive", value: "string" },
          title: "Trail name",
          description: "Trail name",
          isOptional: false,
          defaultValue: undefined,
        },
        {
          name: "region",
          type: { kind: "primitive", value: "string" },
          title: "Trail region",
          description: "Trail region",
          isOptional: false,
          defaultValue: undefined,
        },
      ],
    });
    expect(bridged.parameters[1].type).toEqual({
      kind: "dynamicOptions",
      providerName: "ActivityOptions",
      valueType: { kind: "primitive", value: "string" },
    });
    expect(bridged.parameters[2].type).toEqual({
      kind: "enum",
      name: "DifficultyOption",
      cases: ["easy", "hard"],
    });

    const result = compileFromIR(bridged);
    expect(result.success).toBe(true);
    expect(bridged.parameters[2].type).toEqual({
      kind: "enum",
      name: "DifficultyOption",
      cases: ["easy", "hard"],
    });
    expect(result.output?.swiftCode).toContain("var difficulty: DifficultyOption");
    expect(result.output?.swiftCode).toContain("var trail: Trail");
  });

  it("normalizes WWDC26 EntityCollection and RelevantEntities fields from JSON IR", () => {
    const bridged = irFromJSON({
      name: "SummarizeMessageCollection",
      title: "Summarize Message Collection",
      description: "Summarizes messages through Siri and Apple Intelligence.",
      schemaDomain: "messages",
      schema: "AppSchema.MessagesIntent.sendMessage",
      conformsTo: ["LongRunningIntent", "CancellableIntent"],
      supportedModes: "[.foreground, .background]",
      allowedExecutionTargets: ".main",
      entities: [
        {
          name: "Message",
          schemaDomain: "messages",
          schema: "AppSchema.MessagesEntity.message",
          syncable: true,
          indexed: true,
          indexedQuery: true,
          ownership: "shared",
          intentValueRepresentation: "ValueRepresentation(exporting: \\.name)",
          relevantContexts: ["AppEntityContext.messages"],
          displayRepresentation: {
            title: "name",
            subtitle: "thread",
          },
          queryType: "string",
          properties: [
            { name: "id", type: "string", description: "Stable ID" },
            { name: "name", type: "string", description: "Message summary" },
            { name: "thread", type: "string", description: "Thread title" },
          ],
        },
      ],
      parameters: [
        {
          name: "messages",
          type: "entityCollection",
          entityName: "Message",
          description: "Messages to summarize",
        },
      ],
      returnType: "string",
    });

    expect(bridged.parameters[0].type).toEqual({
      kind: "entityCollection",
      entityName: "Message",
      properties: bridged.entities?.[0]?.properties,
    });

    const result = compileFromIR(bridged);

    expect(result.success).toBe(true);
    expect(result.output?.swiftCode).toContain("var messages: EntityCollection<Message>");
    expect(result.output?.swiftCode).toContain("RelevantEntities.shared.updateEntities");
    expect(result.output?.swiftCode).toContain(
      "static var allowedExecutionTargets: ExecutionTargets { .main }"
    );
  });
});
