"""
Author-facing Python SDK.

Mirrors the TypeScript `defineIntent()` + `param.*` API. Every call here
produces an `IntentDefinition` whose `.to_ir()` method returns the same
language-agnostic IR that the TypeScript SDK produces — the Python file
can then be parsed by `axintai.parser.parse_file()` and handed off to
the TypeScript Swift generator.

Design note
-----------
The Python SDK is deliberately a plain declarative API with no runtime
magic — no metaclasses, no global registries, no import-time side effects.
The parser does its work on the AST, not on a live Python runtime, which
means `axintai compile` never imports user code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

from .ir import IntentIR, IntentParameter, ParamType


@dataclass(frozen=True, slots=True)
class IntentParameterSpec:
    """Parameter spec as it comes out of the `param.*` factories."""

    type: ParamType
    description: str
    optional: bool = False
    default: Any = None

    def to_parameter(self, name: str) -> IntentParameter:
        return IntentParameter(
            name=name,
            type=self.type,
            description=self.description,
            optional=self.optional,
            default=self.default,
        )


class _ParamFactory:
    """Typed factories for intent parameters — mirrors the TS `param.*` API."""

    def string(self, description: str, *, optional: bool = False, default: str | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("string", description, optional, default)

    def int(self, description: str, *, optional: bool = False, default: int | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("int", description, optional, default)

    def double(self, description: str, *, optional: bool = False, default: float | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("double", description, optional, default)

    def float(self, description: str, *, optional: bool = False, default: float | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("float", description, optional, default)

    def number(self, description: str, *, optional: bool = False, default: int | None = None) -> IntentParameterSpec:
        """Deprecated alias for `param.int` — kept for parity with the TS SDK."""
        return IntentParameterSpec("number", description, optional, default)

    def boolean(self, description: str, *, optional: bool = False, default: bool | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("boolean", description, optional, default)

    def date(self, description: str, *, optional: bool = False) -> IntentParameterSpec:
        return IntentParameterSpec("date", description, optional, None)

    def duration(self, description: str, *, optional: bool = False) -> IntentParameterSpec:
        return IntentParameterSpec("duration", description, optional, None)

    def url(self, description: str, *, optional: bool = False) -> IntentParameterSpec:
        return IntentParameterSpec("url", description, optional, None)


#: Module-level factory — import as `from axintai import param` and call
#: `param.string(...)`, `param.int(...)`, etc.
param = _ParamFactory()


class _PerformFn(Protocol):
    def __call__(self) -> Any: ...  # pragma: no cover


@dataclass(frozen=True, slots=True)
class IntentDefinition:
    """
    The return value of `define_intent()` — a fully-typed intent spec
    that can be turned into an IR via `.to_ir()`.
    """

    name: str
    title: str
    description: str
    domain: str
    params: dict[str, IntentParameterSpec] = field(default_factory=dict)
    perform: Callable[[], Any] | None = None
    entitlements: tuple[str, ...] = ()
    info_plist_keys: tuple[str, ...] = ()
    is_discoverable: bool = True

    def to_ir(self, *, source_file: str | None = None, source_line: int | None = None) -> IntentIR:
        return IntentIR(
            name=self.name,
            title=self.title,
            description=self.description,
            domain=self.domain,
            parameters=tuple(
                spec.to_parameter(name) for name, spec in self.params.items()
            ),
            entitlements=self.entitlements,
            info_plist_keys=self.info_plist_keys,
            is_discoverable=self.is_discoverable,
            return_type=None,  # Python return-type inference is a v0.3.0 follow-up
            source_file=source_file,
            source_line=source_line,
        )


# Re-exported type alias so users can annotate their own variables.
Intent = IntentDefinition


def define_intent(
    *,
    name: str,
    title: str,
    description: str,
    domain: str,
    params: dict[str, IntentParameterSpec] | None = None,
    perform: Callable[[], Any] | None = None,
    entitlements: list[str] | tuple[str, ...] | None = None,
    info_plist_keys: list[str] | tuple[str, ...] | None = None,
    is_discoverable: bool = True,
) -> IntentDefinition:
    """
    Declare an Apple App Intent from Python.

    Parameters
    ----------
    name
        PascalCase name of the intent. Becomes the Swift struct name —
        must be a valid Swift identifier.
    title
        Human-readable title shown in Siri, Spotlight, and Shortcuts.
    description
        One-sentence description of what the intent does.
    domain
        Apple's intent domain (e.g. "productivity", "messaging",
        "health", "commerce", "smartHome").
    params
        Mapping of snake_case parameter name → `param.*` spec. The
        compiler camel-cases names when emitting Swift.
    perform
        Optional callable whose body is introspected (by the AST parser,
        not by runtime execution) to infer the return type.
    entitlements
        Apple entitlement identifiers this intent requires.
    info_plist_keys
        Info.plist keys to emit next to the generated Swift.
    is_discoverable
        Whether Siri can surface this intent proactively.
    """
    return IntentDefinition(
        name=name,
        title=title,
        description=description,
        domain=domain,
        params=dict(params or {}),
        perform=perform,
        entitlements=tuple(entitlements or ()),
        info_plist_keys=tuple(info_plist_keys or ()),
        is_discoverable=is_discoverable,
    )
