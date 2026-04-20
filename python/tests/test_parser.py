"""Tests for the Python AST parser."""

from __future__ import annotations

import pytest

from axint.parser import ParserError, parse_source


def test_parses_minimal_intent() -> None:
    src = '''
from axint import define_intent, param

my_intent = define_intent(
    name="SendMessageIntent",
    title="Send Message",
    description="Sends a message to a contact",
    domain="messaging",
)
'''
    intents = parse_source(src, file="example.py")
    assert len(intents) == 1
    ir = intents[0]
    assert ir.name == "SendMessageIntent"
    assert ir.title == "Send Message"
    assert ir.domain == "messaging"
    assert ir.parameters == ()
    assert ir.source_file == "example.py"
    assert ir.source_line is not None


def test_parses_intent_with_params() -> None:
    src = '''
from axint import define_intent, param

create_event = define_intent(
    name="CreateCalendarEventIntent",
    title="Create Calendar Event",
    description="Creates a new event on the user's calendar",
    domain="productivity",
    params={
        "event_title": param.string("Title of the event"),
        "start_date": param.date("When the event starts"),
        "duration_minutes": param.int("Length of the event"),
    },
)
'''
    intents = parse_source(src)
    assert len(intents) == 1
    ir = intents[0]
    assert len(ir.parameters) == 3
    assert ir.parameters[0].name == "event_title"
    assert ir.parameters[0].type == "string"
    assert ir.parameters[1].type == "date"
    assert ir.parameters[2].type == "int"


def test_parses_multiple_intents_in_one_file() -> None:
    src = '''
from axint import define_intent

a = define_intent(name="A", title="A", description="a", domain="x")
b = define_intent(name="B", title="B", description="b", domain="x")
'''
    intents = parse_source(src)
    assert [ir.name for ir in intents] == ["A", "B"]


def test_parses_entitlements_and_info_plist_keys() -> None:
    src = '''
from axint import define_intent

intent = define_intent(
    name="HealthIntent",
    title="Log Workout",
    description="Logs a workout",
    domain="health",
    entitlements=["com.apple.developer.healthkit"],
    info_plist_keys=["NSHealthUpdateUsageDescription", "NSHealthShareUsageDescription"],
)
'''
    ir = parse_source(src)[0]
    assert ir.entitlements == ("com.apple.developer.healthkit",)
    assert len(ir.info_plist_keys) == 2
    assert ir.info_plist_keys[0][0] == "NSHealthUpdateUsageDescription"


def test_parses_info_plist_key_mapping() -> None:
    src = '''
from axint import define_intent

intent = define_intent(
    name="HealthIntent",
    title="Log Workout",
    description="Logs a workout",
    domain="health",
    info_plist_keys={
        "NSHealthUpdateUsageDescription": "Save workout data you log from this shortcut.",
        "NSHealthShareUsageDescription": "Read prior workout data to compare progress.",
    },
)
'''
    ir = parse_source(src)[0]
    assert ir.info_plist_keys == (
        (
            "NSHealthUpdateUsageDescription",
            "Save workout data you log from this shortcut.",
        ),
        (
            "NSHealthShareUsageDescription",
            "Read prior workout data to compare progress.",
        ),
    )


def test_parses_number_alias_as_int() -> None:
    src = '''
from axint import define_intent, param

x = define_intent(
    name="CountIntent",
    title="Count",
    description="Count things",
    domain="utility",
    params={"count": param.number("Count")},
)
'''
    ir = parse_source(src)[0]
    assert ir.parameters[0].type == "int"  # normalized


def test_parser_reports_missing_required_field() -> None:
    src = '''
from axint import define_intent

broken = define_intent(
    name="Broken",
    title="Broken",
    description="oops",
)
'''
    with pytest.raises(ParserError) as excinfo:
        parse_source(src, file="broken.py")
    codes = [d.code for d in excinfo.value.diagnostics]
    assert "AXP002" in codes


def test_parser_rejects_non_dict_params() -> None:
    src = '''
from axint import define_intent

x = define_intent(
    name="X",
    title="X",
    description="x",
    domain="x",
    params=None,
)
'''
    with pytest.raises(ParserError) as excinfo:
        parse_source(src)
    assert any(d.code == "AXP003" for d in excinfo.value.diagnostics)


def test_parser_rejects_unknown_param_type() -> None:
    src = '''
from axint import define_intent, param

x = define_intent(
    name="X",
    title="X",
    description="x",
    domain="x",
    params={"bad": param.geometry("bad")},
)
'''
    with pytest.raises(ParserError) as excinfo:
        parse_source(src)
    assert any(d.code == "AXP006" for d in excinfo.value.diagnostics)


def test_parser_reports_syntax_error() -> None:
    with pytest.raises(ParserError) as excinfo:
        parse_source("def broken(:\n    pass", file="bad.py")
    assert excinfo.value.diagnostics[0].code == "AXP001"


def test_parser_ignores_non_define_intent_assignments() -> None:
    src = '''
from axint import define_intent

x = 42
y = "hello"
real = define_intent(name="R", title="R", description="r", domain="x")
'''
    intents = parse_source(src)
    assert len(intents) == 1
    assert intents[0].name == "R"
