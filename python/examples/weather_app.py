"""Example: weather app scaffold.

Run it:

    axint-py parse examples/weather_app.py
    axint-py compile examples/weather_app.py --stdout
"""

from axint import define_app, scene, storage

weather_app = define_app(
    name="WeatherApp",
    scenes=[
        scene.window_group("WeatherDashboard"),
        scene.settings("SettingsView", platform="macOS"),
    ],
    app_storage={
        "use_celsius": storage.boolean("use_celsius", True),
        "last_city": storage.string("last_city", "Cupertino"),
        "refresh_minutes": storage.int("refresh_minutes", 30),
    },
)
