"""
axintai — the Python SDK for Axint.

Define Apple App Intents, Views, Widgets, and Apps in Python. Ship them
through the same open-source compiler pipeline that powers the TypeScript SDK.

    from axintai import define_intent, define_view, define_widget, param, prop, view

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
every definition — regardless of which SDK authored it — compiles through
the same Swift generator and hits the same validator rules.
"""

from __future__ import annotations

__version__ = "0.2.0"

from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
)
from .ir import (
    AppleTarget,
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
from .sdk import (
    App,
    AppDefinition,
    Intent,
    IntentDefinition,
    View,
    ViewDefinition,
    Widget,
    WidgetDefinition,
    define_app,
    define_intent,
    define_view,
    define_widget,
    entry,
    param,
    prop,
    scene,
    state,
    storage,
    view,
)
from .validator import ValidatorDiagnostic, validate_intent

__all__ = [
    "App",
    "AppDefinition",
    "AppIR",
    "AppSceneIR",
    "AppStorageIR",
    "AppleTarget",
    "Intent",
    "IntentDefinition",
    "IntentIR",
    "IntentParameter",
    "ParamType",
    "SceneKind",
    "ValidatorDiagnostic",
    "View",
    "ViewDefinition",
    "ViewIR",
    "ViewPropIR",
    "ViewStateIR",
    "ViewStateKind",
    "Widget",
    "WidgetDefinition",
    "WidgetEntryIR",
    "WidgetFamily",
    "WidgetIR",
    "WidgetRefreshPolicy",
    "__version__",
    "define_app",
    "define_intent",
    "define_view",
    "define_widget",
    "entry",
    "generate_entitlements_fragment",
    "generate_info_plist_fragment",
    "generate_swift",
    "param",
    "prop",
    "scene",
    "state",
    "storage",
    "validate_intent",
    "view",
]
