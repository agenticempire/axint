export interface AxintRehydrationInput {
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
  sessionToken?: string;
}

export function buildAxintRehydrationGuide(input: AxintRehydrationInput = {}): string {
  const projectName = input.projectName ?? "this Apple project";
  const expectedVersion = input.expectedVersion ?? "the project-pinned version";
  const platform = input.platform ?? "the target Apple platform";
  const tokenLine = input.sessionToken
    ? `Active session token: ${input.sessionToken}`
    : "Active session token: call axint.session.start to create one";

  return `# Axint Rehydration Contract

Project: ${projectName}
Platform: ${platform}
Expected Axint version: ${expectedVersion}
${tokenLine}

This file is the shortest durable recovery contract for an AI agent working on this project. Read it after every new chat, context compaction, MCP restart, long coding drift, or failed build/test where Axint was not clearly involved.

## Non-Negotiable Rule

The model's memory is not the source of truth. These project files are. If the agent cannot name the active Axint checkpoint, it must stop and rehydrate before editing Apple-native code.

## Rehydrate In This Exact Order

1. Call \`axint.session.start\` for this project and keep the returned \`sessionToken\`.
2. Call \`axint.xcode.guard\` with \`stage: "context-recovery"\` so this chat writes \`.axint/guard/latest.*\` proof.
3. Read \`.axint/AXINT_REHYDRATE.md\`, \`.axint/AXINT_MEMORY.md\`, and \`.axint/AXINT_DOCS_CONTEXT.md\`.
4. Read \`AGENTS.md\`, \`CLAUDE.md\`, or \`.axint/project.json\` if present.
5. Call \`axint.status\` and report the running MCP version.
6. Call \`axint.workflow.check\` with:

\`\`\`json
{
  "stage": "context-recovery",
  "sessionStarted": true,
  "sessionToken": "<token>",
  "readRehydrationContext": true,
  "readAgentInstructions": true,
  "readDocsContext": true,
  "ranStatus": true
}
\`\`\`

7. State the next Axint tool before editing code.

## Required Checkpoints

- Planning: \`axint.workflow.check\` with \`stage: "planning"\` and \`ranSuggest: true\`.
- New surface: \`axint.workflow.check\` with \`stage: "before-write"\`, \`ranSuggest: true\`, and either \`ranFeature: true\` or a real \`featureBypassReason\`.
- Long Xcode task: \`axint.xcode.guard\` with the current \`stage\` before starting and again before claiming done.
- New Swift file: prefer \`axint.xcode.write\` so the write runs validation, Cloud Check, and guard proof immediately.
- Before build: prefer \`axint.run\` for the full enforced loop. If doing it manually, call \`axint.workflow.check\` with \`stage: "pre-build"\`, \`ranSwiftValidate: true\`, and \`ranCloudCheck: true\`.
- Before done: \`axint.workflow.check\` with \`stage: "pre-commit"\`, validation, Cloud Check, build evidence, and relevant tests.

## Drift Triggers

Rehydrate immediately if any of these are true:

- The chat was compacted, summarized, restarted, or opened as a new chat.
- The agent says Axint is unavailable, stale, or it is unsure what MCP tools exist.
- The agent has been coding for a long block without \`axint.xcode.guard\`, \`axint.xcode.write\`, \`axint.suggest\`, \`axint.feature\`, \`axint.swift.validate\`, \`axint.cloud.check\`, \`axint.run\`, or \`axint.workflow.check\`.
- Xcode, UI tests, previews, accessibility, or runtime behavior fail after Axint returned a static pass.
- The task touches App Intents, SwiftUI views/components, widgets, shared stores, plist, entitlements, design tokens, or Xcode repair loops.

## Agent Checkpoint Sentence

Every long response should keep this visible:

\`\`\`text
Axint checkpoint: <stage> · <last Axint tool> · <result> · next <proof step>
\`\`\`

If the agent cannot fill that line honestly, it must run \`axint.xcode.guard\` or \`axint.workflow.check\` before continuing.
`;
}
