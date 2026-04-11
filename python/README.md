# axintai — Python SDK for Axint

[![PyPI](https://img.shields.io/pypi/v/axintai.svg)](https://pypi.org/project/axintai/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Define Apple App Intents in Python. Ship them to Siri, Shortcuts, and Spotlight through the same open-source compiler pipeline that powers the TypeScript SDK.

The Python SDK includes a **native Swift generator** — no Node.js dependency required. Parse, validate, and compile intents entirely from Python.

## Install

```bash
pip install axintai
```

## Define an intent

```python
from axintai import define_intent, param

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

```bash
# Parse and inspect the IR
axintai parse intents/create_event.py
axintai parse intents/create_event.py --json

# Compile Python → Swift (native, no Node.js needed)
axintai compile intents/create_event.py --stdout
axintai compile intents/create_event.py --out ios/Intents/

# With companion fragments
axintai compile intents/create_event.py --out ios/Intents/ --emit-info-plist --emit-entitlements

# Validate without generating Swift
axintai validate intents/create_event.py

# Machine-readable output
axintai compile intents/create_event.py --json
```

## Use it as a library

```python
from axintai import define_intent, param, generate_swift, validate_intent

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
axintai parse intent.py --json | axint compile - --from-ir --stdout
```

## Why Python?

Every language-agnostic analysis layer in Axint — the IR, the validator, the generator — works with a stable JSON schema. The Python SDK implements the full pipeline natively, unlocking a massive population of developers who shouldn't have to learn TypeScript to build Siri integrations.

The Python parser never runs your code. It walks the Python AST the same way the TypeScript compiler walks the TS AST, so `axintai compile` is deterministic, sandboxable, and reproducible.

## Parity with the TypeScript SDK

| Feature                          | TypeScript | Python |
|----------------------------------|------------|--------|
| `define_intent` / `defineIntent` | ✅          | ✅      |
| `param.string/int/double/...`    | ✅          | ✅      |
| `entitlements`, `infoPlistKeys`  | ✅          | ✅      |
| `isDiscoverable`                 | ✅          | ✅      |
| Multi-intent files               | ✅          | ✅      |
| Swift codegen (native)           | ✅          | ✅      |
| IR validation                    | ✅          | ✅      |
| Info.plist fragment              | ✅          | ✅      |
| Entitlements fragment            | ✅          | ✅      |
| CLI (parse/compile/validate)     | ✅          | ✅      |
| Return-type inference            | ✅          | 🟡 v0.3 |
| MCP server                       | ✅          | 🟡 v0.3 |

## Development

```bash
pip install -e '.[dev]'
pytest -v
ruff check .
mypy axintai
```

## License

Apache 2.0 — see [LICENSE](../LICENSE).

Part of the [Axint](https://axint.ai) project by [Agentic Empire](https://github.com/agenticempire).
