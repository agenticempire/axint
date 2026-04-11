"""Tests for the authoring SDK (`define_intent`, `param.*`)."""

from __future__ import annotations

from axintai import IntentIR, define_intent, param


def test_param_string_spec() -> None:
    spec = param.string("Name of the contact")
    assert spec.type == "string"
    assert spec.description == "Name of the contact"
    assert spec.optional is False
    assert spec.default is None


def test_param_int_optional_with_default() -> None:
    spec = param.int("Count", optional=True, default=5)
    assert spec.type == "int"
    assert spec.optional is True
    assert spec.default == 5


def test_param_number_is_legacy_alias_for_int() -> None:
    spec = param.number("Legacy number")
    assert spec.type == "number"  # raw label preserved; parser normalizes


def test_define_intent_minimal() -> None:
    intent = define_intent(
        name="SendMessageIntent",
        title="Send Message",
        description="Sends a message to a contact",
        domain="messaging",
    )
    assert intent.name == "SendMessageIntent"
    assert intent.domain == "messaging"
    assert intent.params == {}
    assert intent.entitlements == ()
    assert intent.is_discoverable is True


def test_define_intent_full() -> None:
    intent = define_intent(
        name="CreateCalendarEventIntent",
        title="Create Calendar Event",
        description="Creates a new event on the user's calendar",
        domain="productivity",
        params={
            "event_title": param.string("Title of the event"),
            "start_date": param.date("When the event starts"),
            "duration_minutes": param.int("Length of the event"),
            "is_all_day": param.boolean("Whether the event is all-day", optional=True, default=False),
        },
        entitlements=["com.apple.developer.calendars"],
        info_plist_keys=["NSCalendarsUsageDescription"],
        is_discoverable=True,
    )
    ir = intent.to_ir()
    assert isinstance(ir, IntentIR)
    assert ir.name == "CreateCalendarEventIntent"
    assert len(ir.parameters) == 4
    assert ir.parameters[0].name == "event_title"
    assert ir.parameters[0].type == "string"
    assert ir.parameters[3].optional is True
    assert ir.parameters[3].default is False
    assert ir.entitlements == ("com.apple.developer.calendars",)
    assert ir.info_plist_keys == ("NSCalendarsUsageDescription",)


def test_ir_to_dict_matches_ts_schema() -> None:
    intent = define_intent(
        name="ToggleLightIntent",
        title="Toggle Light",
        description="Turns a light on or off",
        domain="smartHome",
        params={"light_id": param.string("Device identifier")},
    )
    d = intent.to_ir().to_dict()
    # Field names must match the TypeScript IR exactly.
    assert d["name"] == "ToggleLightIntent"
    assert d["title"] == "Toggle Light"
    assert d["domain"] == "smartHome"
    assert d["isDiscoverable"] is True  # camelCase — not snake_case
    assert d["parameters"][0]["name"] == "light_id"
    assert d["parameters"][0]["type"] == "string"


def test_ir_round_trip() -> None:
    ir = define_intent(
        name="LogWorkoutIntent",
        title="Log Workout",
        description="Records a workout session",
        domain="health",
        params={
            "activity": param.string("Type of activity"),
            "duration": param.duration("How long the workout lasted"),
        },
    ).to_ir()
    assert IntentIR.from_dict(ir.to_dict()) == ir


# ─── View Tests ─────────────────────────────────────────────────────────


def test_define_view_minimal() -> None:
    from axintai import define_view, view

    view_def = define_view(
        name="Greeting",
        body=[view.text("Hello")],
    )
    assert view_def.name == "Greeting"
    assert len(view_def.body) == 1
    assert view_def.props == {}
    assert view_def.state == {}


def test_define_view_full() -> None:
    from axintai import ViewIR, define_view, prop, state, view

    view_def = define_view(
        name="ProfileCard",
        props={
            "username": prop.string("User's display name"),
            "age": prop.int("User's age", optional=True),
        },
        state={
            "tap_count": state.int(default=0),
            "is_loading": state.boolean(kind="state", default=False),
        },
        body=[
            view.vstack([
                view.text("Profile"),
                view.button("Tap me"),
            ], spacing=16),
        ],
    )
    ir = view_def.to_ir()
    assert isinstance(ir, ViewIR)
    assert ir.name == "ProfileCard"
    assert len(ir.props) == 2
    assert ir.props[0].name == "username"
    assert ir.props[1].optional is True
    assert len(ir.state) == 2


