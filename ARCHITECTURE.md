# Axint Architecture

Axint is a multi-language compiler that transforms high-level intent, view, widget, and app definitions into production Swift code for Apple platforms. The compiler decouples input language (TypeScript, Python) from output generation through an intermediate representation, allowing new input languages and output surfaces to be added independently.

## Pipeline

The compilation flow is uniform across all surfaces:

```
Source (TS/Python)
  ↓
Parse to AST
  ↓
Walk AST → IR (JSON)
  ↓
Validate IR
  ↓
Generate Swift Code
  ↓
Validate Swift Output
  ↓
Format & Return
```

The entry point is `compiler.ts`, which orchestrates the pipeline. For each surface—Intent, View, Widget, App—there's a dedicated parser, generator, and validator that plugs into this orchestration.

## Intermediate Representation (IR)

The IR is a language-agnostic JSON schema that both the TypeScript and Python SDKs produce. The compiler only sees IR; it has no knowledge of the original source language. This decoupling means:

- A Python script can emit IR to JSON, pass it to `compileFromIR()`, and get the same Swift code as a TypeScript definition
- New input languages (Go, Rust, etc.) only need to produce valid IR
- The Swift generator is the single source of truth for correctness

IR types live in `types.ts`: `IRIntent`, `IRView`, `IRWidget`, `IRApp`, plus supporting types for parameters, properties, bindings, and Swift type mappings. Each IR type is a data structure with no methods—pure shape. Validation rules (e.g., "an Intent query must have a return type", "a View property can't be computed and readonly simultaneously") live in the corresponding validator, not in the IR type itself.

## Four Surfaces

Each surface follows the same structural pattern:

**Intent** (`parser.ts` → `validator.ts` → `generator.ts`)
Walks a `defineIntent()` function to extract intent name, parameters, query, actions, and open-in-app behavior. Generates App Intent code with `@Application`, `@Parameter`, `@Dependency`, and `@Execution` attributes. The validator ensures parameters are JSON-serializable, query return types are unambiguous, and action side effects are declared.

**View** (`view-parser.ts` → `view-validator.ts` → `view-generator.ts`)
Walks a `defineView()` function extracting properties, lifecycle hooks, render blocks, and navigation links. Generates a SwiftUI `View` struct with `@State`, `@ObservedObject`, bindings, and computed properties. Validator checks property types are Codable-compatible, state mutations aren't in computed properties, and navigation targets exist.

**Widget** (`widget-parser.ts` → `widget-validator.ts` → `widget-generator.ts`)
Walks `defineWidget()` extracting widget family configuration, timeline providers, and entry content. Generates WidgetKit `Widget`, `TimelineProvider`, and SwiftUI `WidgetEntryView`. Validator ensures widget families are valid, timeline entries can be encoded, and sizes match WidgetKit constraints.

**App** (`app-parser.ts` → `app-validator.ts` → `app-generator.ts`)
Walks `defineApp()` extracting app metadata, scenes, navigation stacks, and app-level dependencies. Generates a SwiftUI `App` struct with scene definitions and top-level navigation. Validator checks app delegates are Codable, scene hierarchies are acyclic, and primary scene is defined.

Each validator emits diagnostics with error codes (`AX100`–`AX202`) that point to source locations. The compiler collects all diagnostics and returns them to the CLI or MCP server.

## Cross-Language Bridge

The Python SDK (`python/axintai/`) produces the same IR JSON as the TypeScript SDK. Both serialize to the same shape. A Python user calls `axintai.compile(intent)`, which internally returns IR JSON, which is then fed to the Swift generator (currently via a subprocess call to the TypeScript CLI, but can be refactored to a shared library).

`compileFromIR()` is the key function: it accepts an IR object or JSON string, skips parsing entirely, and goes straight to validation and code generation. This is how the Python SDK and registry both use the compiler without reimplementing generation logic.

## Extension Points

To add a new surface (e.g., "Views with custom rendering backends"):

1. Create `src/core/custom-parser.ts` — walk the AST to build `IRCustom`
2. Create `src/core/custom-validator.ts` — check invariants, emit diagnostics
3. Create `src/core/custom-generator.ts` — transform IR to Swift code
4. Add the `IRCustom` type to `types.ts`
5. Wire it into `compiler.ts`: add a case in the surface dispatch, export from the main API
6. Update the SDK: add `defineCustom()` to `sdk/index.ts`

The pattern is rigid by design—it forces new surfaces to think about parsing, validation, and generation as separate concerns.

## Registry

The registry is a Cloudflare Workers + D1 + R2 setup (`registry/src/`). Users publish intent/view/widget/app definitions; others install them via the CLI (`axint add @user/intent-name`). The registry stores:

- Package metadata and versions in D1 (name, author, version, tarball URL)
- Tarballs in R2 (the TypeScript/Python source)
- Search index for discovery

Authentication uses GitHub OAuth device flow—no passwords, no credentials stored.

## Directory Map

```
src/core/
  compiler.ts, parser.ts, view-parser.ts, widget-parser.ts, app-parser.ts
  generator.ts, view-generator.ts, widget-generator.ts, app-generator.ts
  validator.ts, view-validator.ts, widget-validator.ts, app-validator.ts
  types.ts, eject.ts, format.ts, sandbox.ts

src/sdk/
  index.ts — defineIntent(), defineView(), defineWidget(), defineApp(), param.*

src/mcp/
  server.ts, scaffold.ts

src/cli/
  index.ts, scaffold.ts

python/axintai/
  sdk.py, ir.py, generator.py, validator.py, cli.py, parser.py

spm-plugin/
  Plugins/AxintCompilePlugin/

registry/src/
  index.ts (API), frontend.ts (web UI)

benchmarks/, tests/
```

The CLI is the user-facing entry point (`src/cli/index.ts`). It calls the compiler, formats output, and handles watch mode. The MCP server wraps the compiler for AI agent use. The Python SDK mirrors the TypeScript API but produces IR that feeds into the shared Swift generator.
