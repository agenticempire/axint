"""
Python AST parser — the Python counterpart to the TypeScript AST walker
in `src/core/parser.ts`.

The parser never executes user code. It walks the Python AST, finds
`define_intent(...)` calls at module scope, and emits an `IntentIR` that
matches the exact JSON shape the TypeScript compiler produces.

This means a Python intent file compiles to the same Swift as a
TypeScript intent file — the language-agnostic IR is the contract.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast

from .ir import (
    AppIR,
    AppSceneIR,
    AppStorageIR,
    IntentIR,
    IntentParameter,
    ParamType,
    SceneKind,
    ViewIR,
    ViewPropIR,
    ViewStateIR,
    ViewStateKind,
    WidgetEntryIR,
    WidgetFamily,
    WidgetIR,
    WidgetRefreshPolicy,
)

# ── Diagnostics ──────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ParserDiagnostic:
    code: str
    severity: str  # "error" | "warning" | "info"
    message: str
    file: str | None = None
    line: int | None = None
    suggestion: str | None = None


class ParserError(Exception):
    """Raised when the Python parser cannot produce a valid IR."""

    def __init__(self, diagnostics: list[ParserDiagnostic]):
        self.diagnostics = diagnostics
        msg = "\n".join(f"  [{d.code}] {d.message}" for d in diagnostics)
        super().__init__(f"Python parser failed:\n{msg}")


# ── Public API ───────────────────────────────────────────────────────


def parse_source(source: str, *, file: str | None = None) -> list[IntentIR]:
    """
    Parse a Python source string and return every intent IR it contains.

    Multiple intents per file are supported — the parser scans every
    top-level assignment for a `define_intent(...)` call on the
    right-hand side.
    """
    try:
        tree = ast.parse(source, filename=file or "<string>")
    except SyntaxError as exc:
        raise ParserError(
            [
                ParserDiagnostic(
                    code="AXP001",
                    severity="error",
                    message=f"Python syntax error: {exc.msg}",
                    file=file,
                    line=exc.lineno,
                    suggestion="Fix the syntax error and re-run `axint compile`.",
                )
            ]
        ) from exc

    intents: list[IntentIR] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        call = node.value
        if not _is_define_intent(call):
            continue

        ir = _ir_from_call(call, file=file)
        intents.append(ir)

    return intents


def parse_file(path: str | Path) -> list[IntentIR]:
    p = Path(path)
    return parse_source(p.read_text(encoding="utf-8"), file=str(p))


def parse_view_source(source: str, *, file: str | None = None) -> list[ViewIR]:
    """
    Parse a Python source string and return every view IR it contains.
    """
    try:
        tree = ast.parse(source, filename=file or "<string>")
    except SyntaxError as exc:
        raise ParserError(
            [
                ParserDiagnostic(
                    code="AXP100",
                    severity="error",
                    message=f"Python syntax error: {exc.msg}",
                    file=file,
                    line=exc.lineno,
                    suggestion="Fix the syntax error and re-run `axint compile`.",
                )
            ]
        ) from exc

    views: list[ViewIR] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        call = node.value
        if not _is_define_view(call):
            continue

        ir = _view_ir_from_call(call, file=file)
        views.append(ir)

    return views


def parse_file_views(path: str | Path) -> list[ViewIR]:
    p = Path(path)
    return parse_view_source(p.read_text(encoding="utf-8"), file=str(p))


def parse_widget_source(source: str, *, file: str | None = None) -> list[WidgetIR]:
    """
    Parse a Python source string and return every widget IR it contains.
    """
    try:
        tree = ast.parse(source, filename=file or "<string>")
    except SyntaxError as exc:
        raise ParserError(
            [
                ParserDiagnostic(
                    code="AXP200",
                    severity="error",
                    message=f"Python syntax error: {exc.msg}",
                    file=file,
                    line=exc.lineno,
                    suggestion="Fix the syntax error and re-run `axint compile`.",
                )
            ]
        ) from exc

    widgets: list[WidgetIR] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        call = node.value
        if not _is_define_widget(call):
            continue

        ir = _widget_ir_from_call(call, file=file)
        widgets.append(ir)

    return widgets


def parse_file_widgets(path: str | Path) -> list[WidgetIR]:
    p = Path(path)
    return parse_widget_source(p.read_text(encoding="utf-8"), file=str(p))


def parse_app_source(source: str, *, file: str | None = None) -> list[AppIR]:
    """
    Parse a Python source string and return every app IR it contains.
    """
    try:
        tree = ast.parse(source, filename=file or "<string>")
    except SyntaxError as exc:
        raise ParserError(
            [
                ParserDiagnostic(
                    code="AXP300",
                    severity="error",
                    message=f"Python syntax error: {exc.msg}",
                    file=file,
                    line=exc.lineno,
                    suggestion="Fix the syntax error and re-run `axint compile`.",
                )
            ]
        ) from exc

    apps: list[AppIR] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Call):
            continue
        call = node.value
        if not _is_define_app(call):
            continue

        ir = _app_ir_from_call(call, file=file)
        apps.append(ir)

    return apps


def parse_file_apps(path: str | Path) -> list[AppIR]:
    p = Path(path)
    return parse_app_source(p.read_text(encoding="utf-8"), file=str(p))


# ── AST walkers ──────────────────────────────────────────────────────


def _is_define_intent(call: ast.Call) -> bool:
    """Detect `define_intent(...)` or `axint.define_intent(...)` calls."""
    if isinstance(call.func, ast.Name) and call.func.id == "define_intent":
        return True
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "define_intent"
        and isinstance(call.func.value, ast.Name)
    )


def _is_define_view(call: ast.Call) -> bool:
    """Detect `define_view(...)` or `axint.define_view(...)` calls."""
    if isinstance(call.func, ast.Name) and call.func.id == "define_view":
        return True
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "define_view"
        and isinstance(call.func.value, ast.Name)
    )


def _is_define_widget(call: ast.Call) -> bool:
    """Detect `define_widget(...)` or `axint.define_widget(...)` calls."""
    if isinstance(call.func, ast.Name) and call.func.id == "define_widget":
        return True
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "define_widget"
        and isinstance(call.func.value, ast.Name)
    )


def _is_define_app(call: ast.Call) -> bool:
    """Detect `define_app(...)` or `axint.define_app(...)` calls."""
    if isinstance(call.func, ast.Name) and call.func.id == "define_app":
        return True
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "define_app"
        and isinstance(call.func.value, ast.Name)
    )


def _ir_from_call(call: ast.Call, *, file: str | None) -> IntentIR:
    kwargs = {kw.arg: kw.value for kw in call.keywords if kw.arg is not None}

    diagnostics: list[ParserDiagnostic] = []

    def require(name: str) -> ast.expr:
        if name not in kwargs:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP002",
                    severity="error",
                    message=f"`define_intent(...)` is missing required argument `{name}`",
                    file=file,
                    line=call.lineno,
                    suggestion=f"Add `{name}=...` to the define_intent call.",
                )
            )
            return ast.Constant(value="")
        return kwargs[name]

    name = _literal_str(require("name"), "name", diagnostics, file, call.lineno)
    title = _literal_str(require("title"), "title", diagnostics, file, call.lineno)
    description = _literal_str(
        require("description"), "description", diagnostics, file, call.lineno
    )
    domain = _literal_str(require("domain"), "domain", diagnostics, file, call.lineno)

    params = _parse_params(kwargs.get("params"), diagnostics, file, call.lineno)
    entitlements = _parse_str_list(
        kwargs.get("entitlements"), "entitlements", diagnostics, file, call.lineno
    )
    info_plist_keys = _parse_plist_key_map(
        kwargs.get("info_plist_keys"), diagnostics, file, call.lineno
    )

    is_discoverable = True
    if "is_discoverable" in kwargs:
        node = kwargs["is_discoverable"]
        if isinstance(node, ast.Constant) and isinstance(node.value, bool):
            is_discoverable = node.value

    if any(d.severity == "error" for d in diagnostics):
        raise ParserError(diagnostics)

    return IntentIR(
        name=name,
        title=title,
        description=description,
        domain=domain,
        parameters=tuple(params),
        entitlements=tuple(entitlements),
        info_plist_keys=tuple(info_plist_keys),
        is_discoverable=is_discoverable,
        source_file=file,
        source_line=call.lineno,
    )


def _view_ir_from_call(call: ast.Call, *, file: str | None) -> ViewIR:
    """Parse a define_view(...) call and emit a ViewIR."""
    kwargs = {kw.arg: kw.value for kw in call.keywords if kw.arg is not None}
    diagnostics: list[ParserDiagnostic] = []

    def require(name: str) -> ast.expr:
        if name not in kwargs:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP101",
                    severity="error",
                    message=f"`define_view(...)` is missing required argument `{name}`",
                    file=file,
                    line=call.lineno,
                    suggestion=f"Add `{name}=...` to the define_view call.",
                )
            )
            return ast.Constant(value="")
        return kwargs[name]

    name = _literal_str(require("name"), "name", diagnostics, file, call.lineno)
    body = _parse_view_body(kwargs.get("body"), diagnostics, file, call.lineno)
    props = _parse_view_props(kwargs.get("props"), diagnostics, file, call.lineno)
    state = _parse_view_state(kwargs.get("state"), diagnostics, file, call.lineno)

    if any(d.severity == "error" for d in diagnostics):
        raise ParserError(diagnostics)

    return ViewIR(
        name=name,
        body=tuple(body),
        props=tuple(props),
        state=tuple(state),
        source_file=file,
        source_line=call.lineno,
    )


def _parse_view_body(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[dict[str, Any]]:
    """Parse a body=list of view.* calls."""
    if node is None:
        return []
    if not isinstance(node, (ast.List, ast.Tuple)):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP102",
                severity="error",
                message="`body=` must be a list or tuple of view.* calls",
                file=file,
                line=line,
            )
        )
        return []

    out: list[dict[str, Any]] = []
    for elt in node.elts:
        elem = _parse_view_element(elt, diagnostics, file)
        if elem is not None:
            out.append(elem)
    return out


def _parse_view_element(
    node: ast.expr,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> dict[str, Any] | None:
    """Parse a single view.* call."""
    if not isinstance(node, ast.Call):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP103",
                severity="error",
                message="Body elements must be view.* calls",
                file=file,
                line=getattr(node, "lineno", None),
            )
        )
        return None

    if not isinstance(node.func, ast.Attribute) or not isinstance(node.func.value, ast.Name):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP104",
                severity="error",
                message="Body elements must use view.* syntax",
                file=file,
                line=node.lineno,
            )
        )
        return None

    elem_type = node.func.attr
    out: dict[str, Any] = {"type": elem_type}

    # Handle each element type
    if elem_type == "text":
        if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
            out["content"] = node.args[0].value
    elif elem_type in ("vstack", "hstack", "zstack"):
        if node.args:
            children = _parse_view_body(node.args[0], diagnostics, file, node.lineno)
            out["children"] = children
        for kw in node.keywords:
            if kw.arg == "spacing" and isinstance(kw.value, ast.Constant):
                out["spacing"] = kw.value.value
            elif kw.arg == "alignment" and isinstance(kw.value, ast.Constant):
                out["alignment"] = kw.value.value
    elif elem_type == "image":
        for kw in node.keywords:
            if kw.arg == "system_name" and isinstance(kw.value, ast.Constant):
                out["systemName"] = kw.value.value
            elif kw.arg == "name" and isinstance(kw.value, ast.Constant):
                out["name"] = kw.value.value
    elif elem_type == "button":
        if node.args and isinstance(node.args[0], ast.Constant):
            out["label"] = node.args[0].value
        if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant):
            out["action"] = node.args[1].value
    elif elem_type == "spacer" or elem_type == "divider":
        pass
    elif elem_type == "foreach":
        if len(node.args) >= 3:
            if isinstance(node.args[0], ast.Constant):
                out["collection"] = node.args[0].value
            if isinstance(node.args[1], ast.Constant):
                out["item"] = node.args[1].value
            body_nodes = _parse_view_body(node.args[2], diagnostics, file, node.lineno)
            out["body"] = body_nodes
    elif elem_type == "conditional":
        if len(node.args) >= 2:
            if isinstance(node.args[0], ast.Constant):
                out["condition"] = node.args[0].value
            if_true = _parse_view_body(node.args[1], diagnostics, file, node.lineno)
            out["then"] = if_true
            if len(node.args) >= 3:
                if_false = _parse_view_body(node.args[2], diagnostics, file, node.lineno)
                out["else"] = if_false
    elif elem_type == "navigation_link":
        if len(node.args) >= 2:
            if isinstance(node.args[0], ast.Constant):
                out["destination"] = node.args[0].value
            children = _parse_view_body(node.args[1], diagnostics, file, node.lineno)
            out["children"] = children
    elif elem_type == "list" and node.args:
        children = _parse_view_body(node.args[0], diagnostics, file, node.lineno)
        out["children"] = children
    elif elem_type == "raw" and node.args and isinstance(node.args[0], ast.Constant):
        out["swift"] = node.args[0].value

    return out


def _parse_view_props(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[ViewPropIR]:
    """Parse props=dict of prop.* calls."""
    if node is None:
        return []
    if not isinstance(node, ast.Dict):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP105",
                severity="error",
                message="`props=` must be a dict literal like `{'name': prop.string()}`",
                file=file,
                line=line,
            )
        )
        return []

    out: list[ViewPropIR] = []
    for key_node, value_node in zip(node.keys, node.values, strict=False):
        if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP106",
                    severity="error",
                    message="Prop keys must be string literals",
                    file=file,
                    line=getattr(key_node, "lineno", line),
                )
            )
            continue
        prop_name = key_node.value
        prop = _parse_view_prop_call(value_node, prop_name, diagnostics, file)
        if prop is not None:
            out.append(prop)
    return out


def _parse_view_prop_call(
    node: ast.expr,
    prop_name: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> ViewPropIR | None:
    """Parse a prop.<type>(...) attribute-call expression."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP107",
                severity="error",
                message=f"Property `{prop_name}` must be a `prop.<type>(...)` call",
                file=file,
                line=getattr(node, "lineno", None),
                suggestion="Use one of prop.string, prop.int, prop.boolean, prop.double, prop.float, prop.date, prop.url.",
            )
        )
        return None

    attr = node.func.attr
    valid_types = {"string", "int", "double", "float", "boolean", "date", "url"}
    if attr not in valid_types:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP108",
                severity="error",
                message=f"Unknown prop type `prop.{attr}` for property `{prop_name}`",
                file=file,
                line=node.lineno,
                suggestion="Valid types: string, int, double, float, boolean, date, url.",
            )
        )
        return None

    description = ""
    if node.args:
        first = node.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            description = first.value

    optional = False
    default_val: Any = None
    for kw in node.keywords:
        if kw.arg == "optional" and isinstance(kw.value, ast.Constant):
            optional = bool(kw.value.value)
        elif kw.arg == "default" and isinstance(kw.value, ast.Constant):
            default_val = kw.value.value

    return ViewPropIR(
        name=prop_name,
        type=cast("ParamType", attr),
        optional=optional,
        default=default_val,
        description=description,
    )


