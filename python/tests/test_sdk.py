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
