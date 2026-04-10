"""Tests for the native Python Swift generator."""

from __future__ import annotations

from axintai import define_intent, param
from axintai.generator import (
    escape_swift_string,
    escape_xml,
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
)


def test_generates_minimal_intent() -> None:
    intent = define_intent(
        name="SendMessageIntent",
        title="Send Message",
        description="Sends a message to a contact",
        domain="messaging",
    )
    swift = generate_swift(intent.to_ir())

    assert "struct SendMessageIntentIntent: AppIntent {" in swift
    assert "import AppIntents" in swift
    assert "import Foundation" in swift
    assert 'static let title: LocalizedStringResource = "Send Message"' in swift
    assert "func perform() async throws" in swift
    assert "return .result(value:" in swift


def test_generates_intent_with_params() -> None:
    intent = define_intent(
        name="CreateCalendarEvent",
        title="Create Calendar Event",
        description="Creates a new event",
        domain="productivity",
        params={
            "event_title": param.string("Title of the event"),
            "start_date": param.date("When the event starts"),
            "duration_minutes": param.int("Length in minutes"),
        },
    )
    swift = generate_swift(intent.to_ir())

    assert "@Parameter(" in swift
    assert "var event_title: String" in swift
    assert "var start_date: Date" in swift
    assert "var duration_minutes: Int" in swift


def test_generates_optional_params() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        params={
            "name": param.string("Name", optional=True),
        },
    )
    swift = generate_swift(intent.to_ir())
    assert "var name: String?" in swift


def test_generates_param_with_default() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        params={
            "count": param.int("Count", default=5),
        },
    )
    swift = generate_swift(intent.to_ir())
    assert "var count: Int = 5" in swift


def test_generates_boolean_default() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        params={
            "is_active": param.boolean("Active", default=False),
        },
    )
    swift = generate_swift(intent.to_ir())
    assert "var is_active: Bool = false" in swift


def test_generates_all_param_types() -> None:
    intent = define_intent(
        name="AllTypesIntent",
        title="All Types",
        description="Tests all types",
        domain="utility",
        params={
            "s": param.string("str"),
            "i": param.int("integer"),
            "d": param.double("double"),
            "f": param.float("float"),
            "b": param.boolean("bool"),
            "dt": param.date("date"),
            "dur": param.duration("duration"),
            "u": param.url("url"),
        },
    )
    swift = generate_swift(intent.to_ir())

    assert "var s: String" in swift
    assert "var i: Int" in swift
    assert "var d: Double" in swift
    assert "var f: Float" in swift
    assert "var b: Bool" in swift
    assert "var dt: Date" in swift
    assert "var dur: Measurement<UnitDuration>" in swift
    assert "var u: URL" in swift


def test_generates_discoverable_false() -> None:
    intent = define_intent(
        name="HiddenIntent",
        title="Hidden",
        description="Not discoverable",
        domain="utility",
        is_discoverable=False,
    )
    swift = generate_swift(intent.to_ir())
    assert "static let isDiscoverable: Bool = false" in swift


def test_escape_swift_string() -> None:
    assert escape_swift_string('He said "hi"') == 'He said \\"hi\\"'
    assert escape_swift_string("line\nbreak") == "line\\nbreak"
    assert escape_swift_string("back\\slash") == "back\\\\slash"


def test_escape_xml() -> None:
    assert escape_xml("<tag>") == "&lt;tag&gt;"
    assert escape_xml('"quoted"') == "&quot;quoted&quot;"
    assert escape_xml("a&b") == "a&amp;b"


def test_info_plist_fragment() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        info_plist_keys=["NSHealthUpdateUsageDescription"],
    )
    frag = generate_info_plist_fragment(intent.to_ir())
    assert frag is not None
    assert "<key>NSHealthUpdateUsageDescription</key>" in frag
    assert '<plist version="1.0">' in frag


def test_info_plist_fragment_none_when_empty() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
    )
    assert generate_info_plist_fragment(intent.to_ir()) is None


def test_entitlements_fragment() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        entitlements=["com.apple.developer.healthkit"],
    )
    frag = generate_entitlements_fragment(intent.to_ir())
    assert frag is not None
    assert "<key>com.apple.developer.healthkit</key>" in frag
    assert "<true/>" in frag


def test_entitlements_fragment_none_when_empty() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
    )
    assert generate_entitlements_fragment(intent.to_ir()) is None


def test_header_comment_present() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
    )
    swift = generate_swift(intent.to_ir())
    assert "Generated by Axint" in swift
    assert "Do not edit manually" in swift
