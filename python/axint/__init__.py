"""
axint — the Python SDK for Axint.

Define Apple App Intents, Views, Widgets, and Apps in Python. Ship them
through the same open-source compiler pipeline that powers the TypeScript SDK.

    from axint import define_intent, define_view, define_widget, param, prop, view

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

__version__ = "0.4.9"

from .generator import (
    generate_entitlements_fragment,
    generate_entity,
    generate_entity_query,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
)
from .ir import (
    AppIR,
    AppleTarget,
    AppSceneIR,
    AppStorageIR,
    DisplayRepresentationIR,
    EntityIR,
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
from .parser import (
    parse_app_source,
    parse_file,
    parse_file_apps,
    parse_file_views,
    parse_file_widgets,
    parse_source,
    parse_view_source,
    parse_widget_source,
)
from .sdk import (
    App,
    AppDefinition,
    Entity,
    EntityDefinition,
    Intent,
    IntentDefinition,
    View,
    ViewDefinition,
    Widget,
    WidgetDefinition,
    define_app,
    define_entity,
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
from .validator import (
    ValidatorDiagnostic,
    validate_app,
    validate_intent,
    validate_view,
    validate_widget,
)

__all__ = [
    "App",
    "AppDefinition",
    "AppIR",
    "AppSceneIR",
    "AppStorageIR",
    "AppleTarget",
    "DisplayRepresentationIR",
    "Entity",
    "EntityDefinition",
    "EntityIR",
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
    "define_entity",
    "define_intent",
    "define_view",
    "define_widget",
    "entry",
    "generate_entitlements_fragment",
    "generate_entity",
    "generate_entity_query",
    "generate_info_plist_fragment",
    "generate_swift",
    "generate_swift_app",
    "generate_swift_view",
    "generate_swift_widget",
    "param",
    "parse_app_source",
    "parse_file",
    "parse_file_apps",
    "parse_file_views",
    "parse_file_widgets",
    "parse_source",
    "parse_view_source",
    "parse_widget_source",
    "prop",
    "scene",
    "state",
    "storage",
    "validate_app",
    "validate_intent",
    "validate_view",
    "validate_widget",
    "view",
]
