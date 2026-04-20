"""
Intermediate Representation (IR) types for Python.

These mirror the TypeScript IR in `src/core/types.ts`. The schema is the
contract between every frontend language (TypeScript, Python, and future
Rust/Go/Swift reverse-compile) and the Swift codegen. Keeping them in
lock-step is what makes Axint a real cross-language compiler instead of
a pile of one-off generators.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

ParamType = Literal[
    "string",
    "int",
    "double",
    "float",
    "number",  # legacy alias — maps to int
    "boolean",
    "date",
    "duration",
    "url",
    "entity",
    "enum",
    "dynamicOptions",
]

AppleTarget = Literal["ios17", "ios18", "ios26", "macos14", "macos15", "macos26"]

ViewStateKind = Literal["state", "binding", "environment", "observed"]
WidgetFamily = Literal[
    "systemSmall",
    "systemMedium",
    "systemLarge",
    "systemExtraLarge",
    "accessoryCircular",
    "accessoryRectangular",
    "accessoryInline",
]
WidgetRefreshPolicy = Literal["atEnd", "after", "never"]
SceneKind = Literal["windowGroup", "window", "documentGroup", "settings"]


def _parse_plist_keys(raw: Any) -> tuple[tuple[str, str], ...]:
    """Accept dict (TS format) or list (legacy Python format) for backwards compat."""
    if raw is None:
        return ()
    if isinstance(raw, dict):
        return tuple((str(k), str(v)) for k, v in raw.items())
    if isinstance(raw, (list, tuple)):
        return tuple((str(k), str(k)) for k in raw)
    return ()


@dataclass(frozen=True, slots=True)
class IntentParameter:
    """A single parameter on an App Intent."""

    name: str
    type: ParamType
    description: str
    optional: bool = False
    default: Any = None
    entity_name: str | None = None  # for param.entity("EntityName")
    enum_cases: tuple[str, ...] | None = None  # for param.enum(["case1", "case2"])
    provider_name: str | None = None  # for param.dynamicOptions("ProviderName")

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "description": self.description,
        }
        if self.optional:
            out["optional"] = True
        if self.default is not None:
            out["default"] = self.default
        if self.entity_name is not None:
            out["entityName"] = self.entity_name
        if self.enum_cases is not None:
            out["enumCases"] = list(self.enum_cases)
        if self.provider_name is not None:
            out["providerName"] = self.provider_name
        return out


@dataclass(frozen=True, slots=True)
class DisplayRepresentationIR:
    """Display representation configuration for an entity."""

    title: str
    subtitle: str | None = None
    image: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"title": self.title}
        if self.subtitle is not None:
            out["subtitle"] = self.subtitle
        if self.image is not None:
            out["image"] = self.image
        return out


@dataclass(frozen=True, slots=True)
class EntityIR:
    """An App Entity definition for complex, domain-specific data types."""

    name: str
    display_representation: DisplayRepresentationIR
    properties: tuple[IntentParameter, ...] = ()
    query_type: str = "id"  # "id", "all", "string", "property"
    source_file: str | None = None
    source_line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "displayRepresentation": self.display_representation.to_dict(),
            "queryType": self.query_type,
        }
        if self.properties:
            out["properties"] = [p.to_dict() for p in self.properties]
        if self.source_file is not None:
            out["sourceFile"] = self.source_file
        if self.source_line is not None:
            out["sourceLine"] = self.source_line
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EntityIR:
        display_repr_data = data.get("displayRepresentation", {})
        display_repr = DisplayRepresentationIR(
            title=display_repr_data.get("title", ""),
            subtitle=display_repr_data.get("subtitle"),
            image=display_repr_data.get("image"),
        )
        props = tuple(
            IntentParameter(
                name=p["name"],
                type=p["type"],
                description=p["description"],
                optional=p.get("optional", False),
                default=p.get("default"),
                entity_name=p.get("entityName"),
                enum_cases=tuple(p["enumCases"]) if "enumCases" in p else None,
                provider_name=p.get("providerName"),
            )
            for p in data.get("properties", [])
        )
        return cls(
            name=data["name"],
            display_representation=display_repr,
            properties=props,
            query_type=data.get("queryType", "id"),
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )


@dataclass(frozen=True, slots=True)
class IntentIR:
    """
    Language-agnostic representation of a single App Intent.

    This is the exact shape the TypeScript compiler produces — every
    field name, every nesting level matches `src/core/types.ts::IntentIR`
    so that a Python-authored intent can be fed into the TS-side Swift
    generator without translation.
    """

    name: str
    title: str
    description: str
    domain: str
    parameters: tuple[IntentParameter, ...] = ()
    entitlements: tuple[str, ...] = ()
    info_plist_keys: tuple[tuple[str, str], ...] = ()
    is_discoverable: bool = True
    return_type: str | None = None
    source_file: str | None = None
    source_line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "domain": self.domain,
            "parameters": [p.to_dict() for p in self.parameters],
            "isDiscoverable": self.is_discoverable,
        }
        if self.entitlements:
            out["entitlements"] = list(self.entitlements)
        if self.info_plist_keys:
            out["infoPlistKeys"] = {k: v for k, v in self.info_plist_keys}
        if self.return_type is not None:
            out["returnType"] = self.return_type
        if self.source_file is not None:
            out["sourceFile"] = self.source_file
        if self.source_line is not None:
            out["sourceLine"] = self.source_line
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> IntentIR:
        params = tuple(
            IntentParameter(
                name=p["name"],
                type=p["type"],
                description=p["description"],
                optional=p.get("optional", False),
                default=p.get("default"),
            )
            for p in data.get("parameters", [])
        )
        return cls(
            name=data["name"],
            title=data["title"],
            description=data["description"],
            domain=data["domain"],
            parameters=params,
            entitlements=tuple(data.get("entitlements", ())),
            info_plist_keys=_parse_plist_keys(data.get("infoPlistKeys")),
            is_discoverable=data.get("isDiscoverable", True),
            return_type=data.get("returnType"),
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )


@dataclass(frozen=True, slots=True)
class ViewPropIR:
    """A single property (input from parent) on a SwiftUI view."""

    name: str
    type: ParamType
    optional: bool = False
    default: Any = None
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
        }
        if self.description:
            out["description"] = self.description
        if self.optional:
            out["optional"] = True
        if self.default is not None:
            out["default"] = self.default
        return out


@dataclass(frozen=True, slots=True)
class ViewStateIR:
    """A single state property on a SwiftUI view."""

    name: str
    type: ParamType | Literal["array"]
    kind: ViewStateKind = "state"
    default: Any = None
    element_type: str | None = None  # for array types
    environment_key: str | None = None  # for environment bindings

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
        }
        if self.kind != "state":
            out["kind"] = self.kind
        if self.element_type is not None:
            out["elementType"] = self.element_type
        if self.default is not None:
            out["default"] = self.default
        if self.environment_key is not None:
            out["environmentKey"] = self.environment_key
        return out


@dataclass(frozen=True, slots=True)
class ViewIR:
    """Language-agnostic representation of a SwiftUI view definition."""

    name: str
    body: tuple[dict[str, Any], ...] = ()
    props: tuple[ViewPropIR, ...] = ()
    state: tuple[ViewStateIR, ...] = ()
    source_file: str | None = None
    source_line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "body": list(self.body),
        }
        if self.props:
            out["props"] = [p.to_dict() for p in self.props]
        if self.state:
            out["state"] = [s.to_dict() for s in self.state]
        if self.source_file is not None:
            out["sourceFile"] = self.source_file
        if self.source_line is not None:
            out["sourceLine"] = self.source_line
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ViewIR:
        props = tuple(
            ViewPropIR(
                name=p["name"],
                type=p["type"],
                optional=p.get("optional", False),
                default=p.get("default"),
                description=p.get("description", ""),
            )
            for p in data.get("props", [])
        )
        state = tuple(
            ViewStateIR(
                name=s["name"],
                type=s["type"],
                kind=s.get("kind", "state"),
                default=s.get("default"),
                element_type=s.get("elementType"),
                environment_key=s.get("environmentKey"),
            )
            for s in data.get("state", [])
        )
        return cls(
            name=data["name"],
            body=tuple(data.get("body", [])),
            props=props,
            state=state,
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )


@dataclass(frozen=True, slots=True)
class WidgetEntryIR:
    """A timeline entry field on a widget."""

    name: str
    type: ParamType
    default: Any = None
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
        }
        if self.description:
            out["description"] = self.description
        if self.default is not None:
            out["default"] = self.default
        return out


@dataclass(frozen=True, slots=True)
class WidgetIR:
    """Language-agnostic representation of a WidgetKit widget definition."""

    name: str
    display_name: str
    description: str
    families: tuple[WidgetFamily, ...] = ()
    entry: tuple[WidgetEntryIR, ...] = ()
    body: tuple[dict[str, Any], ...] = ()
    refresh_interval: int | None = None
    refresh_policy: WidgetRefreshPolicy = "atEnd"
    source_file: str | None = None
    source_line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "displayName": self.display_name,
            "description": self.description,
            "families": list(self.families),
            "body": list(self.body),
        }
        if self.entry:
            out["entry"] = [e.to_dict() for e in self.entry]
        if self.refresh_policy != "atEnd":
            out["refreshPolicy"] = self.refresh_policy
        if self.refresh_interval is not None:
            out["refreshInterval"] = self.refresh_interval
        if self.source_file is not None:
            out["sourceFile"] = self.source_file
        if self.source_line is not None:
            out["sourceLine"] = self.source_line
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> WidgetIR:
        entry = tuple(
            WidgetEntryIR(
                name=e["name"],
                type=e["type"],
                default=e.get("default"),
                description=e.get("description", ""),
            )
            for e in data.get("entry", [])
        )
        return cls(
            name=data["name"],
            display_name=data["displayName"],
            description=data["description"],
            families=tuple(data.get("families", [])),
            entry=entry,
            body=tuple(data.get("body", [])),
            refresh_interval=data.get("refreshInterval"),
            refresh_policy=data.get("refreshPolicy", "atEnd"),
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )


@dataclass(frozen=True, slots=True)
class AppSceneIR:
    """A single scene in an App definition."""

    kind: SceneKind
    view: str
    title: str | None = None
    name: str | None = None
    platform: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "kind": self.kind,
            "view": self.view,
        }
        if self.title is not None:
            out["title"] = self.title
        if self.name is not None:
            out["name"] = self.name
        if self.platform is not None:
            out["platform"] = self.platform
        return out


@dataclass(frozen=True, slots=True)
class AppStorageIR:
    """An @AppStorage property on an App."""

    name: str
    key: str
    type: ParamType
    default: Any = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "key": self.key,
            "type": self.type,
        }
        if self.default is not None:
            out["default"] = self.default
        return out


@dataclass(frozen=True, slots=True)
class AppIR:
    """Language-agnostic representation of a SwiftUI App definition."""

    name: str
    scenes: tuple[AppSceneIR, ...] = ()
    app_storage: tuple[AppStorageIR, ...] = ()
    source_file: str | None = None
    source_line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "scenes": [s.to_dict() for s in self.scenes],
        }
        if self.app_storage:
            out["appStorage"] = [a.to_dict() for a in self.app_storage]
        if self.source_file is not None:
            out["sourceFile"] = self.source_file
        if self.source_line is not None:
            out["sourceLine"] = self.source_line
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AppIR:
        scenes = tuple(
            AppSceneIR(
                kind=s["kind"],
                view=s["view"],
                title=s.get("title"),
                name=s.get("name"),
                platform=s.get("platform"),
            )
            for s in data.get("scenes", [])
        )
        app_storage = tuple(
            AppStorageIR(
                name=a["name"],
                key=a["key"],
                type=a["type"],
                default=a.get("default"),
            )
            for a in data.get("appStorage", [])
        )
        return cls(
            name=data["name"],
            scenes=scenes,
            app_storage=app_storage,
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )
