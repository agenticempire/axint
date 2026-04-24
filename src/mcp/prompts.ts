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
          text: `Unknown prompt: ${name}. Use axint.quick-start, axint.create-widget, or axint.create-intent.`,
        },
      },
    ],
  };
}
