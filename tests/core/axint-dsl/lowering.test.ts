import { describe, expect, it } from "vitest";
import { lower, parse } from "../../../src/core/axint-dsl/index.js";
import type { Diagnostic } from "../../../src/core/axint-dsl/index.js";
import type { IRIntent } from "../../../src/core/types.js";

function lowerSource(source: string, sourceFile = "test.axint") {
  const { file, diagnostics: parseDiags } = parse(source, { sourceFile });
  if (parseDiags.length > 0) {
    const lines = parseDiags
      .map((d) => `${d.code} @ ${d.span.start.line}:${d.span.start.column}  ${d.message}`)
      .join("\n");
    throw new Error(`parse produced unexpected diagnostics:\n${lines}`);
  }
  return lower(file, { sourceFile });
}

function codesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

describe("axint-dsl lowering — happy path", () => {
  it("lowers a minimal intent to an IRIntent with a default string return type", () => {
    const { intents, entities, diagnostics } = lowerSource(`
      intent Hello {
        title: "Hello"
        description: "A minimal App Intent that says hello."
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(entities).toHaveLength(0);
    expect(intents).toHaveLength(1);

    const [intent] = intents;
    expect(intent.name).toBe("Hello");
    expect(intent.title).toBe("Hello");
    expect(intent.description).toBe("A minimal App Intent that says hello.");
    expect(intent.parameters).toHaveLength(0);
    expect(intent.returnType).toEqual({ kind: "primitive", value: "string" });
    expect(intent.sourceFile).toBe("test.axint");
  });

  it("copies meta clauses onto the IRIntent", () => {
    const { intents, diagnostics } = lowerSource(`
      intent Ping {
        title: "Ping"
        description: "Pings a service."
        domain: "network"
        category: "diagnostics"
        discoverable: true
        donateOnPerform: false
      }
    `);

    expect(diagnostics).toHaveLength(0);
    const [intent] = intents;
    expect(intent.domain).toBe("network");
    expect(intent.category).toBe("diagnostics");
    expect(intent.isDiscoverable).toBe(true);
    expect(intent.donateOnPerform).toBe(false);
  });

  it("lowers custom public pages into safe module manifests", () => {
    const { pages, intents, entities, diagnostics } = lowerSource(`
      page AxintLander {
        title: "Axint"
        tagline: "Compiler-native project pages"
        theme: "black-cream"

        module emailCapture "Join the build" {
          kind: emailCapture
          permission: collectEmail
          permission: outboundLink
          privacy: "Used only for Axint updates."
        }

        module shareCard "Launch card" {
          kind: shareCard
          output: "1200x630 PNG"
          source: uploadedArtwork
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(intents).toHaveLength(0);
    expect(entities).toHaveLength(0);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      name: "AxintLander",
      title: "Axint",
      tagline: "Compiler-native project pages",
      theme: "black-cream",
      modules: [
        {
          id: "emailCapture",
          title: "Join the build",
          kind: "emailCapture",
          permissions: ["collectEmail", "outboundLink"],
          fields: {
            kind: "emailCapture",
            permission: ["collectEmail", "outboundLink"],
            privacy: "Used only for Axint updates.",
          },
        },
        {
          id: "shareCard",
          title: "Launch card",
          kind: "shareCard",
          permissions: [],
          fields: {
            kind: "shareCard",
            output: "1200x630 PNG",
            source: "uploadedArtwork",
          },
        },
      ],
    });
  });

  it("lowers params with primitive and optional types", () => {
    const { intents, diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send Message"
        description: "Send a message."
        param recipient: string {
          description: "Who to send the message to"
        }
        param note: string? {
          description: "Optional note"
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    const [intent] = intents;
    expect(intent.parameters).toHaveLength(2);
    expect(intent.parameters[0]).toMatchObject({
      name: "recipient",
      type: { kind: "primitive", value: "string" },
      title: "Recipient",
      description: "Who to send the message to",
      isOptional: false,
    });
    expect(intent.parameters[1]).toMatchObject({
      name: "note",
      type: { kind: "optional", innerType: { kind: "primitive", value: "string" } },
      isOptional: true,
    });
  });

  it("lowers enum param types inline with their cases", () => {
    const { intents, diagnostics } = lowerSource(`
      enum Priority { low medium high }

      intent FlagTask {
        title: "Flag Task"
        description: "Flags a task with a priority level."
        param taskId: string {
          description: "Task identifier"
        }
        param priority: Priority {
          description: "Priority level"
          default: medium
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    const priority = intents[0]!.parameters[1]!;
    expect(priority.type).toEqual({
      kind: "enum",
      name: "Priority",
      cases: ["low", "medium", "high"],
    });
    expect(priority.defaultValue).toBe("medium");
  });

  it("wraps dynamic options around the inner value type", () => {
    const { intents, diagnostics } = lowerSource(`
      intent Plan {
        title: "Plan"
        description: "Plan an activity."
        param activity: string {
          description: "Activity"
          options: dynamic ActivityOptions
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(intents[0]!.parameters[0]!.type).toEqual({
      kind: "dynamicOptions",
      valueType: { kind: "primitive", value: "string" },
      providerName: "ActivityOptions",
    });
  });

  it("attaches referenced entities and lowers entity params to entity IR", () => {
    const { intents, entities, diagnostics } = lowerSource(`
      entity Trail {
        display {
          title: name
          subtitle: region
          image: "figure.hiking"
        }
        property id: string {
          description: "Trail identifier"
        }
        property name: string {
          description: "Trail name"
        }
        property region: string {
          description: "Trail region"
        }
        query: property
      }

      intent OpenTrail {
        title: "Open Trail"
        description: "Opens a trail."
        param trail: Trail {
          description: "Trail to open"
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      name: "Trail",
      displayRepresentation: {
        title: "name",
        subtitle: "region",
        image: "figure.hiking",
      },
      queryType: "property",
    });
    expect(entities[0]!.properties.map((p) => p.name)).toEqual(["id", "name", "region"]);

    const intent = intents[0]!;
    expect(intent.parameters[0]!.type).toMatchObject({
      kind: "entity",
      entityName: "Trail",
    });
    expect(intent.entities).toHaveLength(1);
    expect(intent.entities?.[0]?.name).toBe("Trail");
  });

  it("lowers returns clauses — primitives, entity, and array of entity", () => {
    const { intents, diagnostics } = lowerSource(`
      entity Contact {
        display { title: name image: "person.circle" }
        property id: string { description: "id" }
        property name: string { description: "name" }
        query: property
      }

      intent FindContact {
        title: "Find"
        description: "Finds a contact."
        param name: string { description: "Contact name" }
        returns: Contact
      }

      intent ListContacts {
        title: "List"
        description: "Lists contacts."
        param limit: int { description: "Max contacts" default: 10 }
        returns: [Contact]
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(intents[0]!.returnType).toMatchObject({
      kind: "entity",
      entityName: "Contact",
    });
    expect(intents[1]!.returnType).toEqual({
      kind: "array",
      elementType: expect.objectContaining({ kind: "entity", entityName: "Contact" }),
    });
  });

  it("lowers a simple summary template", () => {
    const { intents, diagnostics } = lowerSource(`
      intent Greet {
        title: "Greet"
        description: "Greet someone."
        param name: string { description: "Name" }
        summary: "Hello \${name}"
      }
    `);

    expect(diagnostics).toHaveLength(0);
    expect(intents[0]!.parameterSummary).toEqual({
      kind: "summary",
      template: "Hello ${name}",
    });
  });

  it("lowers a summary switch with a default into IRParameterSummary", () => {
    const { intents, diagnostics } = lowerSource(`
      intent SetBrightness {
        title: "Set Brightness"
        description: "Adjust brightness."
        param mode: string { description: "Mode" }
        param value: int { description: "Value" }
        summary switch mode {
          case "manual": "Set brightness to \${value}"
          case "auto": "Switch brightness to automatic"
          default: "Adjust brightness"
        }
      }
    `);

    expect(diagnostics).toHaveLength(0);
    const summary = intents[0]!.parameterSummary!;
    expect(summary.kind).toBe("switch");
    if (summary.kind !== "switch") throw new Error("unreachable");
    expect(summary.parameter).toBe("mode");
    expect(summary.cases).toHaveLength(2);
    expect(summary.default).toEqual({ kind: "summary", template: "Adjust brightness" });
  });
});

describe("axint-dsl lowering — validator diagnostics", () => {
  it("AX001 fires when the file has zero declarations", () => {
    const { diagnostics, intents, entities } = lowerSource("");
    expect(intents).toHaveLength(0);
    expect(entities).toHaveLength(0);
    expect(codesOf(diagnostics)).toEqual(["AX001"]);
    expect(diagnostics[0]!.fix?.kind).toBe("insert_required_clause");
  });

  it("AX005 fires on an unknown lowercase primitive-ish type", () => {
    const { diagnostics } = lowerSource(`
      intent Broken {
        title: "Broken"
        description: "Uses an unknown type."
        param count: integer { description: "Count" }
      }
    `);
    const ax005 = diagnostics.find((d) => d.code === "AX005");
    expect(ax005).toBeDefined();
    expect(ax005!.fix?.kind).toBe("change_type");
    expect(ax005!.fix?.candidates).toContain("int");
  });

  it("AX020 fires when a param references an undeclared entity", () => {
    const { diagnostics } = lowerSource(`
      intent OpenTrail {
        title: "Open Trail"
        description: "Opens a trail."
        param trail: Trail { description: "Trail" }
      }
    `);
    const ax020 = diagnostics.find((d) => d.code === "AX020");
    expect(ax020).toBeDefined();
    expect(ax020!.fix?.kind).toBe("replace_identifier");
  });

  it("AX021 fires when display.title names a property that does not exist", () => {
    const { diagnostics } = lowerSource(`
      entity Trail {
        display {
          title: label
          image: "figure.hiking"
        }
        property id: string { description: "id" }
        property name: string { description: "name" }
        query: property
      }
    `);
    const ax021 = diagnostics.find((d) => d.code === "AX021");
    expect(ax021).toBeDefined();
    expect(ax021!.fix?.candidates).toEqual(expect.arrayContaining(["id", "name"]));
  });

  it("AX023 fires when a summary template references an unknown param", () => {
    const { diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send Message"
        description: "Send a message."
        param recipient: string { description: "Recipient" }
        param body: string { description: "Body" }
        summary: "Send \${body} to \${destination}"
      }
    `);
    const ax023 = diagnostics.find((d) => d.code === "AX023");
    expect(ax023).toBeDefined();
    expect(ax023!.message).toContain("destination");
    expect(ax023!.fix?.candidates).toEqual(["body", "recipient"]);
  });

  it("AX100 fires when the intent name is not PascalCase", () => {
    const { diagnostics } = lowerSource(`
      intent send_message {
        title: "Send"
        description: "Send."
      }
    `);
    const ax100 = diagnostics.find((d) => d.code === "AX100");
    expect(ax100).toBeDefined();
    expect(ax100!.fix?.kind).toBe("rename_identifier");
  });

  it("AX103 fires on duplicate param names", () => {
    const { diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send"
        description: "Send."
        param recipient: string { description: "Who" }
        param recipient: string { description: "Who again" }
      }
    `);
    expect(codesOf(diagnostics)).toContain("AX103");
  });

  it("AX106 fires when a default value doesn't match the declared type", () => {
    const { diagnostics } = lowerSource(`
      intent SetBrightness {
        title: "Set Brightness"
        description: "Adjust."
        param level: int {
          description: "Percentage"
          default: "one hundred"
        }
      }
    `);
    const ax106 = diagnostics.find((d) => d.code === "AX106");
    expect(ax106).toBeDefined();
    expect(ax106!.fix?.kind).toBe("replace_literal");
  });

  it("AX107 fires when an optional param carries a default value", () => {
    const { diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send"
        description: "Send."
        param urgent: boolean? {
          description: "Urgent"
          default: true
        }
      }
    `);
    const ax107 = diagnostics.find((d) => d.code === "AX107");
    expect(ax107).toBeDefined();
    expect(ax107!.fix?.kind).toBe("remove_field");
  });

  it("AX109 fires when a boolean summary switch omits the default and doesn't cover both cases", () => {
    const { diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send"
        description: "Send."
        param recipient: string { description: "Who" }
        param urgent: boolean {
          description: "Urgent"
          default: false
        }
        summary switch urgent {
          case true: "URGENT: send to \${recipient}"
        }
      }
    `);
    const ax109 = diagnostics.find((d) => d.code === "AX109");
    expect(ax109).toBeDefined();
    expect(ax109!.fix?.kind).toBe("insert_required_clause");
  });

  it("accepts an exhaustive boolean switch without a default", () => {
    const { diagnostics } = lowerSource(`
      intent SendMessage {
        title: "Send"
        description: "Send."
        param recipient: string { description: "Who" }
        param urgent: boolean {
          description: "Urgent"
          default: false
        }
        summary switch urgent {
          case true: "URGENT: send to \${recipient}"
          case false: "Send to \${recipient}"
        }
      }
    `);
    expect(diagnostics.filter((d) => d.code === "AX109")).toHaveLength(0);
  });

  it("accepts an exhaustive enum switch without a default", () => {
    const { diagnostics } = lowerSource(`
      enum Priority { low medium high }

      intent Flag {
        title: "Flag"
        description: "Flag."
        param priority: Priority { description: "Priority" }
        summary switch priority {
          case low: "Low"
          case medium: "Medium"
          case high: "High"
        }
      }
    `);
    expect(diagnostics.filter((d) => d.code === "AX109")).toHaveLength(0);
  });
});

describe("axint-dsl lowering — diagnostic shape", () => {
  it("every diagnostic carries the v1 schema version and the reported file path", () => {
    const { diagnostics } = lowerSource(
      `intent broken { title: "X" description: "X" }`,
      "broken.axint"
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const d of diagnostics) {
      expect(d.schemaVersion).toBe(1);
      expect(d.file).toBe("broken.axint");
    }
  });
});

describe("axint-dsl lowering — IR contract", () => {
  it("produces an IRIntent whose shape matches the TS surface (structural check)", () => {
    const { intents } = lowerSource(`
      intent Hello {
        title: "Hello"
        description: "A minimal App Intent that says hello."
      }
    `);
    const [intent] = intents;
    // Structural assertions mirror the TS surface's defineIntent output.
    const expected: IRIntent = {
      name: "Hello",
      title: "Hello",
      description: "A minimal App Intent that says hello.",
      parameters: [],
      returnType: { kind: "primitive", value: "string" },
      sourceFile: "test.axint",
    };
    expect(intent).toEqual(expected);
  });
});
