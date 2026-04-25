/**
 * MCP prompt definitions for Axint.
 *
 * Prompts are reusable agent conversation starters. Each one is
 * returned by ListPromptsRequestSchema (manifest) and resolved to a
 * messages array by GetPromptRequestSchema (template expansion).
 */

export const PROMPT_MANIFEST = [
  {
    name: "axint.quick-start",
    description:
      "Step-by-step guide to compile your first TypeScript intent into " +
      "Swift using Axint. Walks through scaffold → compile → integrate.",
  },
  {
    name: "axint.project-start",
    description:
      "Start an Apple/Xcode project with Axint correctly: read the docs, " +
      "verify MCP servers, then use the compile/check/fix loop before " +
      "writing Apple-native surfaces.",
    arguments: [
      {
        name: "projectName",
        description: "Project name, e.g., 'Swarm'",
        required: false,
      },
      {
        name: "platform",
        description: "Target platform: iOS, macOS, visionOS, or all",
        required: false,
      },
    ],
  },
  {
    name: "axint.create-widget",
    description:
      "Generate a SwiftUI widget from a description. Produces a complete " +
      "widget with timeline provider, entry type, and view body.",
    arguments: [
      {
        name: "widgetName",
        description: "PascalCase widget name, e.g., 'StepsWidget'",
        required: true,
      },
      {
        name: "widgetDescription",
        description: "What the widget displays, e.g., 'daily step count from HealthKit'",
        required: true,
      },
    ],
  },
  {
    name: "axint.create-intent",
    description:
      "Generate a complete App Intent from a natural language description. " +
      "Produces TypeScript source and compiles it to Swift in one step.",
    arguments: [
      {
        name: "intentName",
        description: "PascalCase intent name, e.g., 'SendMessage'",
        required: true,
      },
      {
        name: "intentDescription",
        description: "What the intent does, e.g., 'Send a message to a contact'",
        required: true,
      },
      {
        name: "domain",
        description:
          "Apple domain: messaging, productivity, health, social, finance, " +
          "commerce, media, navigation, smart-home. Omit if none apply.",
        required: false,
      },
    ],
  },
] as const;

type PromptMessages = {
  messages: Array<{
    role: "user";
    content: { type: "text"; text: string };
  }>;
};

export function getPromptMessages(
  name: string,
  args: Record<string, string> | undefined
): PromptMessages {
  if (name === "axint.quick-start") {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "I want to create my first Apple App Intent using Axint. " +
              "Walk me through the process step by step:\n\n" +
              "1. First, use axint.templates.list to show me available templates\n" +
              "2. Pick a simple one and show me its source with axint.templates.get\n" +
              "3. Compile it to Swift with axint.compile\n" +
              "4. Explain what each part of the Swift output does",
          },
        },
      ],
    };
  }

  if (name === "axint.project-start") {
    const projectName = args?.projectName || "this project";
    const platform = args?.platform || "the target Apple platform";
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Start ${projectName} with Axint for ${platform}. Before generating or editing Apple-native code, do this setup pass:\n\n` +
              "1. Read the current Axint docs in this order:\n" +
              "   - https://docs.axint.ai/guides/live-now/\n" +
              "   - https://docs.axint.ai/mcp/xcode/\n" +
              "   - https://docs.axint.ai/guides/xcode-happy-path/\n" +
              "   - https://docs.axint.ai/guides/cloud-check-loop/\n" +
              "   - https://docs.axint.ai/guides/fix-packets/\n" +
              "   - https://docs.axint.ai/reference/cli/\n" +
              "2. List the available MCP servers and confirm both xcode-tools and axint are present.\n" +
              "3. If axint is missing in Xcode, tell me to run `axint xcode setup --agent claude`, restart the Xcode agent session, and ask again for available MCP servers.\n" +
              "4. Use Axint tools before guessing App Intents, widgets, SwiftUI scaffolds, entitlements, Info.plist keys, or repair prompts.\n" +
              "5. Work in short checkpoints. Do not spend 20+ minutes on a task without running Axint and Xcode validation.\n" +
              "6. After each generated Apple surface, run `axint.cloud.check` or `axint cloud check <file> --feedback` and then build in Xcode.\n" +
              "7. Do not claim there is no bug from Axint alone. Cloud Check is static; Xcode build, unit tests, UI tests, accessibility flows, and runtime behavior are separate evidence.\n" +
              "8. If Axint passes but Xcode/tests/runtime fails, report the exact failure as an Axint validator or runtime-coverage gap before continuing.\n\n" +
              "Once that is done, summarize which docs you read, which MCP servers are available, and the first Axint command you will use.",
          },
        },
      ],
    };
  }

  if (name === "axint.create-widget") {
    const widgetName = args?.widgetName || "MyWidget";
    const widgetDescription = args?.widgetDescription || "a simple widget";
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Create a SwiftUI widget called "${widgetName}" that shows ${widgetDescription}. ` +
              "Use axint.schema.compile with type 'widget' to generate the Swift code. " +
              "Include appropriate families, entry fields, and a clean SwiftUI body. " +
              "Show the final Swift output ready to drop into an Xcode project.",
          },
        },
      ],
    };
  }

  if (name === "axint.create-intent") {
    const intentName = args?.intentName || "MyIntent";
    const intentDescription = args?.intentDescription || "a custom action";
    const domain = args?.domain ? ` in the ${args.domain} domain` : "";
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Create an App Intent called "${intentName}" that ${intentDescription}${domain}. ` +
              "Use axint.scaffold to generate the TypeScript source with appropriate parameters, " +
              "then compile it to Swift with axint.compile. Show both the TypeScript input and " +
              "the Swift output so I can see the full pipeline.",
          },
        },
      ],
    };
  }

  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Unknown prompt: ${name}. Use axint.project-start, axint.quick-start, axint.create-widget, or axint.create-intent.`,
        },
      },
    ],
  };
}
