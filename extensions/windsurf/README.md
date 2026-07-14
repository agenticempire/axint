# Axint — Windsurf Integration

Compile, validate, repair, and prove Apple-native Swift surfaces from Windsurf.

## Install

### Option 1: Config file

Copy the MCP config to your Windsurf config directory:

**macOS / Linux:**
```bash
cp mcp_config.json ~/.codeium/windsurf/mcp_config.json
```

**Windows:**
```powershell
copy mcp_config.json %USERPROFILE%\.codeium\windsurf\mcp_config.json
```

If you already have an `mcp_config.json`, merge the `axint` entry into your existing `mcpServers` object.

After editing the config, fully quit and reopen Windsurf.

### Option 2: Windsurf MCP Marketplace

Click the MCP icon in the Cascade panel and search for "Axint".

## What You Get

Windsurf can use the MCP tools and built-in prompts from the installed Axint release:

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
