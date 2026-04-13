"""
Axint MCP Server for Python SDK.

Exposes Axint capabilities as MCP tools that AI coding assistants can call.

Tools:
  - axint_scaffold: Generate starter Python intent code
  - axint_compile: Compile Python intent → Swift App Intent
  - axint_validate: Validate intent definition without codegen
  - axint_compile_from_schema: JSON schema → Swift (token saver)
  - axint_list_templates: List bundled reference templates
  - axint_template: Return source of a specific template
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from typing import Any

try:
    from mcp.server import Server
    from mcp.types import Tool, ToolAnnotations
except ImportError:
    print("error: mcp package not installed. Install with: pip install mcp", file=sys.stderr)
    sys.exit(1)

from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
)
from .ir import AppIR, IntentIR, IntentParameter, ViewIR, WidgetIR
from .parser import ParserError, parse_source
from .validator import validate_intent

SCAFFOLD_INTENT_TEMPLATE = '''"""Intent definition for {name}."""

from axintai import define_intent, param

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

from axintai import define_intent, param

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

from axintai import define_intent, param

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

from axintai import define_intent, param

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


def _camel_to_title(name: str) -> str:
    """Convert CamelCase to Title Case."""
    return re.sub(r"([A-Z])", r" \1", name).strip()


def scaffold_intent(
    name: str,
    description: str,
    domain: str | None = None,
    params: list[dict[str, str]] | None = None,
) -> str:
    """Generate starter Python intent code."""
    title = _camel_to_title(name)
    name_lower = name[0].lower() + name[1:]

    domain_line = f"\n    domain=\"{domain}\"," if domain else ""

    params_line = ""
    params_lambda = ""
    if params:
        param_defs = []
        lambda_args = []
        for p in params:
            pname = p.get("name", "")
            ptype = p.get("type", "string")
            pdesc = p.get("description", "")
            param_defs.append(f'        "{pname}": param.{ptype}("{pdesc}"),')
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


def format_compile_output(
    swift_code: str,
    info_plist: str | None = None,
    entitlements: str | None = None,
) -> str:
    """Format compilation output with optional fragments."""
    parts = [
        "// ─── Swift ──────────────────────────",
        swift_code,
    ]
    if info_plist:
        parts.extend(["// ─── Info.plist fragment ────────────", info_plist])
    if entitlements:
        parts.extend(["// ─── .entitlements fragment ─────────", entitlements])
    return "\n".join(parts)


def format_schema_output(swift_code: str, input_tokens: int) -> str:
    """Format schema output with token statistics."""
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
    return token_stats + "\n\n" + swift_code


def schema_type_to_ir_type(type_str: str) -> dict[str, str]:
    """Convert schema type string to IR type."""
    normalized = "int" if type_str == "number" else type_str
    return {"kind": "primitive", "value": normalized}


def handle_intent_schema(args: dict[str, Any]) -> str:
    """Handle intent schema compilation."""
    name = args.get("name")
    title = args.get("title")
    description = args.get("description", "")
    domain = args.get("domain")

    if not title:
        title = _camel_to_title(name)

    params_dict: dict[str, str] = args.get("params", {})
    parameters = [
        IntentParameter(
            name=pname,
            type=schema_type_to_ir_type(ptype),
            title=_camel_to_title(pname),
            description="",
            is_optional=False,
        )
        for pname, ptype in params_dict.items()
    ]

    ir = IntentIR(
        name=name,
        title=title,
        description=description,
        domain=domain,
        parameters=parameters,
        return_type={"kind": "primitive", "value": "string"},
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4

    try:
        swift_code = generate_swift(ir)
        return format_schema_output(swift_code, input_tokens)
    except Exception as e:
        return f"[AX001] error: {e!s}"


def handle_view_schema(args: dict[str, Any]) -> str:
    """Handle view schema compilation."""
    name = args.get("name")
    if not name:
        return "[AX301] error: View schema requires a 'name' field"

    props_dict: dict[str, str] = args.get("props", {})
    props = [
        {"name": pname, "type": schema_type_to_ir_type(ptype), "is_optional": False}
        for pname, ptype in props_dict.items()
    ]

    state_dict: dict[str, Any] = args.get("state", {})
    state = [
        {
            "name": sname,
            "type": schema_type_to_ir_type(sconfig.get("type", "string")),
            "kind": "state",
            "default_value": sconfig.get("default"),
        }
        for sname, sconfig in state_dict.items()
    ]

    body = args.get("body")
    body_list = [{"kind": "raw", "swift": body}] if body else [{"kind": "text", "content": "VStack {}"}]

    ir = ViewIR(
        name=name,
        props=props,
        state=state,
        body=body_list,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4

    try:
        swift_code = generate_swift_view(ir)
        return format_schema_output(swift_code, input_tokens)
    except Exception as e:
        return f"[AX301] error: {e!s}"


def handle_widget_schema(args: dict[str, Any]) -> str:
    """Handle widget schema compilation."""
    name = args.get("name")
    display_name = args.get("display_name")

    if not name:
        return "[AX402] error: Widget schema requires a 'name' field"
    if not display_name:
        return "[AX403] error: Widget schema requires a 'displayName' field"

    entry_dict: dict[str, str] = args.get("entry", {})
    entry = [
        {"name": ename, "type": schema_type_to_ir_type(etype)}
        for ename, etype in entry_dict.items()
    ]

    families = args.get("families", ["systemSmall"])
    refresh_interval = args.get("refresh_interval")
    refresh_policy = "after" if refresh_interval else "atEnd"

    body = args.get("body")
    body_list = [{"kind": "raw", "swift": body}] if body else [{"kind": "text", "content": "Hello"}]

    ir = WidgetIR(
        name=name,
        display_name=display_name,
        description=args.get("description", ""),
        families=families,
        entry=entry,
        body=body_list,
        refresh_interval=refresh_interval,
        refresh_policy=refresh_policy,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4

    try:
        swift_code = generate_swift_widget(ir)
        return format_schema_output(swift_code, input_tokens)
    except Exception as e:
        return f"[AX402] error: {e!s}"


def handle_app_schema(args: dict[str, Any]) -> str:
    """Handle app schema compilation."""
    name = args.get("name")
    scenes_list = args.get("scenes", [])

    if not name:
        return "[AX502] error: App schema requires a 'name' field"
    if not scenes_list:
        return "[AX503] error: App schema requires at least one scene"

    scenes = []
    for idx, s in enumerate(scenes_list):
        scene = {
            "scene_kind": s.get("kind", "windowGroup"),
            "root_view": s.get("view", "ContentView"),
            "title": s.get("title"),
            "name": s.get("name"),
            "platform_guard": s.get("platform"),
            "is_default": idx == 0 and s.get("kind", "windowGroup") == "windowGroup",
        }
        scenes.append(scene)

    ir = AppIR(
        name=name,
        scenes=scenes,
        source_file="<schema>",
    )

    input_json = json.dumps(args)
    input_tokens = len(input_json) // 4

    try:
        swift_code = generate_swift_app(ir)
        return format_schema_output(swift_code, input_tokens)
    except Exception as e:
        return f"[AX502] error: {e!s}"


def handle_compile_from_schema(args: dict[str, Any]) -> str:
    """Handle compile_from_schema requests."""
    schema_type = args.get("type")
    name = args.get("name")

    if not name:
        return "[AX002] error: Schema requires a 'name' field"

    if schema_type == "intent":
        return handle_intent_schema(args)
    elif schema_type == "view":
        return handle_view_schema(args)
    elif schema_type == "widget":
        return handle_widget_schema(args)
    elif schema_type == "app":
        return handle_app_schema(args)
    else:
        return f"Invalid type: {schema_type}"


def build_server() -> Server:
    """Build and configure the MCP server."""
    server = Server("axint")

    _tool_annotations = ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="axint_scaffold",
                description=(
                    "Generate a starter Python intent file from a name and description. "
                    "Returns a complete define_intent() source string ready to save as a "
                    ".py file — no files are written, no network requests made. On invalid "
                    "domain values, returns an error string. The output compiles directly "
                    "with axint_compile. Use this when creating a new intent from scratch; "
                    "use axint_template for a working reference example, or "
                    "axint_compile_from_schema to generate Swift without writing Python."
                ),
                annotations=_tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": (
                                "PascalCase intent name, e.g., 'SendMessage' or 'CreateEvent'. "
                                "Must start with an uppercase letter and contain no spaces."
                            ),
                        },
                        "description": {
                            "type": "string",
                            "description": (
                                "Human-readable description of what the intent does, shown to "
                                "users in Shortcuts and Spotlight, e.g., 'Send a message to a contact'"
                            ),
                        },
                        "domain": {
                            "type": "string",
                            "description": (
                                "Apple App Intent domain. One of: messaging, productivity, health, "
                                "finance, commerce, media, navigation, smart-home. Omit if none apply."
                            ),
                        },
                        "params": {
                            "type": "array",
                            "description": (
                                "Initial parameters for the intent. Each item needs name (camelCase), "
                                "type (string | int | double | float | boolean | date | duration | url), "
                                "and description. Example: { name: 'recipient', type: 'string', "
                                "description: 'Contact to message' }."
                            ),
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
                name="axint_compile",
                description=(
                    "Compile Python source (define_intent() call) into native Swift "
                    "App Intent code. Returns { swift, info_plist?, entitlements? } as a "
                    "string — no files written, no network requests. On validation "
                    "failure, returns diagnostics (severity, AX error code, position, "
                    "fix suggestion) instead of Swift. Use axint_validate for cheaper "
                    "pre-flight checks without compilation output; use "
                    "axint_compile_from_schema to compile from JSON without writing "
                    "Python; use axint_scaffold to generate the Python input."
                ),
                annotations=_tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "description": (
                                "Full Python source code containing a define_intent() call. "
                                "Must be a complete file starting with an axintai import, not a fragment."
                            ),
                        },
                        "file_name": {
                            "type": "string",
                            "description": (
                                "Optional file name used in diagnostic messages, e.g., 'send_message.py'. "
                                "Defaults to 'input.py' if omitted."
                            ),
                        },
                        "emit_info_plist": {
                            "type": "boolean",
                            "description": (
                                "When true, returns an Info.plist XML fragment declaring the intent's "
                                "infoPlistKeys. Only relevant for intents that use restricted APIs. "
                                "Defaults to false."
                            ),
                        },
                        "emit_entitlements": {
                            "type": "boolean",
                            "description": (
                                "When true, returns an .entitlements XML fragment for the intent's "
                                "declared entitlements. Only relevant for intents requiring special "
                                "capabilities. Defaults to false."
                            ),
                        },
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint_validate",
                description=(
                    "Validate a Python intent definition without generating Swift "
                    "output. Returns an array of diagnostics, each with severity "
                    "(error | warning), error code (AXnnn), line/column position, and "
                    "a suggested fix. Returns an empty array when validation passes. "
                    "No files written, no network requests, no side effects. Use this "
                    "for cheap pre-flight checks before calling axint_compile, or to "
                    "surface errors in an editor. Prefer axint_compile directly when "
                    "you need the Swift output and can handle inline diagnostics."
                ),
                annotations=_tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "description": (
                                "Full Python source code containing a define_intent() call. "
                                "Must be a complete file starting with an axintai import, not a "
                                "code fragment. Same format accepted by axint_compile."
                            ),
                        },
                    },
                    "required": ["source"],
                },
            ),
            Tool(
                name="axint_compile_from_schema",
                description=(
                    "Compile a minimal JSON schema directly to Swift, bypassing the "
                    "Python DSL entirely. Supports intents, views, widgets, and "
                    "full apps via the 'type' parameter. Uses ~20 input tokens vs "
                    "hundreds for Python — ideal for LLM agents optimizing token "
                    "budgets. Returns Swift source with token usage stats; no files "
                    "written, no network requests. On invalid input, returns an error "
                    "message describing the issue. Use this for quick Swift generation "
                    "without writing Python; use axint_compile when you need the "
                    "full DSL for complex intents with custom perform() logic."
                ),
                annotations=_tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["intent", "view", "widget", "app"],
                            "description": (
                                "What to compile. Determines which other parameters are relevant: "
                                "intent uses params/domain/title; view uses props/state/body; "
                                "widget uses entry/families/body/display_name; app uses scenes."
                            ),
                        },
                        "name": {
                            "type": "string",
                            "description": (
                                "PascalCase name, e.g., 'CreateEvent' for intents, 'EventListView' "
                                "for views, 'StepsWidget' for widgets. Used as the Swift struct name."
                            ),
                        },
                        "title": {
                            "type": "string",
                            "description": (
                                "Human-readable title shown in Shortcuts/Spotlight. Intent only. "
                                "E.g., 'Create Event'. Defaults to a space-separated version of name."
                            ),
                        },
                        "description": {
                            "type": "string",
                            "description": (
                                "Description of what this intent/view/widget does. Shown to users "
                                "in system UI for intents. Optional but recommended."
                            ),
                        },
                        "domain": {
                            "type": "string",
                            "description": (
                                "Apple App Intent domain. Intent only. One of: messaging, "
                                "productivity, health, finance, commerce, media, navigation, "
                                "smart-home. Omit if no standard domain applies."
                            ),
                        },
                        "params": {
                            "type": "object",
                            "description": (
                                "Intent only. Parameter definitions as { fieldName: typeString }. "
                                "E.g., { recipient: 'string', amount: 'double' }. Supported types: "
                                "string, int, double, float, boolean, date, duration, url."
                            ),
                            "additionalProperties": {"type": "string"},
                        },
                        "props": {
                            "type": "object",
                            "description": (
                                "View only. Prop definitions as { fieldName: typeString }. "
                                "E.g., { title: 'string', count: 'int' }. Same type set as params."
                            ),
                            "additionalProperties": {"type": "string"},
                        },
                        "state": {
                            "type": "object",
                            "description": (
                                "View only. State variable definitions as "
                                "{ fieldName: { type: 'string', default?: value } }. "
                                "Generates @State properties in the SwiftUI view."
                            ),
                        },
                        "body": {
                            "type": "string",
                            "description": (
                                "View/widget only. Raw SwiftUI code for the body, e.g., "
                                "'VStack { Text(\"Hello\") }'. Wrapped in the struct automatically. "
                                "Can reference props, state, and entry fields by name."
                            ),
                        },
                        "display_name": {
                            "type": "string",
                            "description": (
                                "Widget only. Human-readable name shown in the widget gallery. "
                                "E.g., 'Daily Steps'. Defaults to a spaced version of name."
                            ),
                        },
                        "families": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "Widget only. Supported widget sizes: systemSmall, systemMedium, "
                                "systemLarge, systemExtraLarge, accessoryCircular, "
                                "accessoryRectangular, accessoryInline. Defaults to [systemSmall]."
                            ),
                        },
                        "entry": {
                            "type": "object",
                            "description": (
                                "Widget only. Timeline entry fields as { fieldName: typeString }. "
                                "E.g., { steps: 'int', date: 'date' }. Available in the body template."
                            ),
                            "additionalProperties": {"type": "string"},
                        },
                        "refresh_interval": {
                            "type": "number",
                            "description": (
                                "Widget only. Timeline refresh interval in minutes. "
                                "E.g., 30 for half-hourly updates. Defaults to 60."
                            ),
                        },
                        "scenes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": ["windowGroup", "window", "documentGroup", "settings"],
                                        "description": (
                                            "Scene type. windowGroup is most common for single-window apps."
                                        ),
                                    },
                                    "view": {
                                        "type": "string",
                                        "description": (
                                            "Root SwiftUI view name, e.g., 'ContentView'. "
                                            "Must be defined elsewhere."
                                        ),
                                    },
                                    "title": {
                                        "type": "string",
                                        "description": "Window title shown in the title bar",
                                    },
                                    "name": {
                                        "type": "string",
                                        "description": "Unique scene identifier for programmatic access",
                                    },
                                    "platform": {
                                        "type": "string",
                                        "enum": ["macOS", "iOS", "visionOS"],
                                        "description": (
                                            "Platform guard — wraps scene in #if os(...). "
                                            "Omit for cross-platform."
                                        ),
                                    },
                                },
                                "required": ["kind", "view"],
                            },
                            "description": (
                                "App only. Scene definitions for the @main App struct. "
                                "At least one scene with kind 'windowGroup' is typically required."
                            ),
                        },
                    },
                    "required": ["type", "name"],
                },
            ),
            Tool(
                name="axint_list_templates",
                description=(
                    "List all bundled reference templates available in the axint SDK. "
                    "Returns an array of { id, name, description } objects — one per "
                    "template. No parameters, no files written, no network requests, "
                    "no side effects. Use this to discover template ids, then call "
                    "axint_template with a specific id to retrieve the full source. "
                    "Unlike axint_scaffold which generates from parameters, templates "
                    "are complete working examples with perform() logic included."
                ),
                annotations=_tool_annotations,
                inputSchema={"type": "object", "properties": {}},
            ),
            Tool(
                name="axint_template",
                description=(
                    "Return the full Python source code of a bundled reference "
                    "template by id. Returns a complete define_intent() file that "
                    "compiles with axint_compile — no files written, no network "
                    "requests. Returns an error message if the id is not found. "
                    "Call axint_list_templates first to discover valid ids. Unlike "
                    "axint_scaffold which generates a skeleton, templates include "
                    "complete perform() logic and are ready to use as-is."
                ),
                annotations=_tool_annotations,
                inputSchema={
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": (
                                "Template id from axint_list_templates, e.g., 'send-message' "
                                "or 'create-event'. Case-sensitive, kebab-case format."
                            ),
                        },
                    },
                    "required": ["id"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> str:
        if name == "axint_scaffold":
            return scaffold_intent(
                name=arguments["name"],
                description=arguments["description"],
                domain=arguments.get("domain"),
                params=arguments.get("params"),
            )

        if name == "axint_compile":
            source = arguments["source"]
            file_name = arguments.get("file_name", "<mcp>")

            try:
                intents = parse_source(source, file=file_name)
                if not intents:
                    return "error: No intent definitions found in source"

                ir = intents[0]
                swift_code = generate_swift(ir)

                info_plist = None
                if arguments.get("emit_info_plist"):
                    info_plist = generate_info_plist_fragment(ir)

                entitlements = None
                if arguments.get("emit_entitlements"):
                    entitlements = generate_entitlements_fragment(ir)

                return format_compile_output(swift_code, info_plist, entitlements)
            except ParserError as e:
                return f"Parse error: {e!s}"
            except Exception as e:
                return f"Compilation error: {e!s}"

        if name == "axint_validate":
            source = arguments["source"]

            try:
                intents = parse_source(source, file="<validate>")
                if not intents:
                    return "Valid: No intent definitions found, but no errors."

                ir = intents[0]
                diagnostics = validate_intent(ir)

                if not diagnostics:
                    return "Valid intent definition. No issues found."

                return "\n".join([f"[{d.code}] {d.severity}: {d.message}" for d in diagnostics])
            except ParserError as e:
                return f"Parse error: {e!s}"
            except Exception as e:
                return f"Validation error: {e!s}"

        if name == "axint_compile_from_schema":
            return handle_compile_from_schema(arguments)

        if name == "axint_list_templates":
            if not TEMPLATES:
                return "No templates registered."
            template_lines = []
            for t in TEMPLATES:
                domain_str = f" [{t['domain']}]" if t.get("domain") else ""
                template_lines.append(f"{t['id']}  —  {t['title']}{domain_str}")
            return "\n".join(template_lines)

        if name == "axint_template":
            template_id = arguments.get("id")
            for tpl in TEMPLATES:
                if tpl["id"] == template_id:
                    return tpl["source"]
            return f"Unknown template id: {template_id}. Use axint_list_templates to see available ids."

        return f"Unknown tool: {name}"

    return server


async def main() -> None:
    """Entry point for the MCP server."""
    from mcp.server.stdio import StdioServerTransport

    server = build_server()
    async with StdioServerTransport() as transport, server:
        await server.connect(transport)


if __name__ == "__main__":
    asyncio.run(main())