def test_view_ir_to_dict() -> None:
    from axintai import define_view, prop, view

    view_def = define_view(
        name="Button",
        props={"label": prop.string("Button text")},
        body=[view.text("Click me")],
    )
    d = view_def.to_ir().to_dict()
    assert d["name"] == "Button"
    assert "props" in d
    assert d["props"][0]["name"] == "label"
    assert d["props"][0]["type"] == "string"


def test_view_element_helpers() -> None:
    from axintai import view

    vstack = view.vstack([view.text("A"), view.text("B")], spacing=10)
    assert vstack["type"] == "vstack"
    assert vstack["spacing"] == 10
    assert len(vstack["children"]) == 2

    button = view.button("Press", "action()")
    assert button["type"] == "button"
    assert button["action"] == "action()"

    img = view.image(system_name="star.fill")
    assert img["type"] == "image"
    assert img["systemName"] == "star.fill"


# ─── Widget Tests ────────────────────────────────────────────────────────


def test_define_widget_minimal() -> None:
    from axintai import define_widget, view

    widget = define_widget(
        name="Counter",
        display_name="Counter Widget",
        description="Shows a counter",
        body=[view.text("Count")],
    )
    assert widget.name == "Counter"
    assert widget.display_name == "Counter Widget"
    assert widget.families == ()
    assert widget.entry == {}


def test_define_widget_full() -> None:
    from axintai import WidgetIR, define_widget, entry, view

    widget = define_widget(
        name="StepCounter",
        display_name="Step Counter",
        description="Shows your daily steps",
        families=["systemSmall", "systemMedium"],
        entry={
            "steps": entry.int("Current steps", default=0),
            "goal": entry.int("Daily goal", default=10000),
        },
        body=[
            view.vstack([
                view.text("Steps"),
            ]),
        ],
        refresh_interval=15,
        refresh_policy="after",
    )
    ir = widget.to_ir()
    assert isinstance(ir, WidgetIR)
    assert ir.name == "StepCounter"
    assert len(ir.families) == 2
    assert len(ir.entry) == 2
    assert ir.refresh_interval == 15
    assert ir.refresh_policy == "after"


def test_widget_ir_to_dict() -> None:
    from axintai import define_widget, entry, view

    widget = define_widget(
        name="Simple",
        display_name="Simple",
        description="A simple widget",
        families=["systemSmall"],
        entry={"count": entry.int()},
        body=[view.text("0")],
    )
    d = widget.to_ir().to_dict()
    assert d["name"] == "Simple"
    assert d["displayName"] == "Simple"
    assert "families" in d
    assert d["families"] == ["systemSmall"]
    assert "entry" in d


# ─── App Tests ───────────────────────────────────────────────────────────


def test_define_app_minimal() -> None:
    from axintai import define_app, scene

    app = define_app(
        name="MyApp",
        scenes=[scene.window_group("ContentView")],
    )
    assert app.name == "MyApp"
    assert len(app.scenes) == 1


def test_define_app_full() -> None:
    from axintai import AppIR, define_app, scene, storage

    app = define_app(
        name="MyApp",
        scenes=[
            scene.window_group("ContentView"),
            scene.settings("SettingsView", platform="macOS"),
        ],
        app_storage={
            "is_dark_mode": storage.boolean("dark_mode", False),
            "username": storage.string("username", ""),
        },
    )
    ir = app.to_ir()
    assert isinstance(ir, AppIR)
    assert ir.name == "MyApp"
    assert len(ir.scenes) == 2
    assert ir.scenes[1].platform == "macOS"
    assert len(ir.app_storage) == 2


def test_app_ir_to_dict() -> None:
    from axintai import define_app, scene, storage

    app = define_app(
        name="TestApp",
        scenes=[scene.window_group("Main")],
        app_storage={"count": storage.int("app_count", 0)},
    )
    d = app.to_ir().to_dict()
    assert d["name"] == "TestApp"
    assert "scenes" in d
    assert d["scenes"][0]["kind"] == "windowGroup"
    assert "appStorage" in d


def test_scene_factory_variants() -> None:
    from axintai import scene

    wg = scene.window_group("View1", title="Main Window")
    assert wg.kind == "windowGroup"
    assert wg.title == "Main Window"

    doc = scene.document_group("DocView", name="document")
    assert doc.kind == "documentGroup"
    assert doc.name == "document"

    settings = scene.settings("Prefs", platform="macOS")
    assert settings.kind == "settings"
    assert settings.platform == "macOS"


def test_storage_factory_all_types() -> None:
    from axintai import storage

    s_str = storage.string("key_str", "default")
    assert s_str.type == "string"
    assert s_str.default == "default"

    s_int = storage.int("key_int", 42)
    assert s_int.type == "int"
    assert s_int.default == 42

    s_bool = storage.boolean("key_bool", True)
    assert s_bool.type == "boolean"
    assert s_bool.default is True

    s_date = storage.date("key_date")
    assert s_date.type == "date"
    assert s_date.default is None


def test_prop_factory_all_types() -> None:
    from axintai import prop

    p_str = prop.string("description", optional=True, default="value")
    assert p_str.type == "string"
    assert p_str.optional is True

    p_int = prop.int("count", optional=False, default=5)
    assert p_int.type == "int"
    assert p_int.default == 5

    p_date = prop.date()
    assert p_date.type == "date"


def test_state_factory_all_types() -> None:
    from axintai import state

    s_str = state.string(default="hello")
    assert s_str.type == "string"

    s_array = state.array("int", default=[1, 2, 3])
    assert s_array.type == "array"
    assert s_array.element_type == "int"

    s_env = state.string(kind="environment", environment_key=r"\.dismiss")
    assert s_env.kind == "environment"
    assert s_env.environment_key == r"\.dismiss"


def test_entry_factory_all_types() -> None:
    from axintai import entry

    e_str = entry.string("desc", default="val")
    assert e_str.type == "string"
    assert e_str.default == "val"

    e_int = entry.int("count", default=0)
    assert e_int.type == "int"
    assert e_int.default == 0

    e_url = entry.url("URL")
    assert e_url.type == "url"


def test_view_ir_round_trip() -> None:
    from axintai import ViewIR, define_view, prop, view

    ir = define_view(
        name="Card",
        props={"title": prop.string()},
        body=[view.text("Content")],
    ).to_ir()
    assert ViewIR.from_dict(ir.to_dict()) == ir


def test_widget_ir_round_trip() -> None:
    from axintai import WidgetIR, define_widget, entry, view

    ir = define_widget(
        name="W",
        display_name="Widget",
        description="A widget",
        entry={"x": entry.int()},
        body=[view.text("X")],
    ).to_ir()
    assert WidgetIR.from_dict(ir.to_dict()) == ir


def test_app_ir_round_trip() -> None:
    from axintai import AppIR, define_app, scene

    ir = define_app(
        name="App",
        scenes=[scene.window_group("View")],
    ).to_ir()
    assert AppIR.from_dict(ir.to_dict()) == ir


# ─── Entity Tests ────────────────────────────────────────────────────────


def test_define_entity_minimal() -> None:
    from axintai import define_entity

    entity = define_entity(
        name="Task",
        display_title="Task",
    )
    assert entity.name == "Task"
    assert entity.display_title == "Task"
    assert entity.display_subtitle is None
    assert entity.properties == {}
    assert entity.query_type == "id"


def test_define_entity_full() -> None:
    from axintai import EntityIR, define_entity, param

    entity = define_entity(
        name="Task",
        display_title="Task",
        display_subtitle="A task to complete",
        display_image="checkmark.circle",
        properties={
            "id": param.string("Task ID"),
            "title": param.string("Task title"),
            "is_completed": param.boolean("Whether the task is done"),
        },
        query_type="id",
    )
    ir = entity.to_ir()
    assert isinstance(ir, EntityIR)
    assert ir.name == "Task"
    assert ir.display_representation.title == "Task"
    assert ir.display_representation.subtitle == "A task to complete"
    assert ir.display_representation.image == "checkmark.circle"
    assert len(ir.properties) == 3
    assert ir.query_type == "id"


def test_entity_ir_to_dict() -> None:
    from axintai import define_entity, param

    entity = define_entity(
        name="Contact",
        display_title="Contact",
        display_subtitle="A person",
        properties={
            "name": param.string("Contact name"),
            "email": param.string("Email address"),
        },
    )
    d = entity.to_ir().to_dict()
    assert d["name"] == "Contact"
    assert d["displayRepresentation"]["title"] == "Contact"
    assert d["displayRepresentation"]["subtitle"] == "A person"
    assert len(d["properties"]) == 2
    assert d["properties"][0]["name"] == "name"


def test_entity_ir_round_trip() -> None:
    from axintai import EntityIR, define_entity, param

    ir = define_entity(
        name="Event",
        display_title="Event",
        properties={"date": param.date("Event date")},
    ).to_ir()
    assert EntityIR.from_dict(ir.to_dict()) == ir


