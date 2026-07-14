<p align="center">
  <img src="docs/assets/mark-dark.svg" alt="Axint mark" width="52" height="52" valign="middle" />
  &nbsp;
  <img src="docs/assets/wordmark-dark.svg" alt="Axint" height="32" valign="middle" />
</p>

<p align="center">
  <strong>The proof and repair layer for Apple coding agents.</strong>
</p>

<p align="center">
  Generate Apple-native capabilities from smaller contracts. Check existing Swift without rewriting the project.<br />
  Reconcile static findings with Xcode evidence, then hand the agent a compact receipt it can repair and rerun.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@axint/compiler"><img src="https://img.shields.io/npm/v/@axint/compiler?color=f05138&label=npm" alt="npm package" /></a>
  <a href="https://www.npmjs.com/package/@axint/compiler"><img src="https://img.shields.io/npm/dm/@axint/compiler?color=2f3431&label=downloads" alt="monthly npm downloads" /></a>
  <a href="https://pypi.org/project/axint/"><img src="https://img.shields.io/pypi/v/axint?color=3775a9&label=PyPI" alt="PyPI package" /></a>
  <a href="https://github.com/agenticempire/axint/actions/workflows/ci.yml"><img src="https://github.com/agenticempire/axint/actions/workflows/ci.yml/badge.svg" alt="continuous integration" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-2f3431" alt="Apache 2.0 license" /></a>
</p>

<p align="center">
  <a href="https://cloud.axint.ai">Try in browser</a> ·
  <a href="#start-in-60-seconds">Prove a project</a> ·
  <a href="#connect-your-agent">Connect an agent</a> ·
  <a href="https://docs.axint.ai">Docs</a> ·
  <a href="https://github.com/agenticempire/axint-examples">Examples</a> ·
  <a href="#contribute">Contribute</a>
</p>

<p align="center">
  <img src="media/intro.gif" alt="Axint discovers an Apple project, checks Swift, runs Xcode proof, reconciles findings, and produces a signed source-free receipt" width="960" />
</p>

<p align="center">
  <sub>If Apple coding agents should prove their work, star Axint and help shape the execution layer.</sub>
</p>

---

## Agents can write Swift. Shipping requires evidence.

Apple development is a graph of contracts: SwiftUI state, App Intents, Siri and
Shortcuts metadata, widgets, entitlements, privacy declarations, concurrency,
build settings, tests, and runtime behavior. A plausible patch is not proof that
those contracts still agree.

Axint gives agents one evidence model across generation and brownfield work:

| When you need to...                | Axint provides...                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Change an existing Swift project   | Non-destructive validation with provenance and confidence                    |
| Add an Apple-native capability     | TypeScript, Python, JSON, or preview contracts compiled to inspectable Swift |
| Run builds and tests from an agent | Resumable Xcode jobs with compact logs and `.xcresult` extraction            |
| Repair a failure                   | Stable findings, likely files, exact next actions, and a Fix Packet          |
| Hand work across agents or CI      | Signed, source-free receipts that can be verified and rerun                  |

Static analysis proposes. Apple tooling supplies evidence. Axint records what is
**confirmed**, **probable**, **advisory**, or **suppressed** instead of presenting
every heuristic as compiler truth.

## Start in 60 seconds

### Prove an existing Apple project

```bash
npx -y -p @axint/compiler axint prove --dir /path/to/MyApp
```

Axint discovers the Xcode container and scheme, checks existing Swift, runs the
available build and tests, reconciles findings, and writes a signed receipt to
`.axint/proof`.

The default first run is deliberately conservative:

- no account or configuration required
- no Swift changes
- no source upload
- no project instructions, memory, or MCP installation
- no automatic fixes

Review a proposed deterministic rewrite before opting in:

```bash
axint prove --dir /path/to/MyApp --fix
axint receipt verify /path/to/MyApp/.axint/proof/latest.proof.json
```

### Create a working Apple-native starter

```bash
npx -y -p @axint/compiler create-axint-app apple-day-agent
cd apple-day-agent
npm run proof
open share/built-with-axint.html
```

The starter includes multiple App Intent contracts, a SwiftUI app shell, agent
prompts, proof artifacts, and an interactive preview. It is designed to show the
complete author, compile, check, and repair loop instead of generating an empty
project.

## One system, five modes

| Mode         | Job                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Generate** | Compile smaller contracts into App Intents, SwiftUI views, WidgetKit widgets, Live Activities, app shells, metadata, and tests |
| **Check**    | Validate generated or existing Swift with evidence-aware diagnostics and brownfield abstention                                 |
| **Run**      | Orchestrate resumable build, test, runtime, and `.xcresult` proof on a local or BYO Mac                                        |
| **Team**     | Preserve project context, sessions, file claims, repair packets, and handoffs across agents                                    |
| **Cloud**    | Run hosted checks and keep shared proof history when local Apple tooling is unavailable                                        |

Every mode returns the same compact contract: verdict, evidence, findings, next
actions, and artifact paths. Full logs stay on disk instead of flooding the
agent context.

