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
]

AppleTarget = Literal["ios17", "ios18", "ios26", "macos14", "macos15", "macos26"]


@dataclass(frozen=True, slots=True)
class IntentParameter:
    """A single parameter on an App Intent."""

    name: str
    type: ParamType
    description: str
    optional: bool = False
    default: Any = None

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
        return out


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
    info_plist_keys: tuple[str, ...] = ()
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
            out["infoPlistKeys"] = list(self.info_plist_keys)
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
            info_plist_keys=tuple(data.get("infoPlistKeys", ())),
            is_discoverable=data.get("isDiscoverable", True),
            return_type=data.get("returnType"),
            source_file=data.get("sourceFile"),
            source_line=data.get("sourceLine"),
        )
