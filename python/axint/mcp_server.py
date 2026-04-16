"""
Axint MCP Server for the Python SDK.

The Python SDK now has a native parser, validator, and Swift generator. This
server exposes that pipeline to MCP-compatible coding agents, while also
bridging a few advanced Swift-only helpers from the TypeScript package when the
local Axint repo is available.

Tools:
  - axint.feature
  - axint.suggest
  - axint.scaffold / axint_scaffold
  - axint.compile / axint_compile
  - axint.validate / axint_validate
  - axint.schema.compile / axint_compile_from_schema
  - axint.swift.validate / axint_swift_validate
  - axint.swift.fix / axint_swift_fix
  - axint.templates.list / axint_list_templates
  - axint.templates.get / axint_template
"""

from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
from contextlib import suppress
from pathlib import Path
from typing import Any, Literal

try:
    from mcp.server import Server
    from mcp.types import Tool, ToolAnnotations
except ImportError as exc:  # pragma: no cover - exercised only without optional dep
    Server = Any  # type: ignore[assignment]
    Tool = Any  # type: ignore[assignment]
    ToolAnnotations = Any  # type: ignore[assignment]
    MCP_IMPORT_ERROR: Exception | None = exc
else:
    MCP_IMPORT_ERROR = None

from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
)
from .ir import (
    AppIR,
    AppSceneIR,
    AppStorageIR,
    IntentIR,
    IntentParameter,
    ViewIR,
    ViewPropIR,
    ViewStateIR,
    WidgetEntryIR,
    WidgetIR,
)
from .parser import (
    ParserError,
    parse_app_source,
    parse_source,
    parse_view_source,
    parse_widget_source,
)
from .validator import validate_app, validate_intent, validate_view, validate_widget

ParamKind = Literal[
    "string",
    "int",
    "double",
    "float",
    "boolean",
    "date",
    "duration",
    "url",
]
Surface = Literal["intent", "view", "widget"]

SCAFFOLD_INTENT_TEMPLATE = '''"""Intent definition for {name}."""

from axint import define_intent, param

{name_lower} = define_intent(
    name="{name}",
    title="{title}",
    description="{description}",{domain_line}{params_line}
    perform=lambda{params_lambda}: {{"result": "success"}},
)
'''

TEMPLATES = [
    {
        "id": "send-message",
        "title": "Send Message",
        "domain": "messaging",
        "source": '''"""Send a message to a contact."""

from axint import define_intent, param

send_message = define_intent(
    name="SendMessage",
    title="Send Message",
    description="Send a message to a contact",
    domain="messaging",
    params={
        "recipient": param.string("Who to send to"),
        "message": param.string("Message content"),
    },
    perform=lambda recipient, message: {"status": "sent"},
)
''',
    },
    {
        "id": "create-event",
        "title": "Create Calendar Event",
        "domain": "productivity",
        "source": '''"""Create a calendar event."""

from axint import define_intent, param

create_event = define_intent(
    name="CreateEvent",
    title="Create Calendar Event",
    description="Create a new event on the calendar",
    domain="productivity",
    params={
        "title": param.string("Event title"),
        "start_date": param.date("Start date"),
    },
    perform=lambda title, start_date: {"event_id": "uuid"},
)
''',
    },
    {
        "id": "play-music",
        "title": "Play Music",
        "domain": "media",
        "source": '''"""Play music from the library."""

from axint import define_intent, param

play_music = define_intent(
    name="PlayMusic",
    title="Play Music",
    description="Play music from the user's library",
    domain="media",
    params={
        "artist": param.string("Artist name"),
    },
    perform=lambda artist: {"now_playing": artist},
)
''',
    },
]

DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "health": [
        "health",
        "fitness",
        "workout",
        "step",
        "calorie",
        "heart",
        "sleep",
        "water",
        "hydration",
        "weight",
        "medication",
        "vitamin",
    ],
    "messaging": ["message", "chat", "send", "text", "email", "sms", "contact"],
    "smart-home": [
        "thermostat",
        "light",
        "lock",
        "garage",
        "home",
        "smart",
        "device",
        "temperature",
    ],
    "navigation": ["direction", "navigate", "map", "location", "route", "drive", "walk"],
    "productivity": [
        "note",
        "task",
        "reminder",
        "calendar",
        "event",
        "todo",
        "schedule",
        "appointment",
        "bookmark",
    ],
    "finance": [
        "expense",
        "budget",
        "payment",
        "transaction",
        "money",
        "cost",
        "invoice",
        "bill",
    ],
    "commerce": ["order", "cart", "buy", "purchase", "shop", "product", "checkout"],
    "media": ["play", "music", "song", "podcast", "video", "playlist", "track", "stream"],
}

PARAM_PATTERNS: dict[str, dict[str, ParamKind]] = {
    "health": {"type": "string", "duration": "duration", "calories": "int"},
    "messaging": {"recipient": "string", "body": "string"},
    "navigation": {"destination": "string", "mode": "string"},
    "finance": {"amount": "double", "category": "string", "currency": "string"},
    "commerce": {"productId": "string", "quantity": "int"},
    "media": {"query": "string", "shuffle": "boolean"},
    "productivity": {"title": "string", "date": "date", "notes": "string"},
    "smart-home": {"device": "string", "value": "string"},
}

