"""
Python-native IR validator.

Mirrors the TypeScript validator in `src/core/validator.ts`. Applies the
same rules so that `axintai validate` catches errors locally before the
intent ever reaches the TS compiler.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .ir import IntentIR

MAX_PARAMETERS = 10
MAX_TITLE_LENGTH = 60


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


def _to_pascal_case(s: str) -> str:
    if not s:
        return "UnnamedIntent"
    parts = re.split(r"[-_\s]+", s)
    return "".join(part.capitalize() for part in parts if part)
