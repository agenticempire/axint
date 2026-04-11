# Contributing to Axint

Thanks for considering a contribution to Axint. This guide will get you oriented quickly.

## Before You Start

1. **Open an issue first for large changes.** Bug fixes and new templates can go straight to a PR. But if you're changing the compiler, validator, type system, or MCP server architecture, open an issue or discussion first so we can align on the approach before you invest time.

2. **Check existing issues.** Browse [open issues](https://github.com/agenticempire/axint/issues) — especially those labeled `good first issue` — to find work that's ready to pick up.

## Architecture Overview

Understanding the project structure will save you time:

```
src/
├── core/
│   ├── parser.ts        # Extracts defineIntent() calls → IR
│   ├── generator.ts     # Transforms IR → Swift App Intent source
│   ├── validator.ts     # Validates IR and generated Swift (AX001–AX202)
│   ├── compiler.ts      # Orchestrates the full pipeline
│   ├── types.ts         # IR types, Swift type mappings, diagnostics
│   └── index.ts         # Barrel export
├── sdk/
│   └── index.ts         # defineIntent() API and param helpers (exported from `axint`)
├── mcp/
│   ├── server.ts        # MCP server with axint_compile & axint_validate tools
│   └── index.ts         # Entry point (also serves as axint-mcp binary)
├── templates/
│   └── index.ts         # Intent template registry (templates welcome!)
└── cli/
    └── index.ts         # CLI entry — compile and validate commands
```

**Key data flow:**

```
TypeScript Intent Definition
        ↓
   core/parser.ts      — extracts defineIntent() call → Intermediate Representation (IR)
        ↓
   core/validator.ts   — checks IR against Apple API constraints
        ↓
   core/generator.ts   — generates Swift App Intent source
        ↓
   core/validator.ts   — validates generated Swift (import, conformance, perform)
        ↓
   Swift App Intent
```

## What We're Looking For

### Always Welcome (just open a PR)

- **New intent templates** — Calendar, reminders, messaging, media playback, smart home, health, maps, payments. Each template in `src/templates/` follows a consistent pattern. Look at an existing one and add yours.
- **Documentation** — Better explanations, more examples, typo fixes.
- **Bug fixes** — Especially with a failing test that demonstrates the issue.
- **Test coverage** — We can always use more tests, particularly for edge cases in the compiler and validator.

### Welcome With Prior Discussion (open an issue first)

- **New MCP tools** — Additional tools exposed through the MCP server.
- **Compiler changes** — Modifications to the TypeScript → Swift transformation pipeline.
- **New target surfaces** — Support for SiriKit, Shortcuts, or other Apple execution surfaces beyond App Intents.
- **Dependency additions** — Any new runtime dependency needs justification.

### Redirected to Axint Cloud

Some features are better suited to the commercial layer rather than the open-source core:

- Hosted/cloud compilation services
- Team collaboration features
- Usage analytics and dashboards
- Enterprise SSO/audit logging
- Managed deployment pipelines

If you're interested in contributing to Axint Cloud, reach out at hello@axint.ai.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/agenticempire/axint.git
cd axint

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run the CLI locally
npm run dev -- compile examples/calendar-assistant.ts --stdout
```

## Pull Request Process

1. **Fork and branch.** Create a feature branch from `main`. Use a descriptive name: `feat/smart-home-template`, `fix/parameter-type-marshaling`, `docs/mcp-setup-guide`.

2. **Write tests.** New features need tests. Bug fixes need a test that would have caught the bug. Tests live in `tests/` mirroring the `src/` structure.

3. **Follow existing patterns.** Match the code style you see in the repo. We use Prettier for formatting and ESLint for linting:
   ```bash
   npm run lint
   npm run format
   ```

4. **Keep PRs focused.** One feature or fix per PR. If you find an unrelated issue while working, open a separate PR for it.

5. **Write a clear PR description.** Explain what changed and why. If it's a template, show an example of the TypeScript input and Swift output.

6. **CI must pass.** All tests, linting, and type checks must pass before merge.

## Adding a New Template

Templates are the easiest way to contribute. Here's the pattern:

```typescript
// src/templates/your-template.ts
import type { IntentTemplate } from "../templates/index";

export const yourTemplate: IntentTemplate = {
  id: "your-template",
  name: "Your Template Name",
  description: "What this template does",
  category: "productivity", // e.g., "productivity", "media", "smart-home"
  source: `
import { defineIntent, param } from "@axintai/compiler";

export default defineIntent({
  name: "YourIntent",
  title: "Your Intent Title",
  description: "What this intent does",
  params: {
    // Define parameters here
  },
  perform: async (params) => {
    return { success: true };
  },
});
  `.trim(),
};
```

Then register it in `src/templates/index.ts` by adding it to the `templates` array.

## Code of Conduct

Be respectful. Be constructive. We're building something together. Toxic behavior, harassment, and bad-faith engagement will result in removal from the project.

## Questions?

- **GitHub Discussions** — For architecture questions and ideas
- **Discord** — [Join the server](https://discord.gg/axint) for real-time chat with other contributors
- **hello@axint.ai** — For anything else

---

Thanks for helping build the bridge between agentic AI and Apple.
