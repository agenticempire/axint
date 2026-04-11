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

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

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
    WidgetFamily,
    WidgetIR,
    WidgetEntryIR,
    WidgetRefreshPolicy,
)


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


# Type aliases — the class below has methods named `int`, `float`, and
# `boolean` that shadow builtins. These aliases let mypy resolve them.
_Int = int
_Float = float
_Bool = bool


class _ParamFactory:
    """Typed factories for intent parameters — mirrors the TS `param.*` API."""

    def string(self, description: str, *, optional: bool = False, default: str | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("string", description, optional, default)

    def int(self, description: str, *, optional: bool = False, default: _Int | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("int", description, optional, default)

    def double(self, description: str, *, optional: bool = False, default: _Float | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("double", description, optional, default)

    def float(self, description: str, *, optional: bool = False, default: _Float | None = None) -> IntentParameterSpec:
        return IntentParameterSpec("float", description, optional, default)

    def number(self, description: str, *, optional: bool = False, default: _Int | None = None) -> IntentParameterSpec:
        """Deprecated alias for `param.int` — kept for parity with the TS SDK."""
        return IntentParameterSpec("number", description, optional, default)

    def boolean(self, description: str, *, optional: bool = False, default: _Bool | None = None) -> IntentParameterSpec:
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


# ─── View Support ───────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ViewPropSpec:
    """View prop spec from the `prop.*` factories."""

    type: ParamType
    description: str = ""
    optional: bool = False
    default: Any = None

    def to_prop(self, name: str) -> ViewPropIR:
        return ViewPropIR(
            name=name,
            type=self.type,
            description=self.description,
            optional=self.optional,
            default=self.default,
        )


@dataclass(frozen=True, slots=True)
class ViewStateSpec:
    """View state spec from the `state.*` factories."""

    type: ParamType | Literal["array"]
    kind: ViewStateKind = "state"
    default: Any = None
    element_type: str | None = None
    environment_key: str | None = None

    def to_state(self, name: str) -> ViewStateIR:
        return ViewStateIR(
            name=name,
            type=self.type,
            kind=self.kind,
            default=self.default,
            element_type=self.element_type,
            environment_key=self.environment_key,
        )


class _PropFactory:
    """Typed factories for view properties — mirrors the TS `prop.*` API."""

    def string(self, description: str = "", *, optional: bool = False, default: str | None = None) -> ViewPropSpec:
        return ViewPropSpec("string", description, optional, default)

    def int(self, description: str = "", *, optional: bool = False, default: _Int | None = None) -> ViewPropSpec:
        return ViewPropSpec("int", description, optional, default)

    def double(self, description: str = "", *, optional: bool = False, default: _Float | None = None) -> ViewPropSpec:
        return ViewPropSpec("double", description, optional, default)

    def float(self, description: str = "", *, optional: bool = False, default: _Float | None = None) -> ViewPropSpec:
        return ViewPropSpec("float", description, optional, default)

    def boolean(self, description: str = "", *, optional: bool = False, default: _Bool | None = None) -> ViewPropSpec:
        return ViewPropSpec("boolean", description, optional, default)

    def date(self, description: str = "", *, optional: bool = False) -> ViewPropSpec:
        return ViewPropSpec("date", description, optional, None)

    def url(self, description: str = "", *, optional: bool = False) -> ViewPropSpec:
        return ViewPropSpec("url", description, optional, None)


#: Module-level factory for view properties.
prop = _PropFactory()


class _StateFactory:
    """Typed factories for view state — mirrors the TS `state.*` API."""

    def string(
        self, description: str = "", *, kind: ViewStateKind = "state", default: str | None = None, environment_key: str | None = None
    ) -> ViewStateSpec:
        return ViewStateSpec("string", kind, default, None, environment_key)

    def int(
        self, description: str = "", *, kind: ViewStateKind = "state", default: _Int | None = None, environment_key: str | None = None
    ) -> ViewStateSpec:
        return ViewStateSpec("int", kind, default, None, environment_key)

    def double(
        self, description: str = "", *, kind: ViewStateKind = "state", default: _Float | None = None, environment_key: str | None = None
    ) -> ViewStateSpec:
        return ViewStateSpec("double", kind, default, None, environment_key)

    def float(
        self, description: str = "", *, kind: ViewStateKind = "state", default: _Float | None = None, environment_key: str | None = None
    ) -> ViewStateSpec:
        return ViewStateSpec("float", kind, default, None, environment_key)

    def boolean(
        self, description: str = "", *, kind: ViewStateKind = "state", default: _Bool | None = None, environment_key: str | None = None
    ) -> ViewStateSpec:
        return ViewStateSpec("boolean", kind, default, None, environment_key)

    def date(self, description: str = "", *, kind: ViewStateKind = "state", environment_key: str | None = None) -> ViewStateSpec:
        return ViewStateSpec("date", kind, None, None, environment_key)

    def url(self, description: str = "", *, kind: ViewStateKind = "state", environment_key: str | None = None) -> ViewStateSpec:
        return ViewStateSpec("url", kind, None, None, environment_key)

    def array(self, element_type: str, description: str = "", *, default: Any = None) -> ViewStateSpec:
        return ViewStateSpec("array", "state", default, element_type, None)


#: Module-level factory for view state.
state = _StateFactory()


class _ViewFactory:
    """Typed factories for SwiftUI view body elements."""

    def vstack(self, children: list[dict[str, Any]], *, spacing: int | None = None, alignment: str | None = None) -> dict[str, Any]:
        """Vertical stack of views."""
        out: dict[str, Any] = {"type": "vstack", "children": children}
        if spacing is not None:
            out["spacing"] = spacing
        if alignment is not None:
            out["alignment"] = alignment
        return out

    def hstack(self, children: list[dict[str, Any]], *, spacing: int | None = None, alignment: str | None = None) -> dict[str, Any]:
        """Horizontal stack of views."""
        out: dict[str, Any] = {"type": "hstack", "children": children}
        if spacing is not None:
            out["spacing"] = spacing
        if alignment is not None:
            out["alignment"] = alignment
        return out

    def zstack(self, children: list[dict[str, Any]], *, alignment: str | None = None) -> dict[str, Any]:
        """Z-axis stack (overlaid views)."""
        out: dict[str, Any] = {"type": "zstack", "children": children}
        if alignment is not None:
            out["alignment"] = alignment
        return out

    def text(self, content: str) -> dict[str, Any]:
        """Display text."""
        return {"type": "text", "content": content}

    def image(self, *, system_name: str | None = None, name: str | None = None) -> dict[str, Any]:
        """Display an image."""
        out: dict[str, Any] = {"type": "image"}
        if system_name is not None:
            out["systemName"] = system_name
        if name is not None:
            out["name"] = name
        return out

    def button(self, label: str, action: str | None = None) -> dict[str, Any]:
        """Interactive button."""
        out: dict[str, Any] = {"type": "button", "label": label}
        if action is not None:
            out["action"] = action
        return out

    def spacer(self) -> dict[str, Any]:
        """Empty space for layout."""
        return {"type": "spacer"}

    def divider(self) -> dict[str, Any]:
        """Visual divider."""
        return {"type": "divider"}

    def foreach(self, collection: str, item: str, children: list[dict[str, Any]]) -> dict[str, Any]:
        """Loop over a collection."""
        return {"type": "foreach", "collection": collection, "item": item, "children": children}

    def conditional(
        self, condition: str, then_children: list[dict[str, Any]], else_children: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        """Conditional rendering."""
        out: dict[str, Any] = {"type": "if", "condition": condition, "then": then_children}
        if else_children is not None:
            out["else"] = else_children
        return out

    def navigation_link(self, destination: str, children: list[dict[str, Any]]) -> dict[str, Any]:
        """Navigation link to another view."""
        return {"type": "navigationLink", "destination": destination, "children": children}

    def list(self, children: list[dict[str, Any]]) -> dict[str, Any]:
        """List container."""
        return {"type": "list", "children": children}

    def raw(self, swift: str) -> dict[str, Any]:
        """Raw Swift code (escape hatch)."""
        return {"type": "raw", "swift": swift}


#: Module-level factory for view body elements.
view = _ViewFactory()


@dataclass(frozen=True, slots=True)
class ViewDefinition:
    """A SwiftUI view definition ready to be compiled."""

    name: str
    body: list[dict[str, Any]] = field(default_factory=list)
    props: dict[str, ViewPropSpec] = field(default_factory=dict)
    state: dict[str, ViewStateSpec] = field(default_factory=dict)

    def to_ir(self, *, source_file: str | None = None, source_line: int | None = None) -> ViewIR:
        return ViewIR(
            name=self.name,
            body=tuple(self.body),
            props=tuple(spec.to_prop(name) for name, spec in self.props.items()),
            state=tuple(spec.to_state(name) for name, spec in self.state.items()),
            source_file=source_file,
            source_line=source_line,
        )


View = ViewDefinition


def define_view(
    *,
    name: str,
    body: list[dict[str, Any]] | None = None,
    props: dict[str, ViewPropSpec] | None = None,
    state: dict[str, ViewStateSpec] | None = None,
) -> ViewDefinition:
    """
    Define a SwiftUI view for compilation to Swift.

    Parameters
    ----------
    name
        PascalCase name of the view (e.g., "ProfileCard").
    body
        List of view elements built with `view.*` helpers.
    props
        Mapping of prop name → `prop.*` spec for inputs from parent.
    state
        Mapping of state name → `state.*` spec for local state.
    """
    return ViewDefinition(
        name=name,
        body=list(body or []),
        props=dict(props or {}),
        state=dict(state or {}),
    )


# ─── Widget Support ─────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class WidgetEntrySpec:
    """Widget entry field spec from the `entry.*` factories."""

    type: ParamType
    description: str = ""
    default: Any = None

    def to_entry(self, name: str) -> WidgetEntryIR:
        return WidgetEntryIR(
            name=name,
            type=self.type,
            description=self.description,
            default=self.default,
        )


class _EntryFactory:
    """Typed factories for widget entry fields — mirrors the TS `entry.*` API."""

    def string(self, description: str = "", *, default: str | None = None) -> WidgetEntrySpec:
        return WidgetEntrySpec("string", description, default)

    def int(self, description: str = "", *, default: _Int | None = None) -> WidgetEntrySpec:
        return WidgetEntrySpec("int", description, default)

    def double(self, description: str = "", *, default: _Float | None = None) -> WidgetEntrySpec:
        return WidgetEntrySpec("double", description, default)

    def float(self, description: str = "", *, default: _Float | None = None) -> WidgetEntrySpec:
        return WidgetEntrySpec("float", description, default)

    def boolean(self, description: str = "", *, default: _Bool | None = None) -> WidgetEntrySpec:
        return WidgetEntrySpec("boolean", description, default)

    def date(self, description: str = "") -> WidgetEntrySpec:
        return WidgetEntrySpec("date", description, None)

    def url(self, description: str = "") -> WidgetEntrySpec:
        return WidgetEntrySpec("url", description, None)


#: Module-level factory for widget entry fields.
entry = _EntryFactory()


@dataclass(frozen=True, slots=True)
class WidgetDefinition:
    """A WidgetKit widget definition ready to be compiled."""

    name: str
    display_name: str
    description: str
    families: tuple[WidgetFamily, ...] = ()
    entry: dict[str, WidgetEntrySpec] = field(default_factory=dict)
    body: list[dict[str, Any]] = field(default_factory=list)
    refresh_interval: int | None = None
    refresh_policy: WidgetRefreshPolicy = "atEnd"

    def to_ir(self, *, source_file: str | None = None, source_line: int | None = None) -> WidgetIR:
        return WidgetIR(
            name=self.name,
            display_name=self.display_name,
            description=self.description,
            families=self.families,
            entry=tuple(spec.to_entry(name) for name, spec in self.entry.items()),
            body=tuple(self.body),
            refresh_interval=self.refresh_interval,
            refresh_policy=self.refresh_policy,
            source_file=source_file,
            source_line=source_line,
        )


Widget = WidgetDefinition


def define_widget(
    *,
    name: str,
    display_name: str,
    description: str,
    families: list[WidgetFamily] | tuple[WidgetFamily, ...] | None = None,
    entry: dict[str, WidgetEntrySpec] | None = None,
    body: list[dict[str, Any]] | None = None,
    refresh_interval: int | None = None,
    refresh_policy: WidgetRefreshPolicy = "atEnd",
) -> WidgetDefinition:
    """
    Define a WidgetKit widget for compilation to Swift.

    Parameters
    ----------
    name
        PascalCase name of the widget.
    display_name
        Display name shown in widget gallery.
    description
        Human-readable description of the widget.
    families
        Supported widget families/sizes.
    entry
        Mapping of entry field name → `entry.*` spec.
    body
        List of view elements built with `view.*` helpers.
    refresh_interval
        Refresh interval in minutes (required if refreshPolicy is "after").
    refresh_policy
        Widget refresh policy: "atEnd" (default), "after", "never".
    """
    return WidgetDefinition(
        name=name,
        display_name=display_name,
        description=description,
        families=tuple(families or ()),
        entry=dict(entry or {}),
        body=list(body or []),
        refresh_interval=refresh_interval,
        refresh_policy=refresh_policy,
    )


# ─── App Support ────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class AppStorageSpec:
    """AppStorage property spec from the `storage.*` factories."""

    type: ParamType
    key: str
    default: Any = None

    def to_storage(self, name: str) -> AppStorageIR:
        return AppStorageIR(
            name=name,
            key=self.key,
            type=self.type,
            default=self.default,
        )


class _StorageFactory:
    """Typed factories for @AppStorage properties."""

    def string(self, key: str, default: str | None = None) -> AppStorageSpec:
        return AppStorageSpec("string", key, default)

    def int(self, key: str, default: _Int | None = None) -> AppStorageSpec:
        return AppStorageSpec("int", key, default)

    def double(self, key: str, default: _Float | None = None) -> AppStorageSpec:
        return AppStorageSpec("double", key, default)

    def float(self, key: str, default: _Float | None = None) -> AppStorageSpec:
        return AppStorageSpec("float", key, default)

    def boolean(self, key: str, default: _Bool | None = None) -> AppStorageSpec:
        return AppStorageSpec("boolean", key, default)

    def date(self, key: str) -> AppStorageSpec:
        return AppStorageSpec("date", key, None)

    def url(self, key: str) -> AppStorageSpec:
        return AppStorageSpec("url", key, None)


#: Module-level factory for app storage properties.
storage = _StorageFactory()


@dataclass(frozen=True, slots=True)
class AppSceneSpec:
    """AppScene configuration spec from the `scene.*` factories."""

    kind: SceneKind
    view: str
    title: str | None = None
    name: str | None = None
    platform: str | None = None

    def to_scene(self) -> AppSceneIR:
        return AppSceneIR(
            kind=self.kind,
            view=self.view,
            title=self.title,
            name=self.name,
            platform=self.platform,
        )


class _SceneFactory:
    """Typed factories for app scenes — mirrors the TS `scene.*` API."""

    def window_group(
        self,
        view: str,
        *,
        title: str | None = None,
        name: str | None = None,
        platform: str | None = None,
    ) -> AppSceneSpec:
        """Main window group (default scene for most apps)."""
        return AppSceneSpec("windowGroup", view, title, name, platform)

    def window(
        self,
        view: str,
        *,
        title: str | None = None,
        name: str | None = None,
        platform: str | None = None,
    ) -> AppSceneSpec:
        """Named window (macOS multi-window)."""
        return AppSceneSpec("window", view, title, name, platform)

    def document_group(
        self,
        view: str,
        *,
        title: str | None = None,
        name: str | None = None,
        platform: str | None = None,
    ) -> AppSceneSpec:
        """Document-based app group."""
        return AppSceneSpec("documentGroup", view, title, name, platform)

    def settings(
        self,
        view: str,
        *,
        title: str | None = None,
        name: str | None = None,
        platform: str | None = None,
    ) -> AppSceneSpec:
        """Settings window (macOS)."""
        return AppSceneSpec("settings", view, title, name, platform)


#: Module-level factory for app scenes.
scene = _SceneFactory()


@dataclass(frozen=True, slots=True)
class AppDefinition:
    """A SwiftUI App definition ready to be compiled."""

    name: str
    scenes: tuple[AppSceneSpec, ...] = ()
    app_storage: dict[str, AppStorageSpec] = field(default_factory=dict)

    def to_ir(self, *, source_file: str | None = None, source_line: int | None = None) -> AppIR:
        return AppIR(
            name=self.name,
            scenes=tuple(s.to_scene() for s in self.scenes),
            app_storage=tuple(spec.to_storage(name) for name, spec in self.app_storage.items()),
            source_file=source_file,
            source_line=source_line,
        )


App = AppDefinition


def define_app(
    *,
    name: str,
    scenes: list[AppSceneSpec] | tuple[AppSceneSpec, ...] | None = None,
    app_storage: dict[str, AppStorageSpec] | None = None,
) -> AppDefinition:
    """
    Define a SwiftUI App for compilation to Swift.

    Parameters
    ----------
    name
        PascalCase name of the app.
    scenes
        List of scenes built with `scene.*` helpers.
    app_storage
        Mapping of storage property name → `storage.*` spec.
    """
    return AppDefinition(
        name=name,
        scenes=tuple(scenes or ()),
        app_storage=dict(app_storage or {}),
    )