def _parse_view_state(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[ViewStateIR]:
    """Parse state=dict of state.* calls."""
    if node is None:
        return []
    if not isinstance(node, ast.Dict):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP109",
                severity="error",
                message="`state=` must be a dict literal like `{'name': state.string()}`",
                file=file,
                line=line,
            )
        )
        return []

    out: list[ViewStateIR] = []
    for key_node, value_node in zip(node.keys, node.values, strict=False):
        if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP110",
                    severity="error",
                    message="State keys must be string literals",
                    file=file,
                    line=getattr(key_node, "lineno", line),
                )
            )
            continue
        state_name = key_node.value
        state_ir = _parse_view_state_call(value_node, state_name, diagnostics, file)
        if state_ir is not None:
            out.append(state_ir)
    return out


def _parse_view_state_call(
    node: ast.expr,
    state_name: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> ViewStateIR | None:
    """Parse a state.<type>(...) attribute-call expression."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP111",
                severity="error",
                message=f"State `{state_name}` must be a `state.<type>(...)` call",
                file=file,
                line=getattr(node, "lineno", None),
                suggestion="Use one of state.string, state.int, state.boolean, state.double, state.float, state.date, state.url, state.array.",
            )
        )
        return None

    attr = node.func.attr
    valid_types = {"string", "int", "double", "float", "boolean", "date", "url", "array"}
    if attr not in valid_types:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP112",
                severity="error",
                message=f"Unknown state type `state.{attr}` for state `{state_name}`",
                file=file,
                line=node.lineno,
                suggestion="Valid types: string, int, double, float, boolean, date, url, array.",
            )
        )
        return None

    state_type: ParamType | Literal["array"] = cast("ParamType", attr)
    element_type: str | None = None
    default_val: Any = None
    kind: ViewStateKind = "state"
    env_key: str | None = None

    # For array type, first arg is element type
    if attr == "array" and node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
        element_type = node.args[0].value

    # Parse keyword args
    for kw in node.keywords:
        if kw.arg == "default" and isinstance(kw.value, ast.Constant):
            default_val = kw.value.value
        elif kw.arg == "kind" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
            kind = cast("ViewStateKind", kw.value.value)
        elif kw.arg == "environment_key" and isinstance(kw.value, ast.Constant):
            env_key = str(kw.value.value)

    return ViewStateIR(
        name=state_name,
        type=state_type,
        kind=kind,
        default=default_val,
        element_type=element_type,
        environment_key=env_key,
    )


def _widget_ir_from_call(call: ast.Call, *, file: str | None) -> WidgetIR:
    """Parse a define_widget(...) call and emit a WidgetIR."""
    kwargs = {kw.arg: kw.value for kw in call.keywords if kw.arg is not None}
    diagnostics: list[ParserDiagnostic] = []

    def require(name: str) -> ast.expr:
        if name not in kwargs:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP201",
                    severity="error",
                    message=f"`define_widget(...)` is missing required argument `{name}`",
                    file=file,
                    line=call.lineno,
                    suggestion=f"Add `{name}=...` to the define_widget call.",
                )
            )
            return ast.Constant(value="")
        return kwargs[name]

    name = _literal_str(require("name"), "name", diagnostics, file, call.lineno)
    display_name = _literal_str(require("display_name"), "display_name", diagnostics, file, call.lineno)
    description = _literal_str(require("description"), "description", diagnostics, file, call.lineno)
    families = _parse_widget_families(require("families"), diagnostics, file, call.lineno)
    entry = _parse_widget_entry(kwargs.get("entry"), diagnostics, file, call.lineno)
    body = _parse_view_body(kwargs.get("body"), diagnostics, file, call.lineno)

    refresh_interval: int | None = None
    if "refresh_interval" in kwargs:
        node = kwargs["refresh_interval"]
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            refresh_interval = node.value

    refresh_policy: WidgetRefreshPolicy = "atEnd"
    if "refresh_policy" in kwargs:
        node = kwargs["refresh_policy"]
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            refresh_policy = node.value  # type: ignore[assignment]

    if any(d.severity == "error" for d in diagnostics):
        raise ParserError(diagnostics)

    return WidgetIR(
        name=name,
        display_name=display_name,
        description=description,
        families=tuple(families),
        entry=tuple(entry),
        body=tuple(body),
        refresh_interval=refresh_interval,
        refresh_policy=refresh_policy,
        source_file=file,
        source_line=call.lineno,
    )


def _parse_widget_families(
    node: ast.expr,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[WidgetFamily]:
    """Parse families=list of family strings."""
    if not isinstance(node, (ast.List, ast.Tuple)):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP202",
                severity="error",
                message="`families=` must be a list or tuple of family name strings",
                file=file,
                line=line,
            )
        )
        return []

    out: list[WidgetFamily] = []
    for elt in node.elts:
        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
            out.append(cast("WidgetFamily", elt.value))
        else:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP203",
                    severity="error",
                    message="`families=` entries must be string literals",
                    file=file,
                    line=getattr(elt, "lineno", line),
                )
            )
    return out


def _parse_widget_entry(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[WidgetEntryIR]:
    """Parse entry=dict of entry.* calls."""
    if node is None:
        return []
    if not isinstance(node, ast.Dict):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP204",
                severity="error",
                message="`entry=` must be a dict literal like `{'name': entry.string()}`",
                file=file,
                line=line,
            )
        )
        return []

    out: list[WidgetEntryIR] = []
    for key_node, value_node in zip(node.keys, node.values, strict=False):
        if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP205",
                    severity="error",
                    message="Entry keys must be string literals",
                    file=file,
                    line=getattr(key_node, "lineno", line),
                )
            )
            continue
        entry_name = key_node.value
        entry_ir = _parse_widget_entry_call(value_node, entry_name, diagnostics, file)
        if entry_ir is not None:
            out.append(entry_ir)
    return out


def _parse_widget_entry_call(
    node: ast.expr,
    entry_name: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> WidgetEntryIR | None:
    """Parse an entry.<type>(...) attribute-call expression."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP206",
                severity="error",
                message=f"Entry `{entry_name}` must be an `entry.<type>(...)` call",
                file=file,
                line=getattr(node, "lineno", None),
                suggestion="Use one of entry.string, entry.int, entry.boolean, entry.double, entry.float, entry.date, entry.url.",
            )
        )
        return None

    attr = node.func.attr
    valid_types = {"string", "int", "double", "float", "boolean", "date", "url"}
    if attr not in valid_types:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP207",
                severity="error",
                message=f"Unknown entry type `entry.{attr}` for entry `{entry_name}`",
                file=file,
                line=node.lineno,
                suggestion="Valid types: string, int, double, float, boolean, date, url.",
            )
        )
        return None

    description = ""
    if node.args:
        first = node.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            description = first.value

    default_val: Any = None
    for kw in node.keywords:
        if kw.arg == "default" and isinstance(kw.value, ast.Constant):
            default_val = kw.value.value

    return WidgetEntryIR(
        name=entry_name,
        type=cast("ParamType", attr),
        default=default_val,
        description=description,
    )


