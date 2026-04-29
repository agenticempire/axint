import {
  buildAgentToolProfile,
  renderAgentToolProfile,
  type AxintAgentProfileName,
} from "./agent-profile.js";

export interface AxintDocsContextInput {
  projectName?: string;
  expectedVersion?: string;
  platform?: string;
  agent?: AxintAgentProfileName;
}

export function buildAxintDocsContext(input: AxintDocsContextInput = {}): string {
  const projectName = input.projectName ?? "this Apple project";
  const expectedVersion = input.expectedVersion ?? "the project-pinned version";
  const platform = input.platform ?? "the target Apple platform";
  const profile = buildAgentToolProfile(input.agent);
  const xcodeGuardStep = profile.xcodeToolsAllowed
    ? "`axint.xcode.guard`: writes `.axint/guard/latest.*` so the user can audit whether Axint was used after a long Xcode task."
    : "`axint.workflow.check`: use the active agent profile as the guard. Patch-first clients should not call Xcode-only guard/write tools unless they are actually inside Xcode.";
  const guardLoopStep = profile.xcodeToolsAllowed
    ? "`axint.xcode.guard` proves the Xcode agent is still inside the Axint loop."
    : "`axint.workflow.check` keeps patch-first agents inside the Axint loop without pretending Xcode-only guard proof exists.";
  const writeStep = profile.xcodeToolsAllowed
    ? "`axint.xcode.write` writes Swift files through the guard path and runs validation/Cloud Check immediately."
    : `${profile.defaultWriteAction}; then validate with \`axint.swift.validate\` and \`axint.cloud.check\`.`;

  return `# Axint Docs Context

Project: ${projectName}
Platform: ${platform}
Expected Axint version: ${expectedVersion}
Agent profile: ${profile.label}

This is the project-local docs memory. It exists because agents forget web docs after context compaction. Reload this file at the start of a new chat, after compaction, and before any long Apple-native coding pass.

## Agent Tool Lane

\`\`\`text
${renderAgentToolProfile(profile)}
\`\`\`

## Read Order After Context Loss

When a chat is new, compacted, summarized, or confused, reload context in this order:

1. \`.axint/AXINT_MEMORY.md\`: the compact operating contract.
2. \`.axint/AXINT_REHYDRATE.md\`: the short no-drift recovery contract.
3. \`.axint/AXINT_DOCS_CONTEXT.md\`: this docs context.
4. \`.axint/project.json\`: machine-readable gates and pinned version.
5. \`AGENTS.md\` and \`CLAUDE.md\`: local instructions for the active agent.
6. \`axint.session.start\`: writes \`.axint/session/current.json\` and returns the session token.
7. ${xcodeGuardStep}
8. \`axint.status\`: current MCP version and same-thread reload/setup guidance.
9. \`axint.upgrade\`: use this if the running MCP version is stale so the agent can keep the current thread and reload only the MCP process.
10. \`axint.workflow.check\` with \`stage: "context-recovery"\`, \`sessionToken\`, \`readRehydrationContext: true\`, \`readAgentInstructions: true\`, \`readDocsContext: true\`, and \`ranStatus: true\`.

If any local context file is missing, call \`axint.context.memory\` and \`axint.context.docs\`, then continue from those returned documents.

## Agent Output Contract

Every long-running agent pass should keep a short Axint checkpoint visible:

\`\`\`text
Axint checkpoint: <stage> · <last Axint tool> · <result> · next <Axint/Xcode proof step>
\`\`\`

Examples:

- \`Axint checkpoint: planning · axint.suggest · 3 app-specific surfaces · next axint.feature\`
- \`Axint checkpoint: pre-build · axint.swift.validate + axint.cloud.check · evidence_required · next Xcode UI smoke test\`
- \`Axint checkpoint: runtime · axint.cloud.check with runtimeFailure · AXCLOUD-RUNTIME-FREEZE · next sample main thread\`

If the agent cannot name the current checkpoint, it must stop and run \`axint.workflow.check\`.

${profile.xcodeToolsAllowed ? "For Xcode work, prefer `axint.xcode.guard` as the checkpoint because it creates durable proof under `.axint/guard/latest.*`." : "For patch-first work, the durable proof is the workflow-check report, validator/Cloud Check output, build/test evidence, and the host-native diff. Do not manufacture Xcode guard proof outside Xcode."}

## What Axint Is

Axint is the Apple-native execution layer for AI-built software. It helps agents describe an Apple-native surface once, generate the required Swift and support fragments, validate Apple-specific rules, produce repair guidance, and then prove the result with Xcode.

Use Axint for:

- App Intents for Siri, Shortcuts, Spotlight, widgets, and agent-callable capabilities.
- SwiftUI view and component scaffolds.
- WidgetKit widgets and timeline entries.
- Shared stores that views, intents, and widgets can reference.
- Info.plist and entitlement fragments.
- Design-token ingestion for generated SwiftUI.
- Swift validation, Cloud Check, fix packets, and repair prompts.
- Project startup, context recovery, and workflow gates.
- Local multi-agent memory, file claims, latest proof, latest repair, and privacy-safe learning packets.

## The Axint Authoring Loop

Use this loop before ordinary hand-written Swift:

1. \`axint.status\` confirms the running MCP version.
2. \`axint.upgrade\` checks for a newer package when the running MCP version is stale and returns same-thread reload instructions.
3. \`axint.session.start\` creates a durable token for the current agent pass.
4. ${guardLoopStep}
5. \`axint.context.memory\` reloads compact operating memory when local files are missing.
6. \`axint.context.docs\` reloads this docs context when local files are missing.
7. \`axint.workflow.check\` verifies the agent is at the right gate and has the active token.
8. \`axint.suggest\` proposes relevant Apple-native surfaces from the app description.
9. \`axint.feature\` generates a package of surfaces: intent, view, widget, component, app, store, tests, plist, and entitlements.
10. ${writeStep}
11. \`axint.scaffold\` creates TypeScript \`defineIntent(...)\` source for an App Intent.
12. \`axint.compile\` compiles TypeScript intent source to Swift + Info.plist + entitlements.
13. \`axint.schema.compile\` compiles low-token JSON directly to Swift.
14. \`axint.tokens.ingest\` converts design tokens into SwiftUI token enums.
15. \`axint.swift.validate\` checks changed Swift before Xcode build.
16. \`axint.swift.fix\` applies mechanical Swift repairs when safe.
17. \`axint.cloud.check\` runs coverage-aware Cloud Check with source plus build/test/runtime evidence.
18. \`axint.fix-packet\` reads the latest AI-ready repair packet.
19. \`axint.agent.advice\` and \`axint memory index\` reload the project-local brain after compaction or multi-agent handoff.
20. Xcode build and tests provide runtime proof.

## Axint Language And Input Surfaces

Axint can start from several inputs. Pick the lowest-friction surface that preserves intent:

- TypeScript DSL: \`defineIntent({ name, description, params, perform, ... })\`
- JSON schema: fast low-token route for simple app, view, widget, and intent scaffolds.
- Natural language feature prompt: use \`axint.feature\` for app surfaces and starter files.
- Existing design tokens: use \`axint.tokens.ingest\` before generating views/components.
- Existing project context: pass nearby SwiftUI, token names, and layout notes into \`axint.feature\`.

When building App Intents, prefer scaffold -> validate -> compile:

\`\`\`text
axint.scaffold -> axint.validate -> axint.compile -> axint.swift.validate -> axint.cloud.check -> Xcode build
\`\`\`

When building views/components, prefer token/context-aware generation:

\`\`\`text
axint.tokens.ingest -> axint.suggest -> axint.feature with context -> axint.swift.validate -> axint.cloud.check with evidence -> Xcode build/tests
\`\`\`

## Task Recipes

### New App Intent

1. \`axint.suggest\` if the intent belongs to a broader feature plan.
2. \`axint.scaffold\` with the intent name, description, domain, and params.
3. \`axint.validate\` on the TypeScript source.
4. \`axint.compile\` to Swift + plist + entitlements.
5. \`axint.swift.validate\` on the Swift output.
6. \`axint.cloud.check\` with Xcode build evidence.

### New SwiftUI View Or Component

1. Read design tokens and nearby view patterns.
2. Run \`axint.tokens.ingest\` if tokens are available.
3. Run \`axint.feature\` with \`surface: "view"\` or \`"component"\`, \`platform\`, \`tokenNamespace\`, and local context.
4. Edit only what the generated scaffold cannot know.
5. Run \`axint.swift.validate\`.
6. Run \`axint.cloud.check\` with platform and build/UI-test evidence.

### Runtime Freeze Or Hang

1. Do not trust static pass.
2. Call \`axint.cloud.check\` with \`runtimeFailure\`, expected behavior, actual behavior, platform, and the most suspicious Swift source file.
3. If the app is frozen on macOS, capture a sample or hang trace and feed the shortest useful output back through \`runtimeFailure\`.
4. Look for main-thread blockers, synchronous I/O, infinite loops, lifecycle blockers in \`body\`, \`init\`, \`onAppear\`, \`.task\`, and shared stores.
5. Rerun the exact launch/UI smoke test that reproduced the freeze.

### After Xcode Finds A Bug Axint Missed

1. Run \`axint.cloud.check\` again with the source and Xcode/test/runtime evidence.
2. Write the redacted feedback signal if available.
3. Treat the miss as an Axint coverage gap, not as proof the bug is impossible.

## MCP Tool Map

- \`axint.status\`: running version, uptime, package path, same-thread reload/update help.
- \`axint.upgrade\`: checks or applies a package upgrade, writes \`.axint/upgrade/latest.*\`, and returns a same-thread continuation prompt.
- \`axint.doctor\`: checks version truth, Node/npm/npx paths, MCP config, Xcode Claude config, and project memory files.
- \`axint.session.start\`: starts the enforced session, writes \`.axint/session/current.json\`, and returns the token required by workflow gates.
- \`axint.xcode.guard\`: Xcode-only drift guard that enforces fresh Axint evidence and writes \`.axint/guard/latest.json\` plus \`.axint/guard/latest.md\`.
- \`axint.xcode.write\`: Xcode-only guarded write lane for files inside the project; Codex/Claude/Cursor/Cowork should use their native patch/edit lane unless they are actually running inside Xcode.
- \`axint.project.pack\`: returns first-try project setup files without writing.
- \`axint.context.memory\`: returns compact operating memory for context recovery.
- \`axint.context.docs\`: returns this docs context for context recovery.
- \`axint.workflow.check\`: gates session-start, context-recovery, planning, before-write, pre-build, and pre-commit; requires the active session token by default.
- \`axint.suggest\`: app-description-first suggestions. Domain is a weak hint, not an override.
- \`axint.feature\`: multi-surface feature generation. Use context and tokenNamespace for real projects.
- \`axint.scaffold\`: TypeScript intent source from a description.
- \`axint.validate\`: TypeScript intent validation.
- \`axint.compile\`: TypeScript to Swift + plist + entitlements.
- \`axint.schema.compile\`: JSON to Swift for low-token generation.
- \`axint.tokens.ingest\`: design tokens to SwiftUI token enums.
- \`axint.swift.validate\`: Swift static validation with AX diagnostic codes.
- \`axint.swift.fix\`: safe mechanical Swift fixes.
- \`axint.cloud.check\`: agent-callable Cloud Check with ship gate.
- \`axint.fix-packet\`: latest repair packet.
- \`axint.templates.list\` and \`axint.templates.get\`: bundled reference templates.

## Workflow Gates

Use \`axint.workflow.check\` at these stages:

- \`session-start\`: requires \`axint.session.start\`, rehydration file, project memory and docs context, then status.
- \`context-recovery\`: after new chat, summary, compaction, or drift.
- \`planning\`: requires \`axint.suggest\` before choosing surfaces.
- \`before-write\`: requires \`axint.feature\` or an explicit reason it is not useful.
- \`pre-build\`: requires Swift validation and Cloud Check.
- \`pre-commit\`: requires validation, Cloud Check, build evidence, and focused tests when relevant.

A \`ready\` workflow check is not the last Axint step. The report includes \`Next Axint Action\`; call that action before returning to broad Apple-native edits.

## Cloud Check Rules

Cloud Check is not a rubber stamp. It should return a ship gate:

- \`fix_required\`: diagnostics must be fixed.
- \`evidence_required\`: static checks passed, but runtime/UI/build evidence is missing.
- \`ready_for_build\`: static checks are clear; build proof still matters.
- \`ready_to_ship\`: static checks plus relevant evidence passed.

Do not claim a bug is fixed from static checks alone. For SwiftUI and app behavior, include Xcode build logs, UI test results, runtime failure text, expected behavior, and actual behavior when calling Cloud Check.

When the app freezes, hangs, beachballs, launch-tests time out, or UI is unresponsive, pass that as \`runtimeFailure\`. Cloud Check should classify runtime evidence into concrete diagnostics such as runtime freeze, main-thread blocker, lifecycle blocker, synchronous I/O, or unclassified runtime evidence.

## Xcode Rules

Inside Xcode Claude or another Xcode agent:

1. Confirm both \`xcode-tools\` and \`axint\` MCP servers are available.
2. If Axint is missing, run the setup command in a normal terminal, then reload or reconnect the Axint MCP server/tool process.
3. If npm/npx is missing in Xcode's restricted PATH, use the durable Homebrew path in \`.mcp.json\`.
4. Always call \`axint.status\` after reload to verify the active version.
5. Xcode build/test failures are Axint feedback if Axint passed the same code.

## Setup Commands

Typical project setup:

\`\`\`bash
npm install -g @axint/compiler
axint xcode install --project .
axint project init --dir /path/to/App --name AppName --agent claude --force
\`\`\`

If Xcode cannot find \`npx\`, configure the project MCP file with an absolute command such as \`/opt/homebrew/bin/npx\` or \`/usr/local/bin/npx\`.

## Context Recovery Prompt

\`\`\`text
Call axint.session.start for this project and keep the returned sessionToken. Read .axint/AXINT_REHYDRATE.md, .axint/AXINT_MEMORY.md, .axint/AXINT_DOCS_CONTEXT.md, AGENTS.md, CLAUDE.md, and .axint/project.json. If any are missing, call axint.context.memory and axint.context.docs. Then list MCP servers, call axint.status, call axint.workflow.check with stage context-recovery, sessionToken=<token>, readRehydrationContext=true, readAgentInstructions=true, readDocsContext=true, and ranStatus=true, and tell me the next Axint tool you will use before editing code.
\`\`\`

## Runtime Freeze Prompt

\`\`\`text
The app opens and freezes. Do not treat a static Cloud Check pass as runtime proof. Read .axint/AXINT_DOCS_CONTEXT.md, identify the most suspicious Swift file involved in launch or the frozen screen, then call axint.cloud.check with platform, source/sourcePath, runtimeFailure, expectedBehavior, and actualBehavior. If Cloud Check returns AXCLOUD-RUNTIME-FREEZE, inspect main-thread blockers and collect a macOS sample/hang trace before editing.
\`\`\`

## Do Not Forget

- Axint first, ordinary Swift second.
- Docs context must be reloaded after compaction.
- The model's memory is not the source of truth; project files are.
- Validation is not runtime proof.
- If Axint misses a real issue, log it as a coverage gap so the machine gets better.
`;
}