SUGGESTION_CATALOG: list[dict[str, Any]] = [
    {
        "domain": "health",
        "keywords": [
            "health",
            "fitness",
            "workout",
            "step",
            "calorie",
            "sleep",
            "water",
            "weight",
            "medication",
            "hydration",
        ],
        "features": [
            {
                "name": "Log Workout via Siri",
                "description": "Let users log workouts with type, duration, and calories through Siri and Shortcuts.",
                "surfaces": ["intent", "widget"],
                "complexity": "low",
                "featurePrompt": "Let users log workouts with type, duration, and calories via Siri",
            },
            {
                "name": "Daily Step Count Widget",
                "description": "Home screen widget showing today's step count with a progress ring.",
                "surfaces": ["widget"],
                "complexity": "low",
                "featurePrompt": "Show daily step count with progress on a home screen widget",
            },
            {
                "name": "Log Water Intake",
                "description": "Quick Siri action to log glasses of water with a companion widget.",
                "surfaces": ["intent", "widget"],
                "complexity": "low",
                "featurePrompt": "Let users log water intake via Siri with a hydration tracking widget",
            },
        ],
    },
    {
        "domain": "productivity",
        "keywords": [
            "task",
            "note",
            "todo",
            "reminder",
            "calendar",
            "event",
            "schedule",
            "project",
            "organize",
        ],
        "features": [
            {
                "name": "Create Task via Siri",
                "description": "Add tasks with title, due date, and priority through Siri and Shortcuts.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users create tasks with title, due date, and priority via Siri",
            },
            {
                "name": "Quick Note from Siri",
                "description": "Capture a note with title and body through voice, searchable in Spotlight.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users create quick notes via Siri searchable in Spotlight",
            },
            {
                "name": "Upcoming Tasks Widget",
                "description": "Home screen widget showing the next 3-5 tasks with due dates.",
                "surfaces": ["widget"],
                "complexity": "low",
                "featurePrompt": "Show upcoming tasks with due dates on a home screen widget",
            },
        ],
    },
    {
        "domain": "finance",
        "keywords": [
            "expense",
            "budget",
            "money",
            "payment",
            "transaction",
            "invoice",
            "bill",
            "bank",
        ],
        "features": [
            {
                "name": "Log Expense via Siri",
                "description": "Quickly log expenses with amount, category, and note through voice.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users log expenses with amount, category, and note via Siri",
            },
            {
                "name": "Budget Overview Widget",
                "description": "Widget showing remaining budget and spending breakdown for the month.",
                "surfaces": ["widget"],
                "complexity": "medium",
                "featurePrompt": "Show monthly budget remaining and spending breakdown on a widget",
            },
            {
                "name": "Spending Summary View",
                "description": "SwiftUI view with charts breaking down spending by category.",
                "surfaces": ["view"],
                "complexity": "high",
                "featurePrompt": "Create a spending summary view with category breakdown charts",
            },
        ],
    },
    {
        "domain": "commerce",
        "keywords": [
            "shop",
            "order",
            "cart",
            "product",
            "buy",
            "purchase",
            "checkout",
            "delivery",
        ],
        "features": [
            {
                "name": "Reorder Last Purchase",
                "description": "One-tap reorder of a previous purchase through Siri.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users reorder their last purchase via Siri",
            },
            {
                "name": "Order Status Widget",
                "description": "Widget showing current order status and estimated delivery.",
                "surfaces": ["widget"],
                "complexity": "low",
                "featurePrompt": "Show current order status and delivery estimate on a widget",
            },
            {
                "name": "Product Search in Spotlight",
                "description": "Make products searchable through Spotlight with indexed entities.",
                "surfaces": ["intent"],
                "complexity": "medium",
                "featurePrompt": "Make products searchable in Spotlight with name and price",
            },
        ],
    },
    {
        "domain": "media",
        "keywords": [
            "music",
            "song",
            "podcast",
            "video",
            "playlist",
            "stream",
            "play",
            "track",
            "album",
            "artist",
        ],
        "features": [
            {
                "name": "Play Content via Siri",
                "description": "Play music, podcasts, or videos by name through Siri.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users play content by name via Siri",
            },
            {
                "name": "Now Playing Widget",
                "description": "Widget showing currently playing track with controls.",
                "surfaces": ["widget"],
                "complexity": "medium",
                "featurePrompt": "Show now-playing track info on a home screen widget",
            },
            {
                "name": "Create Playlist via Siri",
                "description": "Generate a playlist by mood or genre through voice.",
                "surfaces": ["intent"],
                "complexity": "medium",
                "featurePrompt": "Let users create a playlist by mood or genre via Siri",
            },
        ],
    },
    {
        "domain": "messaging",
        "keywords": [
            "message",
            "chat",
            "send",
            "text",
            "email",
            "sms",
            "contact",
            "conversation",
        ],
        "features": [
            {
                "name": "Send Message via Siri",
                "description": "Send messages to contacts through Siri and Shortcuts.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users send messages to contacts via Siri",
            },
            {
                "name": "Unread Messages Widget",
                "description": "Widget showing unread message count and latest sender.",
                "surfaces": ["widget"],
                "complexity": "low",
                "featurePrompt": "Show unread message count and latest messages on a widget",
            },
            {
                "name": "Quick Reply from Siri",
                "description": "Reply to the most recent message from a contact through voice.",
                "surfaces": ["intent"],
                "complexity": "medium",
                "featurePrompt": "Let users reply to recent messages via Siri",
            },
        ],
    },
    {
        "domain": "smart-home",
        "keywords": [
            "thermostat",
            "light",
            "lock",
            "garage",
            "home",
            "smart",
            "device",
            "temperature",
            "sensor",
            "scene",
        ],
        "features": [
            {
                "name": "Control Device via Siri",
                "description": "Turn devices on or off or adjust settings through Siri.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users control smart home devices via Siri",
            },
            {
                "name": "Room Status Widget",
                "description": "Widget showing temperature, humidity, and device states for a room.",
                "surfaces": ["widget"],
                "complexity": "medium",
                "featurePrompt": "Show room temperature and device status on a home screen widget",
            },
            {
                "name": "Set Scene via Siri",
                "description": "Activate a smart home scene through voice.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users activate smart home scenes via Siri",
            },
        ],
    },
    {
        "domain": "navigation",
        "keywords": [
            "map",
            "direction",
            "navigate",
            "location",
            "route",
            "drive",
            "walk",
            "destination",
            "gps",
        ],
        "features": [
            {
                "name": "Navigate to Location",
                "description": "Start navigation to an address or saved place through Siri.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users start navigation to a destination via Siri",
            },
            {
                "name": "Commute Widget",
                "description": "Widget showing estimated commute time and current traffic.",
                "surfaces": ["widget"],
                "complexity": "medium",
                "featurePrompt": "Show commute time and traffic conditions on a home screen widget",
            },
            {
                "name": "Save Location via Siri",
                "description": "Bookmark the current location or a named place for later.",
                "surfaces": ["intent"],
                "complexity": "low",
                "featurePrompt": "Let users save locations for later via Siri",
            },
        ],
    },
]


