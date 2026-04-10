"""Tests for the Python-native IR validator."""

from __future__ import annotations

from axintai import define_intent, param
from axintai.validator import validate_intent


def test_valid_intent_returns_no_errors() -> None:
    intent = define_intent(
        name="SendMessageIntent",
        title="Send Message",
        description="Sends a message",
        domain="messaging",
        params={"body": param.string("Message body")},
    )
    diagnostics = validate_intent(intent.to_ir())
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []


def test_rejects_non_pascal_case_name() -> None:
    intent = define_intent(
        name="send_message",
        title="Send Message",
        description="Sends a message",
        domain="messaging",
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics if d.severity == "error"]
    assert "AX100" in codes


def test_rejects_empty_title() -> None:
    intent = define_intent(
        name="TestIntent",
        title="",
        description="Test",
        domain="utility",
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics if d.severity == "error"]
    assert "AX101" in codes


def test_rejects_empty_description() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="",
        domain="utility",
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics if d.severity == "error"]
    assert "AX102" in codes


def test_warns_on_empty_param_description() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        params={"name": param.string("")},
    )
    diagnostics = validate_intent(intent.to_ir())
    warnings = [d for d in diagnostics if d.code == "AX104"]
    assert len(warnings) == 1


def test_warns_on_too_many_parameters() -> None:
    params = {f"p{i}": param.string(f"Param {i}") for i in range(11)}
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        params=params,
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics]
    assert "AX105" in codes


def test_warns_on_long_title() -> None:
    intent = define_intent(
        name="TestIntent",
        title="A" * 65,
        description="Test",
        domain="utility",
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics]
    assert "AX106" in codes


def test_warns_on_invalid_entitlement() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        entitlements=["not-valid"],
    )
    diagnostics = validate_intent(intent.to_ir())
    codes = [d.code for d in diagnostics]
    assert "AX108" in codes


def test_accepts_valid_entitlement() -> None:
    intent = define_intent(
        name="TestIntent",
        title="Test",
        description="Test",
        domain="utility",
        entitlements=["com.apple.developer.siri"],
    )
    diagnostics = validate_intent(intent.to_ir())
    ent_warns = [d for d in diagnostics if d.code == "AX108"]
    assert ent_warns == []
