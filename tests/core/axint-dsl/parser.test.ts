import { describe, expect, it } from "vitest";
import { parse } from "../../../src/core/axint-dsl/index.js";
import type {
  EntityDecl,
  EnumDecl,
  IntentDecl,
  PageDecl,
  ParamDecl,
  SummarySwitch,
  SummaryWhen,
} from "../../../src/core/axint-dsl/index.js";

function parseOk(source: string) {
  const { file, diagnostics } = parse(source);
  if (diagnostics.length > 0) {
    const lines = diagnostics
      .map((d) => `${d.code} @ ${d.span.start.line}:${d.span.start.column}  ${d.message}`)
      .join("\n");
    throw new Error(`expected zero diagnostics, got:\n${lines}`);
  }
  return file;
}

describe("axint-dsl parser — happy path", () => {
  it("parses a minimal intent with title and description", () => {
    const file = parseOk(`
      intent Greet {
        title: "Say hello"
        description: "Prints a greeting."
      }
    `);
    expect(file.declarations).toHaveLength(1);
    const intent = file.declarations[0] as IntentDecl;
    expect(intent.kind).toBe("IntentDecl");
    expect(intent.name.name).toBe("Greet");
    expect(intent.title.value).toBe("Say hello");
    expect(intent.description.value).toBe("Prints a greeting.");
  });

  it("parses optional and array types", () => {
    const file = parseOk(`
      intent Search {
        title: "Search"
        description: "Finds things."
        param term: string {
          description: "What to look for"
        }
        param tags: [string]? {
          description: "Tag filter"
        }
      }
    `);
    const intent = file.declarations[0] as IntentDecl;
    const [term, tags] = intent.params as readonly ParamDecl[];
    expect(term!.type.kind).toBe("PrimitiveType");
    expect(tags!.type.kind).toBe("OptionalType");
  });

  it("parses each query-kind keyword: all, id, string, property", () => {
    const source = ["all", "id", "string", "property"]
      .map(
        (k, i) => `
          entity E${i} {
            display { title: name }
            property name: string { description: "n" }
            query: ${k}
          }
        `
      )
      .join("\n");
    const file = parseOk(source);
    const kinds = file.declarations.map((d) => (d as EntityDecl).query.queryKind);
    expect(kinds).toEqual(["all", "id", "string", "property"]);
  });

  it("parses enum declarations with multiple cases", () => {
    const file = parseOk(`
      enum Priority {
        low
        medium
        high
      }
    `);
    const e = file.declarations[0] as EnumDecl;
    expect(e.kind).toBe("EnumDecl");
    expect(e.cases.map((c) => c.name)).toEqual(["low", "medium", "high"]);
  });

  it("parses summary when and summary switch", () => {
    const file = parseOk(`
      intent Navigate {
        title: "Navigate"
        description: "Starts navigation."
        param destination: string {
          description: "Where to go"
        }
        summary when destination {
          then: "Navigating to \${destination}"
          otherwise: "Navigating"
        }
      }
      intent SetMode {
        title: "Set Mode"
        description: "Changes mode."
        param mode: string {
          description: "Mode"
        }
        summary switch mode {
          case fast: "Fast mode"
          default: "Default mode"
        }
      }
    `);
    const [nav, setMode] = file.declarations as readonly IntentDecl[];
    expect(nav!.summary?.kind).toBe("SummaryWhen");
    expect((nav!.summary as SummaryWhen).param.name).toBe("destination");
    expect(setMode!.summary?.kind).toBe("SummarySwitch");
    expect((setMode!.summary as SummarySwitch).param.name).toBe("mode");
  });

  it("parses a custom public page with safe modules", () => {
    const file = parseOk(`
      page AxintLander {
        title: "Axint"
        tagline: "Compiler-native project pages"
        theme: "black-cream"

        module emailCapture "Join the build" {
          kind: emailCapture
          permission: collectEmail
          privacy: "Used only for Axint updates."
        }

        module shareCard "Launch card" {
          kind: shareCard
          output: "1200x630 PNG"
          source: uploadedArtwork
        }
      }
    `);

    const page = file.declarations[0] as PageDecl;
    expect(page.kind).toBe("PageDecl");
    expect(page.name.name).toBe("AxintLander");
    expect(page.fields.map((field) => field.name.name)).toEqual([
      "title",
      "tagline",
      "theme",
    ]);
    expect(page.modules.map((module) => module.id.name)).toEqual([
      "emailCapture",
      "shareCard",
    ]);
    expect(page.modules[0]!.fields.map((field) => field.name.name)).toEqual([
      "kind",
      "permission",
      "privacy",
    ]);
  });
});

