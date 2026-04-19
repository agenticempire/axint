# axint — Python SDK for Axint

<!-- mcp-name: io.github.agenticempire/axint -->

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Define Apple App Intents, SwiftUI views, WidgetKit widgets, and full apps in Python. Compile to native Swift through the same open-source compiler pipeline that powers the TypeScript SDK.

The Python SDK includes a **native Swift generator** — no Node.js dependency required. Parse, validate, and compile entirely from Python.

## Install

```bash
pip install axint
```

Or install from source for development:

```bash
git clone https://github.com/agenticempire/axint.git
cd axint/python
pip install -e '.[dev]'
```

## Define an intent

```python
from axint import define_intent, param

create_event = define_intent(
    name="CreateCalendarEventIntent",
    title="Create Calendar Event",
    description="Creates a new event on the user's calendar",
    domain="productivity",
    params={
        "event_title": param.string("Title of the event"),
        "start_date": param.date("When the event starts"),
        "duration_minutes": param.int("Length of the event in minutes"),
        "is_all_day": param.boolean("Whether the event is all-day", optional=True, default=False),
    },
    entitlements=["com.apple.developer.calendars"],
    info_plist_keys=["NSCalendarsUsageDescription"],
)
```

## Compile it

The Python SDK installs a CLI at `axint-py` (the TypeScript compiler owns the `axint` name on npm).

```bash
# Parse and inspect the IR
axint-py parse intents/create_event.py
axint-py parse intents/create_event.py --json

# Compile Python → Swift (native, no Node.js needed)
axint-py compile intents/create_event.py --stdout
axint-py compile intents/create_event.py --out ios/Intents/

# With companion fragments
axint-py compile intents/create_event.py --out ios/Intents/ --emit-info-plist --emit-entitlements

# Validate without generating Swift
axint-py validate intents/create_event.py

# Machine-readable output
axint-py compile intents/create_event.py --json
```

## Use it as a library

```python
from axint import define_intent, param, generate_swift, validate_intent

intent = define_intent(
    name="SendMessage",
    title="Send Message",
    description="Sends a message",
    domain="messaging",
    params={"body": param.string("Message text")},
)

ir = intent.to_ir()
diagnostics = validate_intent(ir)
swift_code = generate_swift(ir)
```

## Cross-language bridge

The Python SDK produces compatible IR JSON that the TypeScript compiler can consume. You can pipe it in for additional validation and Swift generation:

```bash
axint-py parse intent.py --json | axint compile - --from-ir --stdout
```

## Why Python?

Every language-agnostic analysis layer in Axint — the IR, the validator, the generator — works with a stable JSON schema. The Python SDK implements the full pipeline natively, unlocking a massive population of developers who shouldn't have to learn TypeScript to build Siri integrations.

The Python parser never runs your code. It walks the Python AST the same way the TypeScript compiler walks the TS AST, so `axint compile` is deterministic, sandboxable, and reproducible.

## Parity with the TypeScript SDK

| Feature                          | TypeScript | Python |
|----------------------------------|------------|--------|
| `define_intent` / `defineIntent` | ✅          | ✅      |
| `define_entity` / `defineEntity` | ✅          | ✅      |
| `define_view` / `defineView`     | ✅          | ✅      |
| `define_widget` / `defineWidget` | ✅          | ✅      |
| `define_app` / `defineApp`       | ✅          | ✅      |
| `param.string/int/double/...`    | ✅          | ✅      |
| `entitlements`, `infoPlistKeys`  | ✅          | ✅      |
| `isDiscoverable`                 | ✅          | ✅      |
| Multi-intent files               | ✅          | ✅      |
| Swift codegen (native)           | ✅          | ✅      |
| `EntityQuery` codegen            | ✅          | ✅      |
| IR validation                    | ✅          | ✅      |
| Info.plist fragment              | ✅          | ✅      |
| Entitlements fragment            | ✅          | ✅      |
| CLI (parse/compile/validate)     | ✅          | ✅      |
| Return-type inference            | ✅          | ✅      |
| MCP server                       | ✅          | ✅      |

## Development

```bash
pip install -e '.[dev]'
pytest -v
ruff check .
mypy axint
```

## License

Apache 2.0 — see [LICENSE](../LICENSE).

Part of the [Axint](https://axint.ai) project by [Agentic Empire](https://github.com/agenticempire).
