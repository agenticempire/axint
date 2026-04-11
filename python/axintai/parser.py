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
from typing import Any

from .ir import IntentIR, IntentParameter, ParamType

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
                    suggestion="Fix the syntax error and re-run `axintai compile`.",
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


# ── AST walkers ──────────────────────────────────────────────────────


def _is_define_intent(call: ast.Call) -> bool:
    """Detect `define_intent(...)` or `axintai.define_intent(...)` calls."""
    if isinstance(call.func, ast.Name) and call.func.id == "define_intent":
        return True
    return (
        isinstance(call.func, ast.Attribute)
        and call.func.attr == "define_intent"
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
    info_plist_keys = _parse_str_list(
        kwargs.get("info_plist_keys"), "info_plist_keys", diagnostics, file, call.lineno
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
                    message=f"param.entity() requires entity name and description",
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
                    message=f"param.entity() entity name must be a string literal",
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
                    message=f"param.entity() description must be a string literal",
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
                    message=f"param.enum() requires cases list and description",
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
                            message=f"param.enum() cases must be string literals",
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
                    message=f"param.enum() first argument must be a list or tuple",
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
                    message=f"param.enum() description must be a string literal",
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

    optional = False
    default: Any = None
    for kw in node.keywords:
        if kw.arg == "optional" and isinstance(kw.value, ast.Constant):
            optional = bool(kw.value.value)
        elif kw.arg == "default" and isinstance(kw.value, ast.Constant):
            default = kw.value.value

    # "number" is the legacy TS alias for "int" — normalize on the way in.
    param_type: ParamType = "int" if attr == "number" else attr  # type: ignore[assignment]

    return IntentParameter(
        name=param_name,
        type=param_type,
        description=description,
        optional=optional,
        default=default,
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
