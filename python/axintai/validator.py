"""
Python-native IR validator.

Mirrors the TypeScript validator in `src/core/validator.ts`. Applies the
same rules so that `axintai validate` catches errors locally before the
intent ever reaches the TS compiler.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .ir import AppIR, IntentIR, ViewIR, WidgetIR

MAX_PARAMETERS = 10
MAX_TITLE_LENGTH = 60

SWIFT_KEYWORDS = {
    "associatedtype",
    "class",
    "deinit",
    "enum",
    "extension",
    "fileprivate",
    "func",
    "import",
    "init",
    "inout",
    "internal",
    "let",
    "open",
    "operator",
    "private",
    "protocol",
    "public",
    "rethrows",
    "static",
    "struct",
    "subscript",
    "typealias",
    "var",
    "break",
    "case",
    "continue",
    "default",
    "defer",
    "do",
    "else",
    "fallthrough",
    "for",
    "guard",
    "if",
    "in",
    "repeat",
    "return",
    "switch",
    "where",
    "while",
    "as",
    "Any",
    "catch",
    "false",
    "is",
    "nil",
    "super",
    "self",
    "Self",
    "throw",
    "throws",
    "true",
    "try",
    "_",
}


@dataclass(frozen=True, slots=True)
class ValidatorDiagnostic:
    code: str
    severity: str  # "error" | "warning" | "info"
    message: str
    file: str | None = None
    suggestion: str | None = None


def validate_intent(intent: IntentIR) -> list[ValidatorDiagnostic]:
    """Validate an IntentIR for App Intents framework compliance."""
    diagnostics: list[ValidatorDiagnostic] = []

    # Rule: Intent name must be PascalCase and non-empty
    if not intent.name or not re.match(r"^[A-Z][a-zA-Z0-9]*$", intent.name):
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX100",
                severity="error",
                message=f'Intent name "{intent.name}" must be PascalCase (e.g., "CreateEvent")',
                file=intent.source_file,
                suggestion=f'Rename to "{_to_pascal_case(intent.name)}"',
            )
        )

    # Rule: Title must not be empty
    if not intent.title or not intent.title.strip():
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX101",
                severity="error",
                message="Intent title must not be empty",
                file=intent.source_file,
                suggestion="Add a human-readable title for Siri and Shortcuts display",
            )
        )

    # Rule: Description must not be empty
    if not intent.description or not intent.description.strip():
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX102",
                severity="error",
                message="Intent description must not be empty",
                file=intent.source_file,
                suggestion="Add a description explaining what this intent does",
            )
        )

    # Rule: Parameter names must be valid Swift identifiers
    seen: set[str] = set()
    for param in intent.parameters:
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", param.name):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX103",
                    severity="error",
                    message=f'Parameter name "{param.name}" is not a valid Swift identifier',
                    file=intent.source_file,
                    suggestion=f'Rename to "{re.sub(r"[^a-zA-Z0-9_]", "_", param.name)}"',
                )
            )

        # Rule: Parameter description should not be empty
        if not param.description or not param.description.strip():
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX104",
                    severity="warning",
                    message=f'Parameter "{param.name}" has no description',
                    file=intent.source_file,
                    suggestion="Add a description for better Siri/Shortcuts display",
                )
            )

        # Rule: Duplicate parameter names
        if param.name in seen:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX107",
                    severity="error",
                    message=f'Duplicate parameter name "{param.name}"',
                    file=intent.source_file,
                    suggestion="Each parameter in a single intent must have a unique name",
                )
            )
        seen.add(param.name)

    # Rule: Max 10 parameters
    if len(intent.parameters) > MAX_PARAMETERS:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX105",
                severity="warning",
                message=f"Intent has {len(intent.parameters)} parameters. Apple recommends {MAX_PARAMETERS} or fewer.",
                file=intent.source_file,
                suggestion="Consider splitting into multiple intents or grouping into an entity",
            )
        )

    # Rule: Title length
    if intent.title and len(intent.title) > MAX_TITLE_LENGTH:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX106",
                severity="warning",
                message=f"Intent title is {len(intent.title)} characters. Siri may truncate titles over {MAX_TITLE_LENGTH}.",
                file=intent.source_file,
            )
        )

    # Rule: Entitlement strings must look like reverse-DNS
    for ent in intent.entitlements:
        if not re.match(r"^[a-zA-Z0-9._-]+$", ent) or "." not in ent:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX108",
                    severity="warning",
                    message=f'Entitlement "{ent}" does not look like a valid reverse-DNS identifier',
                    file=intent.source_file,
                    suggestion='Use reverse-DNS, e.g., "com.apple.developer.siri"',
                )
            )

    return diagnostics


def validate_view(view: ViewIR) -> list[ValidatorDiagnostic]:
    """Validate a ViewIR for SwiftUI compliance."""
    diagnostics: list[ValidatorDiagnostic] = []

    # AX310: View name must be PascalCase
    if not view.name or not re.match(r"^[A-Z][a-zA-Z0-9]*$", view.name):
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX310",
                severity="error",
                message=f'View name "{view.name}" must be PascalCase (e.g., "ProfileCard")',
                file=view.source_file,
                suggestion=f'Rename to "{_to_pascal_case(view.name)}"',
            )
        )

    # AX311: View must have a non-empty body
    if not view.body or len(view.body) == 0:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX311",
                severity="error",
                message="View must have at least one body element",
                file=view.source_file,
                suggestion="Add elements to the body array: body: [view.text('Hello')]",
            )
        )

    # AX312 & AX313: Prop names must be valid identifiers and no duplicates
    prop_names: set[str] = set()
    for prop in view.props:
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", prop.name):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX312",
                    severity="error",
                    message=f'Prop name "{prop.name}" is not a valid Swift identifier',
                    file=view.source_file,
                )
            )

        if prop.name in prop_names:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX313",
                    severity="error",
                    message=f'Duplicate prop name "{prop.name}"',
                    file=view.source_file,
                )
            )
        prop_names.add(prop.name)

    # AX314 & AX315: State names must be valid identifiers and not collide with props
    for state in view.state:
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", state.name):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX314",
                    severity="error",
                    message=f'State name "{state.name}" is not a valid Swift identifier',
                    file=view.source_file,
                )
            )

        if state.name in prop_names:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX315",
                    severity="error",
                    message=f'State name "{state.name}" conflicts with a prop of the same name',
                    file=view.source_file,
                    suggestion="Props and state properties must have unique names within a view",
                )
            )

    # AX316: @Environment state must have an environmentKey
    for state in view.state:
        if state.kind == "environment" and not state.environment_key:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX316",
                    severity="warning",
                    message=f'Environment state "{state.name}" has no environmentKey — will use .{state.name} by default',
                    file=view.source_file,
                    suggestion='Set environmentKey: ".dismiss" to specify the Environment keypath',
                )
            )

    # AX317: @State properties should have a default value
    for state in view.state:
        if state.kind == "state" and state.default is None:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX317",
                    severity="warning",
                    message=f'@State property "{state.name}" has no default value — Swift requires @State to be initialized',
                    file=view.source_file,
                    suggestion="Add a default: state.int('...', { default: 0 })",
                )
            )

    # Validate body nodes recursively
    for node in view.body:
        diagnostics.extend(_validate_body_node(node, view.source_file))

    return diagnostics


def validate_widget(widget: WidgetIR) -> list[ValidatorDiagnostic]:
    """Validate a WidgetIR for WidgetKit compliance."""
    diagnostics: list[ValidatorDiagnostic] = []

    # AX410: Widget name must be PascalCase
    if not re.match(r"^[A-Z][a-zA-Z0-9]*$", widget.name):
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX410",
                severity="error",
                message=f"Widget name must be PascalCase, got: {widget.name}",
                file=widget.source_file,
                suggestion=f'Rename to: {_to_pascal_case(widget.name)}Widget',
            )
        )

    # AX411: Widget must have at least one supported family
    if not widget.families or len(widget.families) == 0:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX411",
                severity="error",
                message="Widget must have at least one supported family",
                file=widget.source_file,
                suggestion='Add at least one family: families: ["systemSmall"]',
            )
        )

    # AX412: Widget must have a non-empty body
    if not widget.body or len(widget.body) == 0:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX412",
                severity="error",
                message="Widget must have a non-empty body",
                file=widget.source_file,
                suggestion='Add a body: body: [view.text("Widget content")]',
            )
        )

    # AX413 & AX414: Entry field names must be valid identifiers and no duplicates
    entry_names: set[str] = set()
    for entry in widget.entry:
        if not _is_valid_swift_identifier(entry.name):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX413",
                    severity="error",
                    message=f"Invalid entry field name: {entry.name}",
                    file=widget.source_file,
                    suggestion="Rename to a valid Swift identifier (alphanumeric + underscore, start with letter)",
                )
            )

        if entry.name in entry_names:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX414",
                    severity="error",
                    message=f"Duplicate entry field: {entry.name}",
                    file=widget.source_file,
                )
            )
        entry_names.add(entry.name)

    # AX415: displayName must not be empty
    if not widget.display_name or not widget.display_name.strip():
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX415",
                severity="error",
                message="displayName must not be empty",
                file=widget.source_file,
                suggestion='Add a displayName: displayName: "My Widget"',
            )
        )

    return diagnostics


def validate_app(app: AppIR) -> list[ValidatorDiagnostic]:
    """Validate an AppIR for App protocol compliance."""
    diagnostics: list[ValidatorDiagnostic] = []

    # AX510: App name must be PascalCase
    if not re.match(r"^[A-Z][a-zA-Z0-9]*$", app.name):
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX510",
                severity="error",
                message=f'App name "{app.name}" must be PascalCase',
                file=app.source_file,
                suggestion=f'Rename to "{_to_pascal_case(app.name)}"',
            )
        )

    # AX511: At least one scene required
    if not app.scenes or len(app.scenes) == 0:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX511",
                severity="error",
                message="App must have at least one scene",
                file=app.source_file,
                suggestion='Add a scene: scenes: [{ kind: "windowGroup", view: "ContentView" }]',
            )
        )

    # AX512: Duplicate scene names
    scene_names: set[str] = set()
    for scene in app.scenes:
        if scene.name:
            if scene.name in scene_names:
                diagnostics.append(
                    ValidatorDiagnostic(
                        code="AX512",
                        severity="error",
                        message=f'Duplicate scene name: "{scene.name}"',
                        file=app.source_file,
                        suggestion="Each named scene must have a unique name.",
                    )
                )
            scene_names.add(scene.name)

    # AX513: Scene view names should be PascalCase
    for scene in app.scenes:
        if not re.match(r"^[A-Z][a-zA-Z0-9]*$", scene.view):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX513",
                    severity="warning",
                    message=f'Scene view "{scene.view}" should be PascalCase',
                    file=app.source_file,
                    suggestion=f'Rename to "{_to_pascal_case(scene.view)}"',
                )
            )

    # AX514: Settings scene should be guarded to macOS
    for scene in app.scenes:
        if scene.kind == "settings" and not scene.platform:
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX514",
                    severity="info",
                    message='Settings scene is macOS-only. Consider adding platform: "macOS"',
                    file=app.source_file,
                    suggestion='Add platform: "macOS" to the settings scene for cross-platform apps.',
                )
            )

    # AX515: Multiple unnamed WindowGroups
    unnamed_window_groups = [
        s for s in app.scenes if s.kind == "windowGroup" and not s.name and not s.title
    ]
    if len(unnamed_window_groups) > 1:
        diagnostics.append(
            ValidatorDiagnostic(
                code="AX515",
                severity="warning",
                message=f"{len(unnamed_window_groups)} unnamed WindowGroup scenes. Add titles or names to distinguish them.",
                file=app.source_file,
            )
        )

    return diagnostics


def _validate_body_node(node: dict[str, Any], source_file: str | None) -> list[ValidatorDiagnostic]:
    """Recursively validate a body node."""
    diagnostics: list[ValidatorDiagnostic] = []

    node_kind = node.get("kind")

    if node_kind in ("vstack", "hstack", "zstack"):
        for child in node.get("children", []):
            diagnostics.extend(_validate_body_node(child, source_file))

    elif node_kind == "foreach":
        if not node.get("collection"):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX318",
                    severity="error",
                    message="ForEach requires a collection expression",
                    file=source_file,
                )
            )
        for child in node.get("body", []):
            diagnostics.extend(_validate_body_node(child, source_file))

    elif node_kind == "conditional":
        if not node.get("condition"):
            diagnostics.append(
                ValidatorDiagnostic(
                    code="AX319",
                    severity="error",
                    message="Conditional requires a condition expression",
                    file=source_file,
                )
            )
        for child in node.get("then", []):
            diagnostics.extend(_validate_body_node(child, source_file))
        for child in node.get("else", []):
            diagnostics.extend(_validate_body_node(child, source_file))

    elif node_kind == "navigationLink":
        for child in node.get("label", []):
            diagnostics.extend(_validate_body_node(child, source_file))

    elif node_kind == "list":
        for child in node.get("children", []):
            diagnostics.extend(_validate_body_node(child, source_file))

    return diagnostics


def _is_valid_swift_identifier(name: str) -> bool:
    """Check if a name is a valid Swift identifier and not a keyword."""
    return bool(re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name)) and name not in SWIFT_KEYWORDS


def _to_pascal_case(s: str) -> str:
    if not s:
        return "UnnamedIntent"
    parts = re.split(r"[-_\s]+", s)
    return "".join(part.capitalize() for part in parts if part)
