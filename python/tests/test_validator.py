"""Tests for the Python-native IR validator."""

from __future__ import annotations

from axint import define_intent, param
from axint.validator import validate_intent


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


def test_warns_when_healthkit_entitlement_lacks_usage_descriptions() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        entitlements=["com.apple.developer.healthkit"],
    )
    diagnostics = validate_intent(intent.to_ir())
    assert any(d.code == "AX114" for d in diagnostics)


def test_warns_when_healthkit_usage_descriptions_lack_entitlement() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        info_plist_keys={
            "NSHealthShareUsageDescription": "Read prior workout data to compare progress.",
        },
    )
    diagnostics = validate_intent(intent.to_ir())
    assert any(d.code == "AX115" for d in diagnostics)


def test_warns_when_privacy_usage_copy_is_placeholder() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        info_plist_keys={
            "NSHealthShareUsageDescription": "TODO: explain why this app reads HealthKit data",
            "NSHealthUpdateUsageDescription": "",
        },
    )
    diagnostics = validate_intent(intent.to_ir())
    assert len([d for d in diagnostics if d.code == "AX116"]) == 2


def test_accepts_healthkit_entitlement_with_real_usage_copy() -> None:
    intent = define_intent(
        name="HealthIntent",
        title="Log Workout",
        description="Logs a workout",
        domain="health",
        entitlements=["com.apple.developer.healthkit"],
        info_plist_keys={
            "NSHealthShareUsageDescription": "Read prior workout data to compare your progress.",
            "NSHealthUpdateUsageDescription": "Save new workout data you log from this shortcut.",
        },
    )
    diagnostics = validate_intent(intent.to_ir())
    assert not any(d.code == "AX114" for d in diagnostics)
    assert not any(d.code == "AX115" for d in diagnostics)
    assert not any(d.code == "AX116" for d in diagnostics)
