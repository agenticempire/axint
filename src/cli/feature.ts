import type { Command } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  generateFeature,
  type FeatureInput,
  type FeatureResult,
  type Surface,
} from "../mcp/feature.js";

const SURFACES = ["intent", "view", "widget"] as const;
const PLATFORMS = ["iOS", "macOS", "visionOS", "all"] as const;

export function registerFeature(program: Command) {
  program
    .command("feature")
    .description("Generate an Apple-native feature package from a description")
    .argument("<description...>", "Feature description")
    .option("--surface <surfaces>", "Comma-separated surfaces: intent,view,widget")
    .option("--name <name>", "Base Swift type name")
    .option("--app-name <name>", "App name for generated metadata")
    .option("--domain <domain>", "Domain hint")
    .option("--platform <platform>", "Target platform", parsePlatform)
    .option("--token-namespace <name>", "Swift design-token namespace")
    .option(
      "--param <name:type>",
      "Explicit parameter. Repeat for multiple params.",
      collectParam,
      [] as string[]
    )
    .option("--write <dir>", "Write generated files into a directory")
    .option("--json", "Emit the full feature result as JSON")
    .action((descriptionParts: string[], options: FeatureOptions) => {
      try {
        const input = buildFeatureInput(descriptionParts, options);
        const result = generateFeature(input);

        if (options.write) {
          writeFeatureFiles(result, options.write);
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                ...result,
                writtenRoot: options.write ? resolve(options.write) : null,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(formatFeatureResult(result, options.write));
      } catch (err: unknown) {
        console.error(`\x1b[31merror:\x1b[0m ${(err as Error).message ?? err}`);
        process.exit(1);
      }
    });
}

type FeatureOptions = {
  surface?: string;
  name?: string;
  appName?: string;
  domain?: string;
  platform?: FeatureInput["platform"];
  tokenNamespace?: string;
  param: string[];
  write?: string;
  json?: boolean;
};

function buildFeatureInput(
  descriptionParts: string[],
  options: FeatureOptions
): FeatureInput {
  const description = descriptionParts.join(" ").trim();
  if (!description) {
    throw new Error("feature requires a description");
  }

  return {
    description,
    surfaces: parseSurfaces(options.surface),
    name: options.name,
    appName: options.appName,
    domain: options.domain,
    params: parseParams(options.param),
    platform: options.platform,
    tokenNamespace: options.tokenNamespace,
  };
}

function parseSurfaces(value: string | undefined): Surface[] | undefined {
  if (!value) return undefined;
  const surfaces = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const surface of surfaces) {
    if (!(SURFACES as readonly string[]).includes(surface)) {
      throw new Error(`invalid surface: ${surface}`);
    }
  }

  return surfaces as Surface[];
}

function parseParams(entries: string[]): Record<string, string> | undefined {
  if (entries.length === 0) return undefined;
  const params: Record<string, string> = {};

  for (const entry of entries) {
    const [name, type, ...rest] = entry.split(":");
    if (!name || !type || rest.length > 0) {
      throw new Error(`invalid param: ${entry} (expected name:type)`);
    }
    params[name] = type;
  }

  return params;
}

function collectParam(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parsePlatform(value: string): FeatureInput["platform"] {
  if ((PLATFORMS as readonly string[]).includes(value)) {
    return value as FeatureInput["platform"];
  }
  throw new Error(`invalid platform: ${value}`);
}

function writeFeatureFiles(result: FeatureResult, root: string) {
  const targetRoot = resolve(root);
  for (const file of result.files) {
    const targetPath = resolve(targetRoot, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, file.content, "utf-8");
  }
}

function formatFeatureResult(
  result: FeatureResult,
  writeRoot: string | undefined
): string {
  const lines = [
    result.summary,
    writeRoot ? `Written: ${resolve(writeRoot)}` : null,
    result.diagnostics.length ? "Diagnostics:" : null,
    ...result.diagnostics.map((diagnostic) => `  ${diagnostic}`),
  ].filter(Boolean) as string[];

  if (writeRoot) return lines.join("\n");

  return [
    ...lines,
    "",
    ...result.files.map((file) => `--- ${file.path} ---\n${file.content.trimEnd()}\n`),
  ].join("\n");
}