```text
PROOF COMPLETE

build       PASS
tests       PASS
verdict     REVIEWABLE

confirmed   0
probable    0
advisory    1
suppressed  1

receipt     .axint/proof/latest.proof.json
signature   Ed25519 verified
```

## Build Apple capabilities from smaller contracts

```typescript
import { defineIntent, param } from "@axint/compiler";

export default defineIntent({
  name: "CreateCalendarEvent",
  title: "Create Calendar Event",
  description: "Creates a calendar event for the user.",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    duration: param.duration("Event duration"),
    location: param.string("Location", { required: false }),
  },
  perform: async ({ title, date }) => ({
    success: true,
    message: `Created ${title} on ${date}`,
  }),
});
```

```bash
axint compile create-calendar-event.ts --out ios/Intents/
```

The compiler emits ordinary Swift plus the plist, entitlement, localization,
and diagnostic artifacts required by the selected Apple surfaces. The same
pipeline supports `defineView()`, `defineWidget()`, `defineApp()`, schema JSON,
and the Python SDK.

## Connect your agent

Axint ships a compact MCP server for Claude, Cursor, VS Code, Windsurf, Xcode,
and any standards-compatible MCP host:

```json
{
  "mcpServers": {
    "axint": {
      "command": "npx",
      "args": ["-y", "-p", "@axint/compiler", "axint-mcp"]
    }
  }
}
```

Start a fresh tool session, then call `axint.status` and `axint.activate` to
prove the server and compiler are actually connected.

<details>
<summary><strong>MCP tool and prompt inventory</strong></summary>

### Start, recover, and inspect

`axint.status` · `axint.activate` · `axint.upgrade` · `axint.doctor` ·
`axint.session.start` · `axint.context.memory` · `axint.context.docs` ·
`axint.workflow.check`

### Generate and discover

`axint.feature` · `axint.project.pack` · `axint.project.index` ·
`axint.project.syncVersion` · `axint.suggest` · `axint.registry.search` ·
`axint.scaffold` · `axint.compile` · `axint.validate` · `axint.tokens.ingest` ·
`axint.schema.compile` · `axint.templates.list` · `axint.templates.get`

### Check and repair

`axint.xcode.guard` · `axint.xcode.write` · `axint.fix-packet` ·
`axint.cloud.check` · `axint.repair` · `axint.feedback.create` ·
`axint.swift.validate` · `axint.swift.fix`

### Coordinate and run

`axint.agent.install` · `axint.agent.advice` · `axint.agent.claim` ·
`axint.agent.release` · `axint.run` · `axint.run.status` · `axint.run.cancel`

### Built-in prompts

`axint.quick-start` · `axint.project-start` · `axint.context-recovery` ·
`axint.create-widget` · `axint.create-intent`

</details>

## Proof you can inspect

Axint publishes the evidence behind its claims instead of freezing marketing
numbers into this README:

- [Live product metrics](metrics.json) are regenerated from the codebase.
- [Brownfield benchmark](benchmarks/brownfield/README.md) publishes labeled precision, recall, and abstention cases.
- [Coverage map](docs/COVERAGE.md) links implementation surfaces to tests and reference docs.
- [Architecture](ARCHITECTURE.md) explains the compiler, proof, MCP, and runtime boundaries.
- [Release notes](docs/RELEASE_NOTES.md) record shipped behavior and compatibility changes.
- [Security policy](SECURITY.md) documents reporting and supported release handling.

## Ecosystem

| Surface                                                     | Use it for                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [npm](https://www.npmjs.com/package/@axint/compiler)        | CLI, TypeScript SDK, compiler, and MCP server                      |
| [PyPI](https://pypi.org/project/axint/)                     | Python SDK and Python-native authoring                             |
| [Playground](https://cloud.axint.ai)                        | Compile and inspect output without a local install                 |
| [Registry](https://registry.axint.ai)                       | Discover reusable Apple capability packages                        |
| [Examples](https://github.com/agenticempire/axint-examples) | Run polished App Intent, SwiftUI, and WidgetKit projects           |
| [Editor integrations](extensions)                           | Connect Xcode, VS Code, Cursor, JetBrains, Neovim, and other hosts |

## Contribute

The most valuable contributions improve trust: fewer brownfield false positives,
better evidence reconciliation, sharper Fix Packets, broader Apple API coverage,
and examples that reproduce real project failures.

- Start with a [`good first issue`](https://github.com/agenticempire/axint/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
- Pick up a [`help wanted`](https://github.com/agenticempire/axint/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) problem.
- Read the [contribution guide](CONTRIBUTING.md).
- Ask, propose, or show your work in [Discussions](https://github.com/agenticempire/axint/discussions).

## Requirements and license

The JavaScript package follows the Node.js engine declared in
[`package.json`](package.json). Swift generation runs anywhere Node runs; Xcode
build, test, simulator, and runtime proof require macOS with a current Xcode
toolchain.

Axint is [Apache-2.0 licensed](LICENSE). Fork it, extend it, and ship with it.
The Axint name and visual identity remain protected; see [NOTICE](NOTICE) and
[TRADEMARKS.md](TRADEMARKS.md).
