# Axint — Cursor Integration

Compile, validate, repair, and prove Apple-native Swift surfaces from Cursor.

## Install

### Option 1: Project-scoped

Copy `mcp.json` to `.cursor/mcp.json` in your project root:

```bash
mkdir -p .cursor
cp mcp.json .cursor/mcp.json
```

### Option 2: Global

Copy to your home directory:

```bash
mkdir -p ~/.cursor
cp mcp.json ~/.cursor/mcp.json
```

### Option 3: Cursor Marketplace

Search for "Axint" in Cursor Settings > Tools & MCP.

## What You Get

Cursor can use the MCP tools and built-in prompts from the installed Axint release:

- Project and session tools: `axint.status`, `axint.upgrade`, `axint.doctor`, `axint.session.start`, `axint.project.pack`, `axint.project.index`, `axint.project.syncVersion`
- Apple generation tools: `axint.feature`, `axint.suggest`, `axint.scaffold`, `axint.compile`, `axint.schema.compile`
- Proof and repair tools: `axint.validate`, `axint.swift.validate`, `axint.swift.fix`, `axint.fix-packet`, `axint.cloud.check`, `axint.repair`, `axint.run`
- Xcode and workflow tools: `axint.xcode.guard`, `axint.xcode.write`, `axint.workflow.check`, `axint.run.status`, `axint.run.cancel`
- Context and ecosystem tools: `axint.context.memory`, `axint.context.docs`, `axint.registry.search`, `axint.templates.list`, `axint.templates.get`, `axint.feedback.create`, `axint.tokens.ingest`

Built-in prompts: `axint.quick-start`, `axint.project-start`, `axint.context-recovery`, `axint.create-intent`, `axint.create-widget`.

## Requirements

- Node.js 22+

## Links

- [axint.ai](https://axint.ai)
- [GitHub](https://github.com/agenticempire/axint)
