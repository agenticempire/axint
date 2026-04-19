/**
 * Example: Step Counter Widget
 *
 * A WidgetKit widget that shows daily step progress
 * with a goal tracker. Supports small and medium sizes.
 *
 * Run:
 *   axint compile examples/step-counter.ts --out generated/
 */

import { defineWidget, entry, view } from "@axint/compiler";

export default defineWidget({
  name: "StepCounter",
  displayName: "Step Counter",
  description: "Shows your daily step count and progress toward your goal.",
  families: ["systemSmall", "systemMedium"],
  entry: {
    steps: entry.int("Current step count", { default: 0 }),
    goal: entry.int("Daily goal", { default: 10000 }),
    lastUpdated: entry.date("Last sync time"),
  },
  body: [
    view.vstack([
      view.text("entry.steps"),
      view.text("of \\(entry.goal) steps"),
    ], { alignment: "center", spacing: 4 }),
  ],
  refreshInterval: 15,
});
