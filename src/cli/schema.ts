import type { Command } from "commander";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  handleCompileFromSchema,
  type SchemaCompileArgs,
} from "../mcp/schema-compile.js";

type SchemaType = SchemaCompileArgs["type"];
type SchemaPlatform = NonNullable<SchemaCompileArgs["platform"]>;

const SCHEMA_TYPES = ["intent", "view", "widget", "app", "component"] as const;
const PLATFORMS = ["iOS", "macOS", "visionOS", "all"] as const;

export function registerSchema(program: Command) {
  const schema = program
    .command("schema")
    .description("Compile compact JSON schemas into Swift surfaces");

  schema
    .command("compile")
    .description("Compile an intent, view, widget, app, or component schema")
    .argument("<file>", "JSON schema file, or - for stdin")
    .option("--type <type>", "Override schema type", parseSchemaType)
    .option("--name <name>", "Override generated Swift type name")
    .option("--platform <platform>", "Target platform", parsePlatform)
    .option("--token-namespace <name>", "Swift design-token namespace")
    .option("--component-kind <kind>", "Component blueprint kind")
    .option("--out <file>", "Write Swift output to a file")
    .option("--json", "Emit a JSON envelope instead of raw Swift")
    .option("--raw", "Skip Swift formatting")
    .action(async (file: string, options: SchemaCompileOptions) => {
      try {
        const input = readSchemaInput(file);
        const parsed = parseSchemaInput(input);
        const args = buildSchemaArgs(parsed, options);
        const result = await handleCompileFromSchema(args);
        const output = result.content[0]?.text ?? "";

        if (result.isError) {
          console.error(output);
          process.exit(1);
        }

        if (options.out) {
          const outPath = resolve(options.out);
          mkdirSync(dirname(outPath), { recursive: true });
          writeFileSync(outPath, output, "utf-8");
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ok: true,
                type: args.type,
                name: args.name,
                output,
                written: options.out ? resolve(options.out) : null,
              },
              null,
              2
            )
          );
          return;
        }

        if (options.out) {
          console.log(`Wrote ${resolve(options.out)}`);
          return;
        }

        console.log(output);
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}

type SchemaCompileOptions = {
  type?: SchemaType;
  name?: string;
  platform?: SchemaPlatform;
  tokenNamespace?: string;
  componentKind?: string;
  out?: string;
  json?: boolean;
  raw?: boolean;
};

function readSchemaInput(file: string): string {
  if (file === "-") {
    return readFileSync(0, "utf-8");
  }
  return readFileSync(resolve(file), "utf-8");
}

function parseSchemaInput(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("schema input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function buildSchemaArgs(
  parsed: Record<string, unknown>,
  options: SchemaCompileOptions
): SchemaCompileArgs {
  const args = { ...parsed } as Partial<SchemaCompileArgs>;

  if (options.type) args.type = options.type;
  if (options.name) args.name = options.name;
  if (options.platform) args.platform = options.platform;
  if (options.tokenNamespace) args.tokenNamespace = options.tokenNamespace;
  if (options.componentKind) args.componentKind = options.componentKind;
  if (options.raw) args.format = false;
  else if (typeof args.format !== "boolean") args.format = true;

  if (!args.type) {
    throw new Error("schema requires a type: intent, view, widget, app, or component");
  }
  if (!SCHEMA_TYPES.includes(args.type)) {
    throw new Error(`invalid schema type: ${String(args.type)}`);
  }

  return args as SchemaCompileArgs;
}

function parseSchemaType(value: string): SchemaType {
  if ((SCHEMA_TYPES as readonly string[]).includes(value)) {
    return value as SchemaType;
  }
  throw new Error(`invalid schema type: ${value}`);
}

function parsePlatform(value: string): SchemaPlatform {
  if ((PLATFORMS as readonly string[]).includes(value)) {
    return value as SchemaPlatform;
  }
  throw new Error(`invalid platform: ${value}`);
}