def _camel_to_title(name: str) -> str:
    return _humanize(name)


def _humanize(name: str) -> str:
    spaced = re.sub(r"[_-]+", " ", name)
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", spaced).strip()
    if not spaced:
        return ""
    return spaced[0].upper() + spaced[1:]


def _infer_name(description: str) -> str:
    cleaned = re.sub(
        r"^(let users?|allow users? to|add|create|enable|implement|build)\s+",
        "",
        description,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\s+(via siri|through shortcuts|in spotlight|for the app|to the app)\s*\.?$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", "", cleaned).strip()
    words = cleaned.split()[:3]
    if not words:
        return "CustomFeature"
    return "".join(word[:1].upper() + word[1:].lower() for word in words)


def _infer_domain(description: str) -> str | None:
    lower = description.lower()
    best_domain: str | None = None
    best_score = 0
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lower)
        if score > best_score:
            best_domain = domain
            best_score = score
    return best_domain if best_score > 0 else None


def _infer_params(description: str) -> dict[str, ParamKind]:
    domain = _infer_domain(description)
    if domain and domain in PARAM_PATTERNS:
        return dict(PARAM_PATTERNS[domain])
    return {"input": "string"}


def _schema_type_to_param_type(type_str: str) -> ParamKind:
    if type_str == "number":
        return "int"
    if type_str in {"string", "int", "double", "float", "boolean", "date", "duration", "url"}:
        return type_str
    return "string"


def _default_for_type(type_str: str) -> object:
    if type_str == "string":
        return ""
    if type_str == "int":
        return 0
    if type_str in {"double", "float"}:
        return 0.0
    if type_str == "boolean":
        return False
    return ""


def _test_value_for_type(type_str: str) -> str:
    if type_str == "string":
        return '"test"'
    if type_str == "int":
        return "1"
    if type_str in {"double", "float"}:
        return "1.0"
    if type_str == "boolean":
        return "true"
    if type_str == "date":
        return "Date()"
    if type_str == "duration":
        return "Duration.seconds(60)"
    if type_str == "url":
        return 'URL(string: "https://example.com")!'
    return '"test"'


def _raw_body(swift: str) -> tuple[dict[str, Any], ...]:
    return ({"type": "raw", "swift": swift},)


