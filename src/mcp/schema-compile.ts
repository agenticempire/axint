/**
 * JSON-schema → Swift path for axint.schema.compile.
 *
 * Accepts a minimal JSON description of an intent, view, widget, or app
 * and runs it through the same IR compilers the TypeScript DSL uses.
 * Token-efficient alternative to writing defineIntent() source.
 */

import {
  compileFromIR,
  compileViewFromIR,
  compileWidgetFromIR,
  compileAppFromIR,
} from "../core/compiler.js";
import { formatSwift } from "../core/format.js";
import type {
  IRIntent,
  IRView,
  IRWidget,
  IRWidgetEntry,
  IRApp,
  IRScene,
  IRViewState,
  IRViewProp,
  IRParameter,
  IRType,
  WidgetFamily,
  WidgetRefreshPolicy,
  SceneKind,
} from "../core/types.js";
import { isPrimitiveType, isSceneKind } from "../core/types.js";

export type SchemaCompileArgs = {
  type: "intent" | "view" | "widget" | "app";
  name: string;
  title?: string;
  description?: string;
  domain?: string;
  params?: Record<string, string>;
  props?: Record<string, string>;
  state?: Record<string, { type: string; default?: unknown }>;
  body?: string;
  displayName?: string;
  families?: string[];
  entry?: Record<string, string>;
  refreshInterval?: number;
  scenes?: Array<{
    kind: string;
    view: string;
    title?: string;
    name?: string;
    platform?: string;
  }>;
  format?: boolean;
};

const VALID_PLATFORMS = new Set<string>(["macOS", "iOS", "visionOS"]);

type Platform = "macOS" | "iOS" | "visionOS";

function isPlatform(s: string): s is Platform {
  return VALID_PLATFORMS.has(s);
}

function toPlatformGuard(platform: string | undefined): Platform | undefined {
  return platform && isPlatform(platform) ? platform : undefined;
}

function toSceneKind(kind: string | undefined): SceneKind {
  const k = kind || "windowGroup";
  return isSceneKind(k) ? k : "windowGroup";
}

function schemaTypeToIRType(typeStr: string): IRType {
  const normalized = typeStr === "number" ? "int" : typeStr;
  if (isPrimitiveType(normalized)) {
    return { kind: "primitive", value: normalized };
  }
  return { kind: "primitive", value: "string" };
}

export async function handleCompileFromSchema(args: SchemaCompileArgs) {
  try {
    const inputJson = JSON.stringify(args);
    const inputTokens = Math.ceil(inputJson.length / 4);
    const shouldFormat = args.format !== false;

    if (args.type === "intent") {
      return handleIntentSchema(args, inputTokens, shouldFormat);
    } else if (args.type === "view") {
      return handleViewSchema(args, inputTokens, shouldFormat);
    } else if (args.type === "widget") {
      return handleWidgetSchema(args, inputTokens, shouldFormat);
    } else if (args.type === "app") {
      return handleAppSchema(args, inputTokens, shouldFormat);
    }

    return {
      content: [{ type: "text" as const, text: `Invalid type: ${args.type}` }],
      isError: true,
    };
  } catch (err: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Schema compilation error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleIntentSchema(
  args: SchemaCompileArgs,
  inputTokens: number,
  shouldFormat: boolean
) {
  if (!args.name) {
    return {
      content: [
        { type: "text" as const, text: "[AX002] error: Schema requires a 'name' field" },
      ],
      isError: true,
    };
  }
  if (!args.title && !args.name) {
    return {
      content: [
        { type: "text" as const, text: "[AX003] error: Schema requires a 'title' field" },
      ],
      isError: true,
    };
  }

  const parameters: IRParameter[] = [];
  if (args.params) {
    for (const [name, typeStr] of Object.entries(args.params)) {
      parameters.push({
        name,
        type: schemaTypeToIRType(typeStr),
        title: name.replace(/([A-Z])/g, " $1").trim(),
        description: "",
        isOptional: false,
      });
    }
  }

  const ir: IRIntent = {
    name: args.name,
    title: args.title || args.name.replace(/([A-Z])/g, " $1").trim(),
    description: args.description || "",
    domain: args.domain,
    parameters,
    returnType: { kind: "primitive", value: "string" },
    sourceFile: "<schema>",
  };

  const result = compileFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens, shouldFormat);
}

async function handleViewSchema(
  args: SchemaCompileArgs,
  inputTokens: number,
  shouldFormat: boolean
) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX301] error: View schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }

  const props: IRViewProp[] = [];
  if (args.props) {
    for (const [name, typeStr] of Object.entries(args.props)) {
      props.push({
        name,
        type: schemaTypeToIRType(typeStr),
        isOptional: false,
      });
    }
  }

  const state: IRViewState[] = [];
  if (args.state) {
    for (const [name, stateConfig] of Object.entries(args.state)) {
      state.push({
        name,
        type: schemaTypeToIRType(stateConfig.type || "string"),
        kind: "state",
        defaultValue: stateConfig.default,
      });
    }
  }

  const ir: IRView = {
    name: args.name,
    props,
    state,
    body: args.body
      ? [{ kind: "raw", swift: args.body }]
      : [{ kind: "text", content: "VStack {}" }],
    sourceFile: "<schema>",
  };

  const result = compileViewFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens, shouldFormat);
}

