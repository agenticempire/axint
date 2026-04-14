/**
 * Example: Weather App
 *
 * A full SwiftUI app scaffold with a main window,
 * macOS settings scene, and persisted user preferences.
 *
 * Run:
 *   axint compile examples/weather-app.ts --out generated/
 */

import { defineApp, scene, storage } from "@axint/compiler";

export default defineApp({
  name: "WeatherApp",
  scenes: [
    scene.windowGroup("WeatherDashboard"),
    scene.settings("SettingsView", { platform: "macOS" }),
  ],
  appStorage: {
    useCelsius: storage.boolean("use_celsius", true),
    lastCity: storage.string("last_city", "Cupertino"),
    refreshMinutes: storage.int("refresh_minutes", 30),
  },
});
