"""Focused tests for the Python MCP helper surface."""

from __future__ import annotations

from axint.mcp_server import (
    generate_feature_package,
    handle_compile_from_schema,
    scaffold_intent,
    suggest_features,
)


def test_suggest_features_prefers_explicit_domain() -> None:
    suggestions = suggest_features(
        {
            "appDescription": "A lightweight planner with tasks and reminders",
            "domain": "health",
            "limit": 2,
        }
    )

    assert len(suggestions) == 2
    assert suggestions[0]["domain"] == "health"
    assert "Siri" in suggestions[0]["description"]


def test_scaffold_intent_uses_current_python_imports() -> None:
    source = scaffold_intent(
        name="LogWater",
        description="Log a glass of water",
        domain="health",
        params=[
            {"name": "ounces", "type": "int", "description": "Ounces"},
            {"name": "cold", "type": "boolean", "description": "Whether it is cold"},
        ],
    )

    assert 'from axint import define_intent, param' in source
    assert 'domain="health"' in source
    assert '"ounces": param.int("Ounces")' in source
    assert '"cold": param.boolean("Whether it is cold")' in source


def test_handle_compile_from_schema_emits_swift_and_token_stats() -> None:
    output = handle_compile_from_schema(
        {
            "type": "intent",
            "name": "CreateEvent",
            "title": "Create Event",
            "description": "Create a calendar event",
            "domain": "productivity",
            "params": {
                "title": "string",
                "startsAt": "date",
            },
        }
    )

    assert "Token Statistics" in output
    assert "struct CreateEventIntent: AppIntent" in output
    assert '@Parameter(title: "Title")' in output
    assert '@Parameter(title: "Starts At")' in output


def test_generate_feature_package_outputs_multiple_surfaces() -> None:
    output = generate_feature_package(
        {
            "name": "LogWorkout",
            "description": "Let users log a workout with type, duration, and calories via Siri",
            "domain": "health",
            "surfaces": ["intent", "widget", "view"],
        }
    )

    assert 'Generated 3 Swift files + 2 tests for "LogWorkout"' in output
    assert "Sources/Intents/LogWorkoutIntent.swift" in output
    assert "Sources/Widgets/LogWorkoutWidget.swift" in output
    assert "Sources/Views/LogWorkoutView.swift" in output
    assert "Tests/LogWorkoutIntentTests.swift" in output
    assert "Tests/LogWorkoutWidgetTests.swift" in output
