export interface AxintOperatingMemoryInput {
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
}

export function buildAxintOperatingMemory(input: AxintOperatingMemoryInput = {}): string {
  const projectName = input.projectName ?? "this Apple project";
  const expectedVersion = input.expectedVersion ?? "the project-pinned version";
  const platform = input.platform ?? "the target Apple platform";

  return `# Axint Operating Memory

Project: ${projectName}
Platform: ${platform}
Expected Axint version: ${expectedVersion}

This file is the compact Axint memory for agents. Read it with \`.axint/AXINT_REHYDRATE.md\` and \`.axint/AXINT_DOCS_CONTEXT.md\` at the start of every new chat, after context compaction, and before any long Apple-native implementation pass.

## Default Posture

Axint is the default Apple-native workflow for this project. Do not silently fall back to ordinary Swift/Xcode coding for App Intents, widgets, SwiftUI scaffolds, shared stores, entitlements, Info.plist fragments, repair prompts, or Cloud Check loops.

Work in Axint first:

1. Start the pass with \`axint.session.start\` and keep the returned \`sessionToken\`.
2. Gate each stage with \`axint.workflow.check\` and the active \`sessionToken\`.
3. Plan with \`axint.suggest\`.
4. Generate or scaffold with \`axint.feature\`, \`axint.scaffold\`, \`axint.compile\`, or \`axint.schema.compile\`.
5. Prefer \`axint.run\` when you need the whole loop in one call. It starts/refreshes the session, validates, Cloud Checks, builds/tests with \`xcodebuild\`, and writes \`.axint/run/latest.*\`.
6. In Xcode, call \`axint.xcode.guard\` before long tasks, after context recovery, and whenever the agent might drift. It writes \`.axint/guard/latest.*\` so the user can audit whether Axint was actually used.
7. Prefer \`axint.xcode.write\` for new Swift files so the write itself runs Swift validation, Cloud Check, and guard proof.
8. If running tools manually, validate changed Swift with \`axint.swift.validate\`.
9. Run \`axint.cloud.check\` with source and any Xcode/test/runtime evidence.
10. Build and test with Xcode or \`axint run\`.
11. If Axint passes but Xcode, UI tests, accessibility, or runtime behavior fails, report that as an Axint coverage gap before continuing.

## Context Recovery

Models lose memory when chats compact. The project does not. When context is missing, compacted, or uncertain:

1. Call \`axint.session.start\` and keep the returned \`sessionToken\`.
2. Call \`axint.xcode.guard\` with \`stage: "context-recovery"\` so this chat writes durable guard proof.
3. Read \`.axint/AXINT_REHYDRATE.md\`, this file, \`.axint/AXINT_DOCS_CONTEXT.md\`, \`AGENTS.md\`, \`CLAUDE.md\`, and \`.axint/project.json\`.
4. If the docs context file is missing, call \`axint.context.docs\`.
5. List MCP servers/tools and confirm \`axint\` is present.
6. Call \`axint.status\` and compare the running MCP version with the expected version above.
7. Call \`axint.workflow.check\` with \`stage: "context-recovery"\`, \`sessionToken\`, \`readRehydrationContext: true\`, \`readAgentInstructions: true\`, \`readDocsContext: true\`, and \`ranStatus: true\`.
8. Name the next Axint tool before editing code.

If Axint is missing or stale, stop. Do not continue by hand. Tell the user to reinstall/update Axint, rerun the Xcode setup, and restart the Xcode agent chat.

## Drift Guard

Do not spend more than 10 minutes or make broad multi-file Swift changes without an Axint checkpoint. A checkpoint means one of:

- \`axint.workflow.check\`
- \`axint.xcode.guard\`
- \`axint.xcode.write\`
- \`axint.session.start\`
- \`axint.suggest\`
- \`axint.feature\`
- \`axint.swift.validate\`
- \`axint.cloud.check\`
- \`axint.run\`
- Xcode build/test evidence tied back to the Axint report

Every long-running response should keep this visible:

\`\`\`text
Axint checkpoint: <stage> · <last Axint tool> · <result> · next <proof step>
\`\`\`

If the agent cannot fill this out, it must run \`axint.workflow.check\` before continuing.

For Xcode work, prefer \`axint.xcode.guard\` as the checkpoint because it writes durable proof under \`.axint/guard/latest.*\`.

## Proof Rules

- Static validation is not runtime proof.
- Cloud Check must say what it checked and what it did not check.
- For SwiftUI and app behavior, use Xcode build, focused tests, UI smoke tests, previews, or runtime evidence.
- Do not claim a bug is fixed until validation plus relevant runtime evidence supports it.
- For freezes, hangs, beachballs, launch timeouts, and unresponsive UI, prefer \`axint run --runtime\` on macOS or call \`axint.cloud.check\` with \`runtimeFailure\`, \`expectedBehavior\`, \`actualBehavior\`, platform, and the suspicious source file.
- If Axint returns a clean static pass but the app still freezes, the next action is runtime evidence, not more ordinary coding.

## Docs To Refresh When Needed

- https://docs.axint.ai/guides/live-now/
- https://docs.axint.ai/mcp/xcode/
- https://docs.axint.ai/guides/xcode-happy-path/
- https://docs.axint.ai/guides/cloud-check-loop/
- https://docs.axint.ai/guides/fix-packets/
- https://docs.axint.ai/reference/cli/

## Recovery Prompt

\`\`\`text
Call axint.xcode.guard with stage=context-recovery, then call axint.session.start if the guard asks for it and keep the returned sessionToken. Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json. If docs context is missing, call axint.context.docs. Then list MCP servers, call axint.status, call axint.workflow.check with stage context-recovery, sessionToken=<token>, readRehydrationContext=true, readAgentInstructions=true, readDocsContext=true, and ranStatus=true. For build/test/runtime proof, use axint.run instead of manually remembering every Axint gate.
\`\`\`
`;
}
