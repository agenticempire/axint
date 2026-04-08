# Contributing to Axint

Thanks for considering a contribution to Axint. This guide will get you oriented quickly.

## Before You Start

1. **Sign the CLA.** Every contributor must sign the [Contributor License Agreement](CLA.md) before their first PR is merged. This is a one-time step — our CLA bot will guide you through it on your first pull request.

2. **Open an issue first for large changes.** Bug fixes and new templates can go straight to a PR. But if you're changing the compiler, validator, type system, or MCP server architecture, open an issue or discussion first so we can align on the approach before you invest time.

3. **Check existing issues.** Browse [open issues](https://github.com/AgenticEmpire/axint/issues) — especially those labeled `good first issue` — to find work that's ready to pick up.

## Architecture Overview

Understanding the project structure will save you time:

```
src/
├── core/
│   ├── compiler.ts      # TypeScript → Swift AST transformation
│   ├── validator.ts      # Validates generated Swift against Apple API constraints
│   ├── types.ts          # Intent type system (param types, return types, mappings)
│   └── codegen.ts        # Swift code generation from AST
├── mcp/
│   ├── server.ts         # MCP server entry point
│   ├── tools/
│   │   ├── scaffold.ts   # axint_scaffold — generate from natural language
│   │   ├── compile.ts    # axint_compile — TS → Swift
│   │   ├── validate.ts   # axint_validate — check correctness
│   │   └── templates.ts  # axint_templates — list available templates
│   └── index.ts
├── templates/
│   ├── calendar.ts       # Calendar/reminders intent template
│   ├── messaging.ts      # Messaging intent template
│   └── ...               # More templates welcome!
└── cli/
    ├── index.ts          # CLI entry point
    └── commands/         # init, compile, validate subcommands
```

**Key data flow:**

```
TypeScript Intent Definition
        ↓
   core/compiler.ts    — parses and transforms to intermediate AST
        ↓
   core/validator.ts   — checks against Apple API constraints
        ↓
   core/codegen.ts     — generates Swift source
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
git clone https://github.com/AgenticEmpire/axint.git
cd axint

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run the CLI locally
npm run dev -- compile src/intents/example.ts

# Run the MCP server locally
npm run dev -- mcp serve
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
import { IntentTemplate } from "../core/types";

export const yourTemplate: IntentTemplate = {
  id: "your-template",
  name: "Your Template Name",
  description: "What this template does",
  category: "category", // e.g., "productivity", "media", "smart-home"
  params: [
    // Define the parameters this intent accepts
  ],
  scaffoldHints: [
    // Natural language descriptions that should trigger this template
    // Used by axint_scaffold to match user intent to template
  ],
};
```

Then add a test in `tests/templates/your-template.test.ts` and register it in `src/templates/index.ts`.

## Code of Conduct

Be respectful. Be constructive. We're building something together. Toxic behavior, harassment, and bad-faith engagement will result in removal from the project.

## Questions?

- **GitHub Discussions** — For architecture questions and ideas
- **Discord** — For real-time chat with other contributors
- **hello@axint.ai** — For anything else

---

Thanks for helping build the bridge between agentic AI and Apple.
