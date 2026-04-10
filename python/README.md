# axintai — Python SDK for Axint

[![PyPI](https://img.shields.io/pypi/v/axintai.svg)](https://pypi.org/project/axintai/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Define Apple App Intents in Python. Ship them to Siri, Shortcuts, and Spotlight through the same open-source compiler pipeline that powers the TypeScript SDK.

> **Alpha.** This is `0.1.0a1`. The authoring API (`define_intent` + `param`) is stable, the AST parser handles every core construct, and the IR is byte-compatible with the TypeScript compiler. Swift codegen is currently handled by shelling out to `@axintai/compiler` — the cross-language bridge lands in `v0.3.0`.

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
axintai parse intents/create_event.py            # print the IR
axintai parse intents/create_event.py --json     # IR as JSON
axintai compile intents/create_event.py          # IR → Swift (via @axintai/compiler)
```

## Why Python?

Every language-agnostic analysis layer in Axint — the IR, the validator, the generator — already works with a stable JSON schema. Adding Python is almost free, and it unlocks a massive population of developers who write Shortcuts but shouldn't have to learn TypeScript to do it.

The Python parser never runs your code. It walks the Python AST the same way the TypeScript compiler walks the TS AST, so `axintai parse` is deterministic, sandboxable, and reproducible.

## Parity with the TypeScript SDK

| Feature                          | TypeScript | Python     |
|----------------------------------|------------|------------|
| `define_intent` / `defineIntent` | ✅          | ✅          |
| `param.string/int/double/...`    | ✅          | ✅          |
| `entitlements`, `infoPlistKeys`  | ✅          | ✅          |
| `isDiscoverable`                 | ✅          | ✅          |
| Multi-intent files               | ✅          | ✅ (parse)  |
| Swift codegen                    | ✅          | ⚠️ via TS    |
| Return-type inference            | ✅          | 🟡 v0.3.0   |
| MCP server                       | ✅          | 🟡 v0.3.0   |

## Development

```bash
pip install -e '.[dev]'
pytest
ruff check .
mypy axintai
```

## License

Apache 2.0 — see [LICENSE](../LICENSE).

Part of the [Axint](https://axint.ai) project.