def _app_ir_from_call(call: ast.Call, *, file: str | None) -> AppIR:
    """Parse a define_app(...) call and emit an AppIR."""
    kwargs = {kw.arg: kw.value for kw in call.keywords if kw.arg is not None}
    diagnostics: list[ParserDiagnostic] = []

    def require(name: str) -> ast.expr:
        if name not in kwargs:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP301",
                    severity="error",
                    message=f"`define_app(...)` is missing required argument `{name}`",
                    file=file,
                    line=call.lineno,
                    suggestion=f"Add `{name}=...` to the define_app call.",
                )
            )
            return ast.Constant(value="")
        return kwargs[name]

    name = _literal_str(require("name"), "name", diagnostics, file, call.lineno)
    scenes = _parse_app_scenes(require("scenes"), diagnostics, file, call.lineno)
    app_storage = _parse_app_storage(kwargs.get("app_storage"), diagnostics, file, call.lineno)

    if any(d.severity == "error" for d in diagnostics):
        raise ParserError(diagnostics)

    return AppIR(
        name=name,
        scenes=tuple(scenes),
        app_storage=tuple(app_storage),
        source_file=file,
        source_line=call.lineno,
    )


def _parse_app_scenes(
    node: ast.expr,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[AppSceneIR]:
    """Parse scenes=list of scene.* calls."""
    if not isinstance(node, (ast.List, ast.Tuple)):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP302",
                severity="error",
                message="`scenes=` must be a list or tuple of scene.* calls",
                file=file,
                line=line,
            )
        )
        return []

    out: list[AppSceneIR] = []
    for elt in node.elts:
        scene = _parse_app_scene_call(elt, diagnostics, file)
        if scene is not None:
            out.append(scene)
    return out


