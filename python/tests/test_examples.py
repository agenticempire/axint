"""Proof that bundled Python examples still compile across supported surfaces."""

from __future__ import annotations

from pathlib import Path

from axint import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
    parse_file,
    parse_file_apps,
    parse_file_views,
    parse_file_widgets,
    validate_app,
    validate_intent,
    validate_view,
    validate_widget,
)

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"


def test_python_examples_compile_cleanly() -> None:
    intent_files = ["create_event.py", "health_log.py"]
    view_files = ["profile_card.py"]
    widget_files = ["step_counter_widget.py"]
    app_files = ["weather_app.py"]

    for name in intent_files:
        path = EXAMPLES_DIR / name
        intents = parse_file(path)
        assert len(intents) == 1
        diagnostics = validate_intent(intents[0])
        assert diagnostics == []
        swift = generate_swift(intents[0])
        assert "struct" in swift

    for name in view_files:
        path = EXAMPLES_DIR / name
        views = parse_file_views(path)
        assert len(views) == 1
        diagnostics = validate_view(views[0])
        assert diagnostics == []
        swift = generate_swift_view(views[0])
        assert "struct" in swift

    for name in widget_files:
        path = EXAMPLES_DIR / name
        widgets = parse_file_widgets(path)
        assert len(widgets) == 1
        diagnostics = validate_widget(widgets[0])
        assert diagnostics == []
        swift = generate_swift_widget(widgets[0])
        assert "Widget" in swift

    for name in app_files:
        path = EXAMPLES_DIR / name
        apps = parse_file_apps(path)
        assert len(apps) == 1
        diagnostics = validate_app(apps[0])
        assert diagnostics == []
        swift = generate_swift_app(apps[0])
        assert "@main" in swift


def test_health_log_example_emits_real_privacy_copy() -> None:
    intent = parse_file(EXAMPLES_DIR / "health_log.py")[0]
    assert not any(d.code == "AX114" for d in validate_intent(intent))
    assert not any(d.code == "AX115" for d in validate_intent(intent))
    assert not any(d.code == "AX116" for d in validate_intent(intent))

    plist_fragment = generate_info_plist_fragment(intent)
    entitlements_fragment = generate_entitlements_fragment(intent)

    assert plist_fragment is not None
    assert entitlements_fragment is not None
    assert "Read prior health measurements to compare your progress." in plist_fragment
    assert "Save new health measurements that you log from this shortcut." in plist_fragment
    assert "com.apple.developer.healthkit" in entitlements_fragment