describe("axint-dsl parser — diagnostics", () => {
  it("emits AX003 with insert_required_clause when title is missing", () => {
    const { diagnostics } = parse(`
      intent NoTitle {
        description: "has no title"
      }
    `);
    const ax003 = diagnostics.find((d) => d.code === "AX003");
    expect(ax003).toBeDefined();
    expect(ax003?.fix?.kind).toBe("insert_required_clause");
  });

  it("emits AX004 with insert_required_clause when description is missing", () => {
    const { diagnostics } = parse(`
      intent NoDesc {
        title: "no description"
      }
    `);
    const ax004 = diagnostics.find((d) => d.code === "AX004");
    expect(ax004).toBeDefined();
    expect(ax004?.fix?.kind).toBe("insert_required_clause");
  });

  it("emits AX015 when entity is missing a display block", () => {
    const { diagnostics } = parse(`
      entity Trail {
        property name: string { description: "n" }
        query: all
      }
    `);
    expect(diagnostics.some((d) => d.code === "AX015")).toBe(true);
  });

  it("emits AX017 when entity is missing a query clause", () => {
    const { diagnostics } = parse(`
      entity Trail {
        display { title: name }
        property name: string { description: "n" }
      }
    `);
    expect(diagnostics.some((d) => d.code === "AX017")).toBe(true);
  });

  it("emits AX018 with replace_literal fix for unknown query kind", () => {
    const { diagnostics } = parse(`
      entity Trail {
        display { title: name }
        property name: string { description: "n" }
        query: bogus
      }
    `);
    const ax018 = diagnostics.find((d) => d.code === "AX018");
    expect(ax018).toBeDefined();
    expect(ax018?.fix?.kind).toBe("replace_literal");
    if (ax018?.fix?.kind === "replace_literal") {
      expect(ax018.fix.candidates).toEqual(
        expect.arrayContaining(["all", "id", "string", "property"])
      );
    }
  });

  it("carries diagnostic schema version 1 on every emitted diagnostic", () => {
    const { diagnostics } = parse('intent NoTitle { description: "d" }');
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const d of diagnostics) {
      expect(d.schemaVersion).toBe(1);
      expect(d.severity).toBe("error");
    }
  });
});

describe("axint-dsl parser — recovery", () => {
  it("keeps parsing top-level decls after an unclosed intent body", () => {
    const { file, diagnostics } = parse(`
      intent First {
        title: "first"
        description: "missing closing brace"
      intent Second {
        title: "second"
        description: "survives recovery"
      }
    `);
    expect(file.declarations).toHaveLength(2);
    expect((file.declarations[0] as IntentDecl).name.name).toBe("First");
    expect((file.declarations[1] as IntentDecl).name.name).toBe("Second");
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.schemaVersion === 1)).toBe(true);
  });

  it("end-of-line recovery: malformed title does not cascade into description", () => {
    // Mirrors parser-recovery.md Example 2 — a malformed single-line field
    // should be followed by a clean parse of the next line's field.
    const { file, diagnostics } = parse(`
      intent Foo {
        title: 12345
        description: "A valid description"
      }
    `);
    expect(file.declarations).toHaveLength(1);
    const intent = file.declarations[0] as IntentDecl;
    expect(intent.description.value).toBe("A valid description");
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics.every((d) => d.schemaVersion === 1)).toBe(true);
  });
});