def _parse_app_scene_call(
    node: ast.expr,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> AppSceneIR | None:
    """Parse a scene.* call."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP303",
                severity="error",
                message="Scene elements must be scene.* calls",
                file=file,
                line=getattr(node, "lineno", None),
            )
        )
        return None

    scene_kind = node.func.attr
    valid_kinds = {"window_group", "window", "document_group", "settings"}
    if scene_kind not in valid_kinds:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP304",
                severity="error",
                message=f"Unknown scene kind `scene.{scene_kind}`",
                file=file,
                line=node.lineno,
                suggestion="Valid kinds: window_group, window, document_group, settings.",
            )
        )
        return None

    view_name = ""
    if node.args and isinstance(node.args[0], ast.Constant):
        view_name = str(node.args[0].value)

    title: str | None = None
    name: str | None = None
    platform: str | None = None

    for kw in node.keywords:
        if kw.arg == "title" and isinstance(kw.value, ast.Constant):
            title = str(kw.value.value)
        elif kw.arg == "name" and isinstance(kw.value, ast.Constant):
            name = str(kw.value.value)
        elif kw.arg == "platform" and isinstance(kw.value, ast.Constant):
            platform = str(kw.value.value)

    kind: SceneKind
    if scene_kind == "window_group":
        kind = "windowGroup"
    elif scene_kind == "document_group":
        kind = "documentGroup"
    else:
        kind = scene_kind  # type: ignore[assignment]

    return AppSceneIR(
        kind=kind,
        view=view_name,
        title=title,
        name=name,
        platform=platform,
    )


def _parse_app_storage(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[AppStorageIR]:
    """Parse app_storage=dict of storage.* calls."""
    if node is None:
        return []
    if not isinstance(node, ast.Dict):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP305",
                severity="error",
                message="`app_storage=` must be a dict literal like `{'name': storage.string('key', default)}`",
                file=file,
                line=line,
            )
        )
        return []

    out: list[AppStorageIR] = []
    for key_node, value_node in zip(node.keys, node.values, strict=False):
        if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP306",
                    severity="error",
                    message="AppStorage keys must be string literals",
                    file=file,
                    line=getattr(key_node, "lineno", line),
                )
            )
            continue
        storage_name = key_node.value
        storage = _parse_app_storage_call(value_node, storage_name, diagnostics, file)
        if storage is not None:
            out.append(storage)
    return out


def _parse_app_storage_call(
    node: ast.expr,
    storage_name: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> AppStorageIR | None:
    """Parse a storage.<type>(key, default) call."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP307",
                severity="error",
                message=f"Storage `{storage_name}` must be a `storage.<type>(key, default)` call",
                file=file,
                line=getattr(node, "lineno", None),
                suggestion="Use one of storage.string, storage.int, storage.boolean, storage.double, storage.float, storage.date, storage.url.",
            )
        )
        return None

    attr = node.func.attr
    valid_types = {"string", "int", "double", "float", "boolean", "date", "url"}
    if attr not in valid_types:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP308",
                severity="error",
                message=f"Unknown storage type `storage.{attr}` for storage `{storage_name}`",
                file=file,
                line=node.lineno,
                suggestion="Valid types: string, int, double, float, boolean, date, url.",
            )
        )
        return None

    storage_key = ""
    if node.args and isinstance(node.args[0], ast.Constant):
        storage_key = str(node.args[0].value)

    default_val: Any = None
    if len(node.args) > 1 and isinstance(node.args[1], ast.Constant):
        default_val = node.args[1].value

    return AppStorageIR(
        name=storage_name,
        key=storage_key,
        type=cast("ParamType", attr),
        default=default_val,
    )


