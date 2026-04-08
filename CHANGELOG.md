# Changelog

All notable changes to Axint will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/) and the format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-04-07

### Added

- **Core compiler pipeline**: parse TypeScript `defineIntent()` calls into an Intermediate Representation (IR), validate against Apple App Intents constraints, and generate idiomatic Swift
- **CLI**: `axint compile <file>` and `axint validate <file>` commands with colored, Rust-inspired diagnostics
- **MCP server**: `axint_compile` and `axint_validate` tools for AI coding assistants (Claude Code, Cursor, Windsurf)
- **SDK**: `defineIntent()` API with type-safe `param.string()`, `param.number()`, `param.boolean()`, `param.date()`, `param.duration()`, `param.url()` helpers
- **Validation**: 12 diagnostic codes (AX001–AX005 parser, AX100–AX106 IR, AX200–AX202 Swift) with actionable suggestions
- **Security**: `escapeSwiftString()` prevents code injection in generated Swift string literals
- **Testing**: 80+ tests covering parser, generator, validator, compiler, types, security edge cases, and injection resistance
- **CI/CD**: GitHub Actions with typecheck, lint, test, build, and CLI verification
- Apache 2.0 license, CLA, Code of Conduct, Security Policy, Contributing Guide

### Technical Details

- Node.js 22+ (ESM-only)
- 3 production dependencies: `@modelcontextprotocol/sdk`, `commander`, `handlebars`
- tsup for builds with separate CLI/MCP/library entry points
- Vitest with snapshot testing and V8 coverage

[0.1.0]: https://github.com/AgenticEmpire/axint/releases/tag/v0.1.0