def scaffold_intent(
    name: str,
    description: str,
    domain: str | None = None,
    params: list[dict[str, str]] | None = None,
) -> str:
    title = _camel_to_title(name)
    name_lower = name[0].lower() + name[1:]

    domain_line = f'\n    domain="{domain}",' if domain else ""

    params_line = ""
    params_lambda = ""
    if params:
        param_defs: list[str] = []
        lambda_args: list[str] = []
        for p in params:
            pname = p.get("name", "")
            ptype = p.get("type", "string")
            pdesc = p.get("description", "")
            normalized = _schema_type_to_param_type(ptype)
            param_defs.append(f'        "{pname}": param.{normalized}("{pdesc}"),')
            lambda_args.append(pname)
        params_line = "\n    params={\n" + "\n".join(param_defs) + "\n    },"
        params_lambda = " " + ", ".join(lambda_args) if lambda_args else ""

    return SCAFFOLD_INTENT_TEMPLATE.format(
        name=name,
        name_lower=name_lower,
        title=title,
        description=description,
        domain_line=domain_line,
        params_line=params_line,
        params_lambda=params_lambda,
    )


def _format_compile_output(
    sections: list[tuple[str, str]],
) -> str:
    parts: list[str] = []
    for heading, content in sections:
        parts.append(f"// ─── {heading} ──────────────────────────")
        parts.append(content)
        parts.append("")
    return "\n".join(parts).strip()


def _format_schema_output(swift_code: str, input_tokens: int) -> str:
    output_tokens = len(swift_code) // 4
    compression_ratio = f"{output_tokens / input_tokens:.2f}" if input_tokens > 0 else "0.00"
    tokens_saved = input_tokens - output_tokens
    token_stats = f"""
// ─── Token Statistics ────────────────────────────────────────
// Input tokens (JSON schema):     ~{input_tokens}
// Output tokens (Swift code):     ~{output_tokens}
// Compression ratio:              {compression_ratio}x
// Tokens saved:                   {'+' if tokens_saved > 0 else ''}{tokens_saved}
"""
    return token_stats.strip() + "\n\n" + swift_code


def _parse_all(source: str, file: str) -> dict[str, list[Any]]:
    result: dict[str, list[Any]] = {"intents": [], "views": [], "widgets": [], "apps": []}
    with suppress(ParserError):
        result["intents"] = parse_source(source, file=file)
    with suppress(ParserError):
        result["views"] = parse_view_source(source, file=file)
    with suppress(ParserError):
        result["widgets"] = parse_widget_source(source, file=file)
    with suppress(ParserError):
        result["apps"] = parse_app_source(source, file=file)
    return result


def _diagnostics_to_dicts(diagnostics: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "code": d.code,
            "severity": d.severity,
            "message": d.message,
            "file": d.file,
            "suggestion": d.suggestion,
        }
        for d in diagnostics
    ]


def _compile_all_source(
    source: str,
    file_name: str,
    *,
    emit_info_plist: bool = False,
    emit_entitlements: bool = False,
) -> str:
    parsed = _parse_all(source, file_name)
    total = sum(len(v) for v in parsed.values())
    if total == 0:
        return "error: No Axint definitions found in source"

    sections: list[tuple[str, str]] = []
    diagnostics: list[str] = []

    for ir in parsed["intents"]:
        diags = validate_intent(ir)
        if any(d.severity == "error" for d in diags):
            diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags)
            continue
        sections.append((f"{ir.name}.swift", generate_swift(ir)))
        if emit_info_plist:
            fragment = generate_info_plist_fragment(ir)
            if fragment:
                sections.append((f"{ir.name}.plist.fragment.xml", fragment))
        if emit_entitlements:
            fragment = generate_entitlements_fragment(ir)
            if fragment:
                sections.append((f"{ir.name}.entitlements.fragment.xml", fragment))
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags if d.severity != "error")

    for ir in parsed["views"]:
        diags = validate_view(ir)
        if any(d.severity == "error" for d in diags):
            diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags)
            continue
        sections.append((f"{ir.name}.swift", generate_swift_view(ir)))
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags if d.severity != "error")

    for ir in parsed["widgets"]:
        diags = validate_widget(ir)
        if any(d.severity == "error" for d in diags):
            diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags)
            continue
        sections.append((f"{ir.name}Widget.swift", generate_swift_widget(ir)))
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags if d.severity != "error")

    for ir in parsed["apps"]:
        diags = validate_app(ir)
        if any(d.severity == "error" for d in diags):
            diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags)
            continue
        sections.append((f"{ir.name}App.swift", generate_swift_app(ir)))
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in diags if d.severity != "error")

    if not sections and diagnostics:
        return "\n".join(diagnostics)

    output = _format_compile_output(sections)
    if diagnostics:
        output += "\n\n// ─── Diagnostics ─────────────────────\n" + "\n".join(diagnostics)
    return output


def _validate_all_source(source: str, file_name: str) -> str:
    parsed = _parse_all(source, file_name)
    total = sum(len(v) for v in parsed.values())
    if total == 0:
        return json.dumps([], indent=2)

    diagnostics: list[dict[str, Any]] = []
    for ir in parsed["intents"]:
        diagnostics.extend(_diagnostics_to_dicts(validate_intent(ir)))
    for ir in parsed["views"]:
        diagnostics.extend(_diagnostics_to_dicts(validate_view(ir)))
    for ir in parsed["widgets"]:
        diagnostics.extend(_diagnostics_to_dicts(validate_widget(ir)))
    for ir in parsed["apps"]:
        diagnostics.extend(_diagnostics_to_dicts(validate_app(ir)))
    return json.dumps(diagnostics, indent=2)