def _parse_params(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[IntentParameter]:
    if node is None:
        return []
    if not isinstance(node, ast.Dict):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP003",
                severity="error",
                message="`params=` must be a dict literal like `{'name': param.string(...)}`",
                file=file,
                line=line,
                suggestion="Replace the value with an inline dict literal.",
            )
        )
        return []

    out: list[IntentParameter] = []
    for key_node, value_node in zip(node.keys, node.values, strict=False):
        if not isinstance(key_node, ast.Constant) or not isinstance(key_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP004",
                    severity="error",
                    message="Parameter keys must be string literals",
                    file=file,
                    line=key_node.lineno if key_node else line,
                )
            )
            continue
        param_name = key_node.value
        spec = _parse_param_call(value_node, param_name, diagnostics, file)
        if spec is not None:
            out.append(spec)
    return out


def _parse_param_call(
    node: ast.expr,
    param_name: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
) -> IntentParameter | None:
    """Parse a `param.<type>("desc", ...)` attribute-call expression."""
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP005",
                severity="error",
                message=f"Parameter `{param_name}` must be a `param.<type>(...)` call",
                file=file,
                line=getattr(node, "lineno", None),
                suggestion="Use one of param.string, param.int, param.boolean, param.date, param.duration, param.url, param.entity, param.enum.",
            )
        )
        return None

    attr = node.func.attr
    valid_types = {
        "string",
        "int",
        "double",
        "float",
        "number",
        "boolean",
        "date",
        "duration",
        "url",
        "entity",
        "enum",
    }
    if attr not in valid_types:
        diagnostics.append(
            ParserDiagnostic(
                code="AXP006",
                severity="error",
                message=f"Unknown param type `param.{attr}` for parameter `{param_name}`",
                file=file,
                line=node.lineno,
                suggestion="Valid types: string, int, double, float, boolean, date, duration, url, entity, enum.",
            )
        )
        return None

    # Handle param.entity("EntityName", "description")
    if attr == "entity":
        if len(node.args) < 2:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP010",
                    severity="error",
                    message="param.entity() requires entity name and description",
                    file=file,
                    line=node.lineno,
                    suggestion='Use: param.entity("EntityName", "description")',
                )
            )
            return None
        entity_name_node = node.args[0]
        desc_node = node.args[1]
        if not isinstance(entity_name_node, ast.Constant) or not isinstance(entity_name_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP010",
                    severity="error",
                    message="param.entity() entity name must be a string literal",
                    file=file,
                    line=getattr(entity_name_node, "lineno", node.lineno),
                )
            )
            return None
        if not isinstance(desc_node, ast.Constant) or not isinstance(desc_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP010",
                    severity="error",
                    message="param.entity() description must be a string literal",
                    file=file,
                    line=getattr(desc_node, "lineno", node.lineno),
                )
            )
            return None
        entity_name = entity_name_node.value
        description = desc_node.value
        optional = False
        for kw in node.keywords:
            if kw.arg == "optional" and isinstance(kw.value, ast.Constant):
                optional = bool(kw.value.value)
        return IntentParameter(
            name=param_name,
            type="entity",
            description=description,
            optional=optional,
            default=None,
            entity_name=entity_name,
        )

    # Handle param.enum(["case1", "case2"], "description")
    if attr == "enum":
        if len(node.args) < 2:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP011",
                    severity="error",
                    message="param.enum() requires cases list and description",
                    file=file,
                    line=node.lineno,
                    suggestion='Use: param.enum(["case1", "case2"], "description")',
                )
            )
            return None
        cases_node = node.args[0]
        desc_node = node.args[1]

        # Parse cases
        enum_cases: list[str] = []
        if isinstance(cases_node, (ast.List, ast.Tuple)):
            for elt in cases_node.elts:
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    enum_cases.append(elt.value)
                else:
                    diagnostics.append(
                        ParserDiagnostic(
                            code="AXP011",
                            severity="error",
                            message="param.enum() cases must be string literals",
                            file=file,
                            line=getattr(elt, "lineno", node.lineno),
                        )
                    )
                    return None
        else:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP011",
                    severity="error",
                    message="param.enum() first argument must be a list or tuple",
                    file=file,
                    line=getattr(cases_node, "lineno", node.lineno),
                )
            )
            return None

        if not isinstance(desc_node, ast.Constant) or not isinstance(desc_node.value, str):
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP011",
                    severity="error",
                    message="param.enum() description must be a string literal",
                    file=file,
                    line=getattr(desc_node, "lineno", node.lineno),
                )
            )
            return None
        description = desc_node.value

        optional = False
        default: Any = None
        for kw in node.keywords:
            if kw.arg == "optional" and isinstance(kw.value, ast.Constant):
                optional = bool(kw.value.value)
            elif kw.arg == "default" and isinstance(kw.value, ast.Constant):
                default = kw.value.value

        return IntentParameter(
            name=param_name,
            type="enum",
            description=description,
            optional=optional,
            default=default,
            enum_cases=tuple(enum_cases),
        )

    # Handle primitive types and standard parameters
    description = ""
    if node.args:
        first = node.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            description = first.value
        else:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP007",
                    severity="error",
                    message=f"Parameter `{param_name}` description must be a string literal",
                    file=file,
                    line=first.lineno,
                )
            )

    opt = False
    dflt: Any = None
    for kw in node.keywords:
        if kw.arg == "optional" and isinstance(kw.value, ast.Constant):
            opt = bool(kw.value.value)
        elif kw.arg == "default" and isinstance(kw.value, ast.Constant):
            dflt = kw.value.value

    # "number" is the legacy TS alias for "int" — normalize on the way in.
    param_type: ParamType = "int" if attr == "number" else attr  # type: ignore[assignment]

    return IntentParameter(
        name=param_name,
        type=param_type,
        description=description,
        optional=opt,
        default=dflt,
    )


