"""Tests for the axintai CLI."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from axintai.cli import main

SAMPLE_INTENT = '''
from axintai import define_intent, param

create_event = define_intent(
    name="CreateCalendarEventIntent",
    title="Create Calendar Event",
    description="Creates a new event on the user's calendar",
    domain="productivity",
    params={
        "event_title": param.string("Title of the event"),
        "start_date": param.date("When the event starts"),
    },
    entitlements=["com.apple.developer.calendars"],
    info_plist_keys=["NSCalendarsUsageDescription"],
)
'''


def _write_temp(content: str, suffix: str = ".py") -> Path:
    with tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp.flush()
        return Path(tmp.name)


def test_parse_command(capsys) -> None:
    path = _write_temp(SAMPLE_INTENT)
    exit_code = main(["parse", str(path)])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "CreateCalendarEventIntent" in captured.out


def test_parse_json_command(capsys) -> None:
    path = _write_temp(SAMPLE_INTENT)
    exit_code = main(["parse", str(path), "--json"])
    assert exit_code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert "intents" in data
    assert len(data["intents"]) == 1
    assert data["intents"][0]["name"] == "CreateCalendarEventIntent"
    assert len(data["intents"][0]["parameters"]) == 2


def test_compile_stdout(capsys) -> None:
    path = _write_temp(SAMPLE_INTENT)
    exit_code = main(["compile", str(path), "--stdout"])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "struct CreateCalendarEventIntentIntent: AppIntent" in captured.out
    assert "import AppIntents" in captured.out
    assert "var event_title: String" in captured.out
    assert "var start_date: Date" in captured.out


def test_compile_to_file() -> None:
    path = _write_temp(SAMPLE_INTENT)
    with tempfile.TemporaryDirectory() as tmpdir:
        exit_code = main(["compile", str(path), "--out", tmpdir])
        assert exit_code == 0
        swift_file = Path(tmpdir) / "CreateCalendarEventIntentIntent.swift"
        assert swift_file.exists()
        swift_code = swift_file.read_text()
        assert "struct CreateCalendarEventIntentIntent: AppIntent" in swift_code


def test_compile_json_mode(capsys) -> None:
    path = _write_temp(SAMPLE_INTENT)
    exit_code = main(["compile", str(path), "--json"])
    assert exit_code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["success"] is True
    assert "struct" in data["swift"]
    assert data["name"] == "CreateCalendarEventIntent"


def test_compile_with_fragments() -> None:
    path = _write_temp(SAMPLE_INTENT)
    with tempfile.TemporaryDirectory() as tmpdir:
        exit_code = main([
            "compile", str(path),
            "--out", tmpdir,
            "--emit-info-plist",
            "--emit-entitlements",
        ])
        assert exit_code == 0
        plist_file = Path(tmpdir) / "CreateCalendarEventIntentIntent.plist.fragment.xml"
        ent_file = Path(tmpdir) / "CreateCalendarEventIntentIntent.entitlements.fragment.xml"
        assert plist_file.exists()
        assert ent_file.exists()
        assert "NSCalendarsUsageDescription" in plist_file.read_text()
        assert "com.apple.developer.calendars" in ent_file.read_text()


def test_validate_valid_intent(capsys) -> None:
    path = _write_temp(SAMPLE_INTENT)
    exit_code = main(["validate", str(path)])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "valid intent" in captured.out


def test_validate_invalid_intent(capsys) -> None:
    bad_intent = '''
from axintai import define_intent

broken = define_intent(
    name="not_pascal_case",
    title="",
    description="",
    domain="utility",
)
'''
    path = _write_temp(bad_intent)
    exit_code = main(["validate", str(path)])
    assert exit_code == 1


def test_compile_file_not_found() -> None:
    exit_code = main(["compile", "/nonexistent/path.py"])
    assert exit_code == 1


def test_parse_file_not_found() -> None:
    exit_code = main(["parse", "/nonexistent/path.py"])
    assert exit_code == 1


def test_validate_file_not_found() -> None:
    exit_code = main(["validate", "/nonexistent/path.py"])
    assert exit_code == 1


def test_compile_empty_file() -> None:
    path = _write_temp("# no intents here\nx = 42\n")
    exit_code = main(["compile", str(path)])
    assert exit_code == 1