def handle_intent_schema(args: dict[str, Any]) -> str:
    name = args.get("name")
    if not name:
        return "[AX002] error: Intent schema requires a 'name' field"

    title = args.get("title") or _camel_to_title(name)
    description = args.get("description", "")
    domain = args.get("domain", "")

    params_dict: dict[str, str] = args.get("params", {})
    parameters = tuple(
        IntentParameter(
            name=pname,
            type=_schema_type_to_param_type(ptype),
            description=_camel_to_title(pname),
        )
        for pname, ptype in params_dict.items()
    )

    ir = IntentIR(
        name=name,
        title=title,
        description=description,
        domain=domain,
        parameters=parameters,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4
    try:
        swift_code = generate_swift(ir)
        return _format_schema_output(swift_code, input_tokens)
    except Exception as e:  # pragma: no cover - defensive
        return f"[AX001] error: {e!s}"


def handle_view_schema(args: dict[str, Any]) -> str:
    name = args.get("name")
    if not name:
        return "[AX301] error: View schema requires a 'name' field"

    props_dict: dict[str, str] = args.get("props", {})
    state_dict: dict[str, Any] = args.get("state", {})
    body = args.get("body") or f'VStack {{ Text("{_humanize(name)}") }}'

    ir = ViewIR(
        name=name,
        props=tuple(
            ViewPropIR(name=pname, type=_schema_type_to_param_type(ptype))
            for pname, ptype in props_dict.items()
        ),
        state=tuple(
            ViewStateIR(
                name=sname,
                type=_schema_type_to_param_type(str(sconfig.get("type", "string"))),
                default=sconfig.get("default"),
            )
            for sname, sconfig in state_dict.items()
        ),
        body=_raw_body(body),
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4
    try:
        swift_code = generate_swift_view(ir)
        return _format_schema_output(swift_code, input_tokens)
    except Exception as e:  # pragma: no cover - defensive
        return f"[AX301] error: {e!s}"


def handle_widget_schema(args: dict[str, Any]) -> str:
    name = args.get("name")
    if not name:
        return "[AX401] error: Widget schema requires a 'name' field"

    display_name = args.get("display_name") or args.get("displayName") or _camel_to_title(name)
    description = args.get("description", "")
    families = tuple(args.get("families", ["systemSmall"]))
    entry_dict: dict[str, str] = args.get("entry", {})
    body = args.get("body") or f'VStack {{ Text("{_humanize(name)}") }}'
    refresh_interval = args.get("refresh_interval") or args.get("refreshInterval")

    entries = tuple(
        WidgetEntryIR(name=entry_name, type=_schema_type_to_param_type(entry_type))
        for entry_name, entry_type in entry_dict.items()
    )

    ir = WidgetIR(
        name=name,
        display_name=display_name,
        description=description,
        families=families,
        entry=entries,
        body=_raw_body(body),
        refresh_interval=refresh_interval,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4
    try:
        swift_code = generate_swift_widget(ir)
        return _format_schema_output(swift_code, input_tokens)
    except Exception as e:  # pragma: no cover - defensive
        return f"[AX401] error: {e!s}"


def handle_app_schema(args: dict[str, Any]) -> str:
    name = args.get("name")
    if not name:
        return "[AX501] error: App schema requires a 'name' field"

    scenes = tuple(
        AppSceneIR(
            kind=scene["kind"],
            view=scene["view"],
            title=scene.get("title"),
            name=scene.get("name"),
            platform=scene.get("platform"),
        )
        for scene in args.get("scenes", [])
    )
    app_storage = tuple(
        AppStorageIR(
            name=storage["name"],
            key=storage["key"],
            type=_schema_type_to_param_type(storage.get("type", "string")),
            default=storage.get("default"),
        )
        for storage in args.get("appStorage", [])
    )

    ir = AppIR(
        name=name,
        scenes=scenes,
        app_storage=app_storage,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4
    try:
        swift_code = generate_swift_app(ir)
        return _format_schema_output(swift_code, input_tokens)
    except Exception as e:  # pragma: no cover - defensive
        return f"[AX501] error: {e!s}"


def handle_compile_from_schema(args: dict[str, Any]) -> str:
    schema_type = args.get("type")
    if schema_type == "intent":
        return handle_intent_schema(args)
    if schema_type == "view":
        return handle_view_schema(args)
    if schema_type == "widget":
        return handle_widget_schema(args)
    if schema_type == "app":
        return handle_app_schema(args)
    return f"Invalid type: {schema_type}"


def suggest_features(input_args: dict[str, Any]) -> list[dict[str, Any]]:
    limit = int(input_args.get("limit") or 5)
    app_description = str(input_args.get("appDescription", ""))
    lower = app_description.lower()
    explicit_domain = str(input_args.get("domain", "")).lower() or None

    scored: list[dict[str, Any]] = []
    for domain_set in SUGGESTION_CATALOG:
        score = 10 if explicit_domain == domain_set["domain"] else 0
        score += sum(1 for kw in domain_set["keywords"] if kw in lower)
        if score > 0:
            scored.append({**domain_set, "score": score})

    if not scored:
        fallback = next(ds for ds in SUGGESTION_CATALOG if ds["domain"] == "productivity")
        return [{**feature, "domain": "productivity"} for feature in fallback["features"][:limit]]

    scored.sort(key=lambda item: item["score"], reverse=True)
    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for domain_set in scored:
        for feature in domain_set["features"]:
            if feature["name"] in seen:
                continue
            seen.add(feature["name"])
            suggestions.append({**feature, "domain": domain_set["domain"]})
            if len(suggestions) >= limit:
                return suggestions
    return suggestions


def _build_feature_view_body(name: str, state: dict[str, ParamKind]) -> str:
    lines: list[str] = ["NavigationStack {", "    VStack(spacing: 16) {"]
    if state:
        for key, value in state.items():
            if value == "boolean":
                lines.append(f'        Toggle("{_humanize(key)}", isOn: ${key})')
            else:
                lines.append(f'        Text("{_humanize(key)}: \\({key})")')
    else:
        lines.append('        Text("Hello")')
    lines.extend(
        [
            "    }",
            "    .padding()",
            f'    .navigationTitle("{_humanize(name)}")',
            "}",
        ]
    )
    return "\n".join(lines)


def _build_feature_widget_body(name: str, entries: list[WidgetEntryIR]) -> str:
    value_lines = [
        f'        Text("\\(entry.{entry.name})")'
        for entry in entries
        if entry.name != "date"
    ]
    if not value_lines:
        value_lines = ['        Text("—")']
    lines = [
        "VStack(alignment: .leading, spacing: 8) {",
        f'    Text("{_humanize(name)}")',
        "        .font(.headline)",
        *value_lines,
        "}",
        ".padding()",
    ]
    return "\n".join(lines)


def _generate_intent_test(name: str, params: dict[str, ParamKind]) -> str:
    assignments = "\n".join(
        f"        intent.{key} = {_test_value_for_type(param_type)}"
        for key, param_type in params.items()
    )
    return f"""import XCTest
import AppIntents

final class {name}IntentTests: XCTestCase {{
    func test{name}IntentConformance() {{
        let intent = {name}Intent()
        XCTAssertNotNil(intent)
    }}

    func test{name}IntentTitle() {{
        let intent = {name}Intent()
        XCTAssertFalse(intent.title.description.isEmpty)
    }}

    func test{name}IntentPerform() async throws {{
        var intent = {name}Intent()
{assignments}
        let result = try await intent.perform()
        XCTAssertNotNil(result)
    }}
}}
"""


def _generate_widget_test(name: str) -> str:
    return f"""import XCTest
import WidgetKit

final class {name}WidgetTests: XCTestCase {{
    func test{name}WidgetConfiguration() {{
        let widget = {name}Widget()
        XCTAssertNotNil(widget)
    }}
}}
"""


def generate_feature_package(input_args: dict[str, Any]) -> str:
    description = str(input_args.get("description", "")).strip()
    if not description:
        return "Error: 'description' is required for axint.feature"

    name = str(input_args.get("name") or _infer_name(description))
    surfaces = input_args.get("surfaces") or ["intent"]
    domain = str(input_args.get("domain") or (_infer_domain(description) or ""))
    raw_params = input_args.get("params")
    params = {
        key: _schema_type_to_param_type(value)
        for key, value in (raw_params.items() if isinstance(raw_params, dict) else _infer_params(description).items())
    }

    diagnostics: list[str] = []
    output_files: list[tuple[str, str, str]] = []

    if "intent" in surfaces:
        intent_ir = IntentIR(
            name=name,
            title=_humanize(name),
            description=description,
            domain=domain,
            parameters=tuple(
                IntentParameter(name=key, type=value, description=_humanize(key))
                for key, value in params.items()
            ),
            source_file="<feature>",
        )
        intent_diags = validate_intent(intent_ir)
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in intent_diags)
        if not any(d.severity == "error" for d in intent_diags):
            output_files.append((f"Sources/Intents/{name}Intent.swift", generate_swift(intent_ir), "swift"))
            plist = generate_info_plist_fragment(intent_ir)
            entitlements = generate_entitlements_fragment(intent_ir)
            if plist:
                output_files.append(("Sources/Supporting/Info.plist.fragment.xml", plist, "plist"))
            if entitlements:
                output_files.append((f"Sources/Supporting/{name}.entitlements.fragment.xml", entitlements, "entitlements"))
            output_files.append((f"Tests/{name}IntentTests.swift", _generate_intent_test(name, params), "test"))

    if "widget" in surfaces:
        entries = [WidgetEntryIR(name="date", type="date")]
        entries.extend(
            WidgetEntryIR(name=key, type=value)
            for key, value in list(params.items())[:4]
            if key != "date"
        )
        widget_ir = WidgetIR(
            name=f"{name}Widget",
            display_name=_humanize(name),
            description=description,
            families=("systemSmall", "systemMedium"),
            entry=tuple(entries),
            body=_raw_body(_build_feature_widget_body(name, entries)),
            source_file="<feature>",
        )
        widget_diags = validate_widget(widget_ir)
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in widget_diags)
        if not any(d.severity == "error" for d in widget_diags):
            output_files.append((f"Sources/Widgets/{name}Widget.swift", generate_swift_widget(widget_ir), "swift"))
            output_files.append((f"Tests/{name}WidgetTests.swift", _generate_widget_test(name), "test"))

    if "view" in surfaces:
        view_state = tuple(
            ViewStateIR(name=key, type=value, default=_default_for_type(value))
            for key, value in params.items()
        )
        view_ir = ViewIR(
            name=f"{name}View",
            state=view_state,
            body=_raw_body(_build_feature_view_body(name, params)),
            source_file="<feature>",
        )
        view_diags = validate_view(view_ir)
        diagnostics.extend(f"[{d.code}] {d.severity}: {d.message}" for d in view_diags)
        if not any(d.severity == "error" for d in view_diags):
            output_files.append((f"Sources/Views/{name}View.swift", generate_swift_view(view_ir), "swift"))

    swift_count = sum(1 for _, _, kind in output_files if kind == "swift")
    test_count = sum(1 for _, _, kind in output_files if kind == "test")
    summary_lines = [
        f'Generated {swift_count} Swift file{"s" if swift_count != 1 else ""} + {test_count} test{"s" if test_count != 1 else ""} for "{name}"',
        f"Surfaces: {', '.join(surfaces)}",
    ]
    if domain:
        summary_lines.append(f"Domain: {domain}")
    summary_lines.append("Files:")
    summary_lines.extend(f"  {path} ({kind})" for path, _, kind in output_files)

    output: list[str] = ["\n".join(summary_lines), ""]
    for path, content, _kind in output_files:
        output.append(f"// ─── {path} ───")
        output.append(content)
        output.append("")
    if diagnostics:
        output.append("// ─── Diagnostics ───")
        output.extend(diagnostics)
    return "\n".join(output).strip()


def _resolve_js_bridge_import() -> tuple[str, Path] | None:
    repo_root = Path(__file__).resolve().parents[2]
    dist_entry = repo_root / "dist" / "core" / "index.js"
    if dist_entry.exists():
        return (dist_entry.resolve().as_uri(), repo_root)
    return None


def _run_js_bridge(tool: Literal["validate", "fix"], source: str, file_name: str) -> str:
    resolved = _resolve_js_bridge_import()
    if resolved is None:
        return (
            "error: Advanced Swift tools require the Axint TypeScript compiler build. "
            "Run `npm run build` in the Axint repo before calling this tool."
        )

    import_path, cwd = resolved
    exported = "validateSwiftSource" if tool == "validate" else "fixSwiftSource"
    expression = (
        "validateSwiftSource(source)"
        if tool == "validate"
        else "fixSwiftSource(source, fileName)"
    )
    script = f"""
import {{ {exported} }} from "{import_path}";
const source = process.argv[1];
const fileName = process.argv[2] || "input.swift";
const result = {expression};
process.stdout.write(JSON.stringify(result));
"""
    try:
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", script, source, file_name],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return "error: Node.js is required for axint.swift.validate and axint.swift.fix."
    except subprocess.CalledProcessError as exc:  # pragma: no cover - depends on environment
        stderr = exc.stderr.strip() if exc.stderr else "unknown Node bridge error"
        return f"error: {stderr}"
    return completed.stdout


def build_server() -> Server:
    if MCP_IMPORT_ERROR is not None:  # pragma: no cover - exercised without optional dep
        raise RuntimeError("mcp package not installed. Install with: pip install 'axint[mcp]'")

    server = Server("axint")

    tool_annotations = ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )

    aliases = {
        "axint.feature": "axint_feature",
        "axint.suggest": "axint_suggest",
        "axint.scaffold": "axint_scaffold",
        "axint.compile": "axint_compile",
        "axint.validate": "axint_validate",
        "axint.schema.compile": "axint_compile_from_schema",
        "axint.swift.validate": "axint_swift_validate",
        "axint.swift.fix": "axint_swift_fix",
        "axint.templates.list": "axint_list_templates",
        "axint.templates.get": "axint_template",
    }

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="axint.feature",
                description="Generate a complete Apple-native feature package from a description. Returns file-by-file Swift output, companion surfaces, and tests.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "surfaces": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["intent", "view", "widget"]},
                        },
                        "name": {"type": "string"},
                        "appName": {"type": "string"},
                        "domain": {"type": "string"},
                        "params": {"type": "object", "additionalProperties": {"type": "string"}},
                    },
                    "required": ["description"],
                },
            ),
            Tool(
                name="axint.suggest",
                description="Suggest Apple-native features for an app based on its domain or description.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "appDescription": {"type": "string"},
                        "domain": {"type": "string"},
                        "limit": {"type": "number"},
                    },
                    "required": ["appDescription"],
                },
            ),
            Tool(
                name="axint.scaffold",
                description="Generate a starter Python intent file from a name and description.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "domain": {"type": "string"},
                        "params": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "type": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["name", "type", "description"],
                            },
                        },
                    },
                    "required": ["name", "description"],
                },
            ),
            Tool(
                name="axint.compile",
                description="Compile Python Axint source into Swift, Info.plist fragments, and entitlements fragments.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "file_name": {"type": "string"},
                        "emit_info_plist": {"type": "boolean"},
                        "emit_entitlements": {"type": "boolean"},
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint.validate",
                description="Validate Python Axint source without generating Swift. Returns diagnostics as JSON.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "file_name": {"type": "string"},
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint.schema.compile",
                description="Compile a minimal JSON schema directly to Swift. Supports intents, views, widgets, and apps.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["intent", "view", "widget", "app"]},
                        "name": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "domain": {"type": "string"},
                        "params": {"type": "object", "additionalProperties": {"type": "string"}},
                        "props": {"type": "object", "additionalProperties": {"type": "string"}},
                        "state": {"type": "object"},
                        "body": {"type": "string"},
                        "display_name": {"type": "string"},
                        "displayName": {"type": "string"},
                        "families": {"type": "array", "items": {"type": "string"}},
                        "entry": {"type": "object", "additionalProperties": {"type": "string"}},
                        "refresh_interval": {"type": "number"},
                        "refreshInterval": {"type": "number"},
                        "scenes": {"type": "array", "items": {"type": "object"}},
                        "appStorage": {"type": "array", "items": {"type": "object"}},
                    },
                    "required": ["type", "name"],
                },
            ),
            Tool(
                name="axint.swift.validate",
                description="Validate existing Swift source against Axint's Swift validator rules.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "file": {"type": "string"},
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint.swift.fix",
                description="Auto-fix mechanical Swift issues detected by the shared Axint Swift fixer.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "file": {"type": "string"},
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint.templates.list",
                description="List bundled reference templates.",
                annotations=tool_annotations,
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="axint.templates.get",
                description="Return the full Python source code of a bundled template by id.",
                annotations=tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                    "required": ["id"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> str:
        name = aliases.get(name, name)

        if name == "axint_feature":
            return generate_feature_package(arguments)

        if name == "axint_suggest":
            if not arguments.get("appDescription"):
                return "Error: 'appDescription' is required for axint.suggest"
            suggestions = suggest_features(arguments)
            if not suggestions:
                return "No specific suggestions for this app description. Try providing more detail."
            output = []
            for index, suggestion in enumerate(suggestions, start=1):
                surfaces = ", ".join(suggestion["surfaces"])
                output.append(
                    f'{index}. {suggestion["name"]}\n'
                    f'   {suggestion["description"]}\n'
                    f'   Surfaces: {surfaces} | Complexity: {suggestion["complexity"]}\n'
                    f'   Prompt: "{suggestion["featurePrompt"]}"'
                )
            return (
                "Suggested Apple-native features:\n\n"
                + "\n\n".join(output)
                + "\n\nUse axint.feature with any prompt above to generate the full feature package."
            )

        if name == "axint_scaffold":
            return scaffold_intent(
                name=arguments["name"],
                description=arguments["description"],
                domain=arguments.get("domain"),
                params=arguments.get("params"),
            )

        if name == "axint_compile":
            return _compile_all_source(
                arguments["source"],
                arguments.get("file_name", "<mcp>"),
                emit_info_plist=bool(arguments.get("emit_info_plist")),
                emit_entitlements=bool(arguments.get("emit_entitlements")),
            )

        if name == "axint_validate":
            return _validate_all_source(arguments["source"], arguments.get("file_name", "<validate>"))

        if name == "axint_compile_from_schema":
            return handle_compile_from_schema(arguments)

        if name == "axint_swift_validate":
            return _run_js_bridge("validate", arguments["source"], arguments.get("file", "<mcp.swift>"))

        if name == "axint_swift_fix":
            return _run_js_bridge("fix", arguments["source"], arguments.get("file", "<mcp.swift>"))

        if name == "axint_list_templates":
            if not TEMPLATES:
                return "No templates registered."
            return "\n".join(
                f"{template['id']}  —  {template['title']}"
                f"{' [' + template['domain'] + ']' if template.get('domain') else ''}"
                for template in TEMPLATES
            )

        if name == "axint_template":
            template_id = arguments.get("id")
            for template in TEMPLATES:
                if template["id"] == template_id:
                    return str(template["source"])
            return f"Unknown template id: {template_id}. Use axint.templates.list to see available ids."

        return f"Unknown tool: {name}"

    return server


async def main() -> None:
    if MCP_IMPORT_ERROR is not None:  # pragma: no cover - exercised without optional dep
        print("error: mcp package not installed. Install with: pip install 'axint[mcp]'", file=sys.stderr)
        raise SystemExit(1)

    from mcp.server.stdio import StdioServerTransport

    server = build_server()
    async with StdioServerTransport() as transport, server:
        await server.connect(transport)


if __name__ == "__main__":
    asyncio.run(main())