def _parse_str_list(
    node: ast.expr | None,
    field: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[str]:
    if node is None:
        return []
    if not isinstance(node, (ast.List, ast.Tuple)):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP008",
                severity="error",
                message=f"`{field}=` must be a list or tuple of strings",
                file=file,
                line=line,
            )
        )
        return []
    out: list[str] = []
    for elt in node.elts:
        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
            out.append(elt.value)
        else:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP008",
                    severity="error",
                    message=f"`{field}=` entries must be string literals",
                    file=file,
                    line=getattr(elt, "lineno", line),
                )
            )
    return out


def _parse_plist_key_map(
    node: ast.expr | None,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> list[tuple[str, str]]:
    if node is None:
        return []

    if isinstance(node, ast.Dict):
        out: list[tuple[str, str]] = []
        for key_node, value_node in zip(node.keys, node.values, strict=False):
            if key_node is None:
                diagnostics.append(
                    ParserDiagnostic(
                        code="AXP008",
                        severity="error",
                        message="`info_plist_keys=` keys must be string literals",
                        file=file,
                        line=line,
                    )
                )
                continue

            key = _literal_str(key_node, "info_plist_keys key", diagnostics, file, line)
            value = _literal_str(value_node, "info_plist_keys value", diagnostics, file, line)
            if key and value:
                out.append((key, value))
        return out

    if not isinstance(node, (ast.List, ast.Tuple)):
        diagnostics.append(
            ParserDiagnostic(
                code="AXP008",
                severity="error",
                message="`info_plist_keys=` must be a dict or a list/tuple of strings",
                file=file,
                line=line,
            )
        )
        return []

    legacy_keys: list[tuple[str, str]] = []
    for elt in node.elts:
        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
            legacy_keys.append((elt.value, elt.value))
        else:
            diagnostics.append(
                ParserDiagnostic(
                    code="AXP008",
                    severity="error",
                    message="`info_plist_keys=` entries must be string literals",
                    file=file,
                    line=getattr(elt, "lineno", line),
                )
            )
    return legacy_keys


def _literal_str(
    node: ast.expr,
    field: str,
    diagnostics: list[ParserDiagnostic],
    file: str | None,
    line: int,
) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    diagnostics.append(
        ParserDiagnostic(
            code="AXP009",
            severity="error",
            message=f"`{field}=` must be a string literal",
            file=file,
            line=getattr(node, "lineno", line),
            suggestion=f'Pass a literal like `{field}="..."`.',
        )
    )
    return ""
