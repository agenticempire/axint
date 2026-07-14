# Axint — Claude Code Plugin

Compile, validate, repair, and prove Apple-native Swift surfaces from Claude Code.

## Install

```
/plugin install axint
```

Or add the marketplace:

```
/plugin marketplace add agenticempire/axint
```

## What You Get

The integration exposes the MCP tools and built-in prompts from the installed Axint release:

- Project and session tools: `axint.status`, `axint.upgrade`, `axint.doctor`, `axint.session.start`, `axint.project.pack`, `axint.project.index`, `axint.project.syncVersion`
- Apple generation tools: `axint.feature`, `axint.suggest`, `axint.scaffold`, `axint.compile`, `axint.schema.compile`
- Proof and repair tools: `axint.validate`, `axint.swift.validate`, `axint.swift.fix`, `axint.fix-packet`, `axint.cloud.check`, `axint.repair`, `axint.run`
- Xcode and workflow tools: `axint.xcode.guard`, `axint.xcode.write`, `axint.workflow.check`, `axint.run.status`, `axint.run.cancel`
- Context and ecosystem tools: `axint.context.memory`, `axint.context.docs`, `axint.registry.search`, `axint.templates.list`, `axint.templates.get`, `axint.feedback.create`, `axint.tokens.ingest`

Built-in prompts: `axint.quick-start`, `axint.project-start`, `axint.context-recovery`, `axint.create-intent`, `axint.create-widget`.

## Quick Start

Ask Claude to create and prove an Apple-native feature:

> "Use Axint to create an App Intent that lets users log a workout with type, duration, and calories. Compile it, validate the Swift, and give me the Fix Packet or proof report."

Claude will scaffold the source contract, compile it to Swift, validate the Apple-specific surface, and hand you the proof loop to run in Xcode.

## Links

- [axint.ai](https://axint.ai) — Docs and playground
- [GitHub](https://github.com/agenticempire/axint) — Source and issues
- [Templates](https://github.com/agenticempire/axint/tree/main/src/templates) — All built-in templates

## License

Apache-2.0
