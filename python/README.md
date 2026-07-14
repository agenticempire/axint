# Axint Python SDK

<!-- mcp-name: io.github.agenticempire/axint -->

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Axint is the proof and repair layer for Apple coding agents. The Python SDK is
its native authoring surface for App Intents, entities, SwiftUI views, WidgetKit
widgets, and app scaffolds. It parses Python without executing it, validates the
resulting IR, and generates inspectable Swift directly in Python.

The normal Python parse, validate, and compile paths do not require Node.js.
Full existing-project Xcode proof is provided by the main `@axint/compiler` CLI
on macOS.

## Install

```bash
pip install axint
```

For development:

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
        "is_all_day": param.boolean(
            "Whether the event is all-day", optional=True, default=False
        ),
    },
    entitlements=["com.apple.developer.calendars"],
    info_plist_keys={
        "NSCalendarsUsageDescription": "Create and edit calendar events you request.",
    },
)
```

## Parse, validate, and compile

The package installs `axint-py`; the JavaScript package owns the `axint` command.

```bash
# Inspect compatible IR without executing the Python file
axint-py parse intents/create_event.py
axint-py parse intents/create_event.py --json

# Generate Swift natively in Python
axint-py compile intents/create_event.py --stdout
axint-py compile intents/create_event.py --out ios/Intents/

# Emit companion metadata
axint-py compile intents/create_event.py --out ios/Intents/ \
  --emit-info-plist --emit-entitlements

# Validate without generating Swift
axint-py validate intents/create_event.py

# Return machine-readable output
axint-py compile intents/create_event.py --json
```

## Use it as a library

```python
from axint import define_intent, generate_swift, param, validate_intent

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

## Cross-language verification

Python produces IR compatible with the TypeScript compiler. Pipe an intent into
the main CLI when you want an additional cross-surface compiler pass:

```bash
axint-py parse intent.py --json | axint compile - --from-ir --stdout
```

This bridge is optional. Native Python generation does not invoke it.

## Coverage boundary

| Capability | Python SDK |
| --- | --- |
| Intent, entity, view, widget, and app definitions | Implemented |
| Primitive parameters, entitlements, and plist fragments | Implemented |
| Native Swift generation and IR validation | Implemented |
| Parse, compile, and validate CLI | Implemented |
| Focused Python MCP authoring server | Implemented with the `mcp` extra |
| Optional Node-backed Swift validator helper in Python MCP | Available when the JavaScript package is installed |
| Resumable Xcode build, test, repair, and signed proof | Use the main `@axint/compiler` CLI on macOS |

The Python and TypeScript generators are separate implementations over
compatible contracts. Parity tests cover their shared output; a claim about one
surface should not be assumed to apply to the other without a corresponding
test.

## MCP extra

```bash
pip install 'axint[mcp]'
axint-mcp-py
```

The Python MCP package focuses on Python authoring, generation, validation, and
discovery. It is not a substitute for the main MCP server's complete project
proof and coordination surface.

## Prove the resulting Apple project

After adding generated Swift to an Xcode project, run the full local proof loop:

```bash
npx -y -p @axint/compiler axint prove --dir /path/to/MyApp
```

The command checks Swift, runs the available Xcode build and tests, reconciles
findings, and writes a signed source-free receipt. It does not upload project
source by default.

## Development

```bash
pip install -e '.[dev]'
pytest
ruff check .
mypy axint
pyright
```

Apache-2.0 licensed. See [LICENSE](../LICENSE).
