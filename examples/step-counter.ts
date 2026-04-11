/**
 * Example: Step Counter Widget
 *
 * A WidgetKit widget that shows daily step progress
 * with a goal tracker. Supports small and medium sizes.
 *
 * Run:
 *   axint compile examples/step-counter.ts --out generated/
 */

import { defineWidget, entry, view } from "@axintai/compiler";

export default defineWidget({
  name: "StepCounter",
  displayName: "Step Counter",
  description: "Shows your daily step count and progress toward your goal.",
  families: ["systemSmall", "systemMedium"],
  entry: {
    steps: entry.int(0),
    goal: entry.int(10000),
    lastUpdated: entry.date(),
  },
  body: [
    view.vstack({ alignment: "center", spacing: 4 }, [
      view.text("entry.steps"),
      view.text("of \\(entry.goal) steps"),
    ]),
  ],
  refreshInterval: 15,
});
