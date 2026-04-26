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
    name: "axint.context-recovery",
    description:
      "Recover the Axint workflow after a new Xcode chat, context compaction, " +
      "or a long coding drift. Re-reads project instructions, checks version, " +
      "and forces the next Axint tool before edits continue.",
    arguments: [
      {
        name: "projectName",
        description: "Project name, e.g., 'Swarm'",
        required: false,
      },
      {
        name: "lastTask",
        description: "Optional last task or file area the agent was working on",
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
              "2. Call `axint.session.start` and keep the returned `sessionToken` visible.\n" +
              "3. List the available MCP servers and confirm both xcode-tools and axint are present.\n" +
              "4. Call `axint.status` and report the running MCP server version before editing code. If the version is older than expected, stop and tell me to update Axint, rerun `axint xcode setup --agent claude`, and restart the Xcode agent chat.\n" +
              "5. If axint is missing in Xcode, tell me to run `axint xcode setup --agent claude`, restart the Xcode agent session, and ask again for available MCP servers.\n" +
              "6. Call `axint.workflow.check` with `sessionToken` at planning, before-write, and pre-build checkpoints so you do not skip the Axint loop by accident.\n" +
              "7. Use Axint tools before guessing App Intents, widgets, SwiftUI scaffolds, entitlements, Info.plist keys, or repair prompts.\n" +
              "8. Work in short checkpoints. Do not spend 20+ minutes on a task without running Axint and Xcode validation.\n" +
              "9. After each generated Apple surface, run `axint.cloud.check` or `axint cloud check <file> --feedback` and then build in Xcode.\n" +
              "10. Do not claim there is no bug from Axint alone. Cloud Check is static; Xcode build, unit tests, UI tests, accessibility flows, and runtime behavior are separate evidence.\n" +
              "11. If Axint passes but Xcode/tests/runtime fails, report the exact failure as an Axint validator or runtime-coverage gap before continuing.\n\n" +
              "If this chat was compacted or restarted, run axint.context-recovery before continuing.\n\n" +
              "Once that is done, summarize which docs you read, the running Axint MCP version, which MCP servers are available, and the first Axint command you will use.",
          },
        },
      ],
    };
  }

  if (name === "axint.context-recovery") {
    const projectName = args?.projectName || "this project";
    const lastTask = args?.lastTask ? ` The last known task was: ${args.lastTask}.` : "";
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Recover the Axint workflow for ${projectName}.${lastTask}\n\n` +
              "Assume this chat may have lost context. Before editing code or continuing the prior task:\n\n" +
              "1. Call axint.session.start and keep the returned sessionToken.\n" +
              "2. Read .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json if they exist.\n" +
              "3. If those files are missing, call axint.context.memory and axint.context.docs, then use them as the compact Axint operating memory and docs context.\n" +
              "4. List the available MCP servers/tools and confirm axint is present.\n" +
              "5. Call axint.status and report the running Axint MCP version.\n" +
              "6. Call axint.workflow.check with stage `context-recovery`, sessionToken, readAgentInstructions=true, readDocsContext=true, and ranStatus=true.\n" +
              "7. If Axint is missing or stale, stop and give the exact setup/restart command instead of continuing by hand.\n" +
              "8. Name the next Axint tool you will use before editing code.\n" +
              "9. Do not claim a bug is fixed until Axint validation, Cloud Check, Xcode build, and relevant tests/runtime evidence support it.\n\n" +
              "Output a short recovery report with: files read, Axint version, available MCP servers, workflow gate result, and next Axint action.",
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
          text: `Unknown prompt: ${name}. Use axint.project-start, axint.context-recovery, axint.quick-start, axint.create-widget, or axint.create-intent.`,
        },
      },
    ],
  };
}