async function handleWidgetSchema(
  args: SchemaCompileArgs,
  inputTokens: number,
  shouldFormat: boolean
) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX402] error: Widget schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }
  if (!args.displayName) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX403] error: Widget schema requires a 'displayName' field",
        },
      ],
      isError: true,
    };
  }

  const entries: IRWidgetEntry[] = [];
  if (args.entry) {
    for (const [name, typeStr] of Object.entries(args.entry)) {
      entries.push({
        name,
        type: schemaTypeToIRType(typeStr),
      });
    }
  }

  const validFamilies = new Set<string>([
    "systemSmall",
    "systemMedium",
    "systemLarge",
    "systemExtraLarge",
    "accessoryCircular",
    "accessoryRectangular",
    "accessoryInline",
  ]);
  const families: WidgetFamily[] = (args.families || ["systemSmall"]).filter(
    (f: string): f is WidgetFamily => validFamilies.has(f)
  );

  let refreshPolicy: WidgetRefreshPolicy = "atEnd";
  if (args.refreshInterval) {
    refreshPolicy = "after";
  }

  const ir: IRWidget = {
    name: args.name,
    displayName: args.displayName || args.name.replace(/([A-Z])/g, " $1").trim(),
    description: args.description || "",
    families,
    entry: entries,
    body: args.body
      ? [{ kind: "raw", swift: args.body }]
      : [{ kind: "text", content: "Hello" }],
    refreshInterval: args.refreshInterval,
    refreshPolicy,
    sourceFile: "<schema>",
  };

  const result = compileWidgetFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens, shouldFormat);
}

async function handleAppSchema(
  args: SchemaCompileArgs,
  inputTokens: number,
  shouldFormat: boolean
) {
  if (!args.name) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX502] error: App schema requires a 'name' field",
        },
      ],
      isError: true,
    };
  }
  if (!args.scenes || args.scenes.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "[AX503] error: App schema requires at least one scene",
        },
      ],
      isError: true,
    };
  }

  const scenes: IRScene[] = [];
  if (args.scenes) {
    for (const s of args.scenes) {
      scenes.push({
        sceneKind: toSceneKind(s.kind),
        rootView: s.view,
        title: s.title,
        name: s.name,
        platformGuard: toPlatformGuard(s.platform),
        isDefault: scenes.length === 0 && (s.kind || "windowGroup") === "windowGroup",
      });
    }
  }

  if (scenes.length === 0) {
    scenes.push({
      sceneKind: "windowGroup",
      rootView: "ContentView",
      isDefault: true,
    });
  }

  const ir: IRApp = {
    name: args.name,
    scenes,
    sourceFile: "<schema>",
  };

  const result = compileAppFromIR(ir);
  if (!result.success || !result.output) {
    const errorText = result.diagnostics
      .map((d) => `[${d.code}] ${d.severity}: ${d.message}`)
      .join("\n");
    return {
      content: [{ type: "text" as const, text: errorText }],
      isError: true,
    };
  }

  return formatSchemaOutput(result.output.swiftCode, inputTokens, shouldFormat);
}

async function formatSchemaOutput(
  swiftCode: string,
  inputTokens: number,
  shouldFormat: boolean
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const swift = shouldFormat ? (await formatSwift(swiftCode)).formatted : swiftCode;
  const outputTokens = Math.ceil(swift.length / 4);
  const compressionRatio =
    inputTokens > 0 ? (outputTokens / inputTokens).toFixed(2) : "0.00";
  const tokensSaved = inputTokens - outputTokens;

  const tokenStats = `
// ─── Token Statistics ────────────────────────────────────────
// Input tokens (JSON schema):     ~${inputTokens}
// Output tokens (Swift code):     ~${outputTokens}
// Compression ratio:              ${compressionRatio}x
// Tokens saved:                   ${tokensSaved > 0 ? `+${tokensSaved}` : tokensSaved}
`;

  const output = tokenStats + "\n\n" + swift;
  return { content: [{ type: "text" as const, text: output }] };
}
