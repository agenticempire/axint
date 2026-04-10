"""
axintai — the Python SDK for Axint.

Define Apple App Intents in Python. Ship them to Siri, Shortcuts, and
Spotlight through the same open-source compiler pipeline that powers
the TypeScript SDK.

    from axintai import define_intent, param

    create_event = define_intent(
        name="CreateCalendarEventIntent",
        title="Create Calendar Event",
        description="Creates a new event on the user's calendar",
        domain="productivity",
        params={
            "event_title": param.string("Title of the event"),
            "start_date": param.date("When the event starts"),
            "duration_minutes": param.int("Length of the event in minutes"),
        },
        perform=lambda: {"event_id": "uuid-v4"},
    )

Axint is a cross-language compiler. The TypeScript SDK and the Python
SDK produce the same language-agnostic intermediate representation, so
every intent — regardless of which SDK authored it — compiles through
the same Swift generator and hits the same validator rules.
"""

from __future__ import annotations

__version__ = "0.1.0"

from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
)
from .ir import AppleTarget, IntentIR, IntentParameter, ParamType
from .sdk import Intent, IntentDefinition, define_intent, param
from .validator import ValidatorDiagnostic, validate_intent

__all__ = [
    "AppleTarget",
    "Intent",
    "IntentDefinition",
    "IntentIR",
    "IntentParameter",
    "ParamType",
    "ValidatorDiagnostic",
    "__version__",
    "define_intent",
    "generate_entitlements_fragment",
    "generate_info_plist_fragment",
    "generate_swift",
    "param",
    "validate_intent",
]