# ─── Enum Parameter Tests ────────────────────────────────────────────────


def test_param_enum_basic() -> None:
    spec = param.enum(["red", "green", "blue"], "Color choice")
    assert spec.type == "enum"
    assert spec.description == "Color choice"
    assert spec.enum_cases == ("red", "green", "blue")
    assert spec.optional is False


def test_param_enum_with_default() -> None:
    spec = param.enum(["low", "medium", "high"], "Priority level", default="medium")
    assert spec.type == "enum"
    assert spec.default == "medium"


def test_param_enum_optional() -> None:
    spec = param.enum(["option1", "option2"], "An option", optional=True)
    assert spec.optional is True


def test_intent_with_enum_param() -> None:
    from axintai import define_intent, param

    intent = define_intent(
        name="SetPriorityIntent",
        title="Set Priority",
        description="Sets the priority of a task",
        domain="productivity",
        params={
            "priority": param.enum(["low", "medium", "high"], "Priority level"),
        },
    )
    ir = intent.to_ir()
    assert len(ir.parameters) == 1
    assert ir.parameters[0].type == "enum"
    assert ir.parameters[0].enum_cases == ("low", "medium", "high")


# ─── Entity Parameter Tests ──────────────────────────────────────────────


def test_param_entity() -> None:
    spec = param.entity("Task", "The task to complete")
    assert spec.type == "entity"
    assert spec.entity_name == "Task"
    assert spec.description == "The task to complete"
    assert spec.optional is False


def test_param_entity_optional() -> None:
    spec = param.entity("Contact", "Optional contact reference", optional=True)
    assert spec.optional is True


def test_intent_with_entity_param() -> None:
    from axintai import define_intent, param

    intent = define_intent(
        name="UpdateTaskIntent",
        title="Update Task",
        description="Updates a task",
        domain="productivity",
        params={
            "task": param.entity("Task", "The task to update"),
        },
    )
    ir = intent.to_ir()
    assert len(ir.parameters) == 1
    assert ir.parameters[0].type == "entity"
    assert ir.parameters[0].entity_name == "Task"


# ─── Return Type Inference Tests ─────────────────────────────────────────


def test_return_type_inference_string() -> None:
    from axintai import define_intent, param

    def perform() -> str:
        return "result"

    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test return type",
        domain="test",
        perform=perform,
    )
    ir = intent.to_ir()
    assert ir.return_type == "string"


def test_return_type_inference_int() -> None:
    from axintai import define_intent, param

    def perform() -> int:
        return 42

    intent = define_intent(
        name="CountIntent",
        title="Count",
        description="Returns a count",
        domain="test",
        perform=perform,
    )
    ir = intent.to_ir()
    assert ir.return_type == "int"


def test_return_type_inference_bool() -> None:
    from axintai import define_intent, param

    def perform() -> bool:
        return True

    intent = define_intent(
        name="CheckIntent",
        title="Check",
        description="Returns a boolean",
        domain="test",
        perform=perform,
    )
    ir = intent.to_ir()
    assert ir.return_type == "boolean"


def test_return_type_inference_float() -> None:
    from axintai import define_intent, param

    def perform() -> float:
        return 3.14

    intent = define_intent(
        name="MeasureIntent",
        title="Measure",
        description="Returns a measurement",
        domain="test",
        perform=perform,
    )
    ir = intent.to_ir()
    assert ir.return_type == "double"


def test_no_return_type_when_missing() -> None:
    from axintai import define_intent

    intent = define_intent(
        name="VoidIntent",
        title="Void",
        description="No return type",
        domain="test",
    )
    ir = intent.to_ir()
    assert ir.return_type is None


def test_intent_with_multiple_features() -> None:
    from axintai import define_intent, param

    def perform() -> str:
        return "success"

    intent = define_intent(
        name="ComplexIntent",
        title="Complex Operation",
        description="Does complex things",
        domain="productivity",
        params={
            "task": param.entity("Task", "The task"),
            "priority": param.enum(["low", "high"], "Priority"),
            "name": param.string("Name"),
        },
        perform=perform,
    )
    ir = intent.to_ir()
    assert ir.return_type == "string"
    assert len(ir.parameters) == 3
    assert ir.parameters[0].type == "entity"
    assert ir.parameters[1].type == "enum"
    assert ir.parameters[2].type == "string"
