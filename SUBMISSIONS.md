# Axint — Platform Submission Guide

Everything needed to register Axint on external directories.
Run each step, then delete this file.

---

## 1. Smithery.ai

**URL:** https://smithery.ai (click "Submit" / "Publish")
**Process:** Connect GitHub repo, fill metadata. `smithery.yaml` already in repo root.

**Name:** `agenticempire/axint`

**Tagline (short):**
Compile TypeScript or Python into native Swift App Intents, SwiftUI views, and WidgetKit widgets. One MCP server, six tools, zero Xcode boilerplate.

**Description (Smithery audience = developers using MCP with Claude/Cursor/Windsurf):**

Axint is an open-source compiler that lets AI coding agents generate native Apple code without writing Swift directly. Your agent calls `axint_compile` with a TypeScript `defineIntent()` call and gets back production-ready Swift — App Intents for Siri, SwiftUI views, WidgetKit widgets, full app scaffolds.

The MCP server exposes six tools:

- **axint_scaffold** — Generate a starter TypeScript intent file from a natural-language description
- **axint_compile** — Compile TypeScript/Python → Swift with optional Info.plist and entitlements
- **axint_validate** — Check an intent definition for errors without generating code
- **axint_compile_from_schema** — Compile from minimal JSON (saves tokens on large batches)
- **axint_list_templates** — Browse bundled reference templates
- **axint_template** — Retrieve the source of a specific template

One `defineWidget()` call replaces ~150 lines of Swift (13× compression). Agents pay per token — Axint makes Apple development dramatically cheaper and faster.

Works with Claude Code, Cursor, Windsurf, Zed, VS Code, and any MCP-compatible client.

**Tags:** `swift` `apple` `compiler` `typescript` `app-intents` `siri` `swiftui` `widgetkit` `mcp`
**Category:** Developer Tools
**Repository:** https://github.com/agenticempire/axint
**Install command:** `npx -y @axint/compiler axint-mcp`

---

## 2. mcpservers.org

**URL:** https://mcpservers.org/submit
**Process:** Web form submission.

**Name:** Axint — App Intents Compiler

**Description (mcpservers.org audience = MCP ecosystem browsers looking for useful servers):**

Turn TypeScript into native Swift for Apple platforms. Axint compiles `defineIntent()`, `defineView()`, `defineWidget()`, and `defineApp()` calls into idiomatic, production-ready Swift — App Intents for Siri, SwiftUI views, WidgetKit widgets, and complete app scaffolds.

Built for AI agents that target Apple. A single widget definition compresses ~13× compared to writing the Swift by hand. Your coding assistant calls the MCP server, passes a TypeScript snippet, and gets back Swift files ready to drop into Xcode.

Six tools: scaffold intents from natural language, compile TS/Python/JSON to Swift, validate definitions, browse templates. Supports Claude Code, Cursor, Windsurf, VS Code, Zed, and every other MCP client.

Open-source (Apache 2.0). TypeScript SDK on npm, Python SDK on PyPI.

**GitHub:** https://github.com/agenticempire/axint
**Website:** https://axint.ai
**npm:** `@axint/compiler`
**Install:** `npx -y @axint/compiler axint-mcp`

---

## 3. VS Code Extension Marketplace

**Already built.** Extension at `extensions/vscode/`.

To publish:
```bash
cd extensions/vscode
npx @vscode/vsce publish
```

Publisher must be `agenticempire` on the VS Code Marketplace.
If the publisher doesn't exist yet:
1. Go to https://marketplace.visualstudio.com/manage
2. Create publisher "agenticempire"
3. Generate a Personal Access Token from https://dev.azure.com
4. Run `npx @vscode/vsce login agenticempire`
5. Then `npx @vscode/vsce publish`

**Marketplace description (audience = VS Code users who work with Apple/Swift):**

Axint brings Apple App Intents compilation directly into VS Code. Write `defineIntent()` in TypeScript, compile to native Swift — App Intents for Siri, SwiftUI views, WidgetKit widgets, and full app scaffolds.

This extension registers Axint as an MCP server so AI assistants in VS Code (GitHub Copilot, Claude, etc.) can automatically scaffold, compile, and validate Apple App Intents without leaving the editor.

Six tools available: scaffold from natural language, compile TS/Python → Swift, validate definitions, browse templates.

Open-source. Apache 2.0 license.

---

## 4. Deploy Blog Posts

From your machine:
```bash
cd ~/agenticempire/axint.ai
vercel --prod
```

---

## 5. Commit smithery.yaml to axint repo

From your machine:
```bash
cd ~/agenticempire/axint
git add smithery.yaml
git commit -m "add smithery.yaml for mcp server registration"
git push origin main
```

---

## Execution Order

1. Commit + push smithery.yaml to axint repo
2. Deploy blog posts (`vercel --prod`)
3. Submit to Smithery.ai (needs GitHub repo connected)
4. Submit to mcpservers.org (web form)
5. Publish VS Code extension
