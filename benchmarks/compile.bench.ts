import { bench, describe } from "vitest";
import {
  compileSource,
  compileViewSource,
  compileWidgetSource,
  compileAppSource,
} from "../src/core/compiler.js";

describe("Intent Compilation", () => {
  const intentSource = `
import { defineIntent, param } from "axint";
export default defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event",
  domain: "productivity",
  params: {
    title: param.string("Event title"),
    date: param.date("Event date"),
    durationMinutes: param.int("Duration in minutes", { default: 30 }),
    location: param.string("Location", { required: false }),
    isAllDay: param.boolean("All day", { required: false }),
  },
  perform: async ({ title }) => ({ success: true }),
});
`;

  bench(
    "compiles intent with 5 parameters",
    () => {
      const result = compileSource(intentSource, "CreateEvent.ts", {
        validate: false,
      });
      if (!result.success) {
        throw new Error(`Compilation failed: ${result.diagnostics[0]?.message}`);
      }
    },
    { iterations: 100 }
  );
});

describe("View Compilation", () => {
  const viewSource = `
import { defineView, prop, state, view } from "axint";
export default defineView({
  name: "ProfileCard",
  props: {
    username: prop.string("User name"),
    avatarUrl: prop.url("Avatar URL"),
  },
  state: {
    isExpanded: state.boolean("Card expanded", { default: false }),
    tapCount: state.int("Tap count", { default: 0 }),
  },
  body: [
    view.vstack([
      view.text("Hello, \\(username)!"),
      view.hstack([
        view.image({ systemName: "person.circle" }),
        view.text("\\(tapCount) taps"),
      ]),
      view.button("Toggle", "isExpanded.toggle()"),
      view.conditional("isExpanded", [
        view.text("Expanded content here"),
      ]),
    ], { spacing: 12 }),
  ],
});
`;

  bench(
    "compiles view with conditional rendering",
    () => {
      const result = compileViewSource(viewSource, "ProfileCard.ts", {
        validate: false,
      });
      if (!result.success) {
        throw new Error(`Compilation failed: ${result.diagnostics[0]?.message}`);
      }
    },
    { iterations: 100 }
  );
});

describe("Widget Compilation", () => {
  const widgetSource = `
import { defineWidget, entry, view } from "axint";
export default defineWidget({
  name: "StepCounter",
  displayName: "Step Counter",
  description: "Shows daily step count",
  families: ["systemSmall", "systemMedium"],
  entry: {
    steps: entry.int("Current steps", { default: 0 }),
    goal: entry.int("Daily goal", { default: 10000 }),
    lastUpdated: entry.date("Last sync"),
  },
  body: [
    view.vstack([
      view.text("\\(steps)"),
      view.text("of \\(goal) steps"),
    ], { spacing: 4 }),
  ],
  refreshInterval: 15,
});
`;

  bench(
    "compiles widget with entry timeline",
    () => {
      const result = compileWidgetSource(widgetSource, "StepCounter.ts", {
        validate: false,
      });
      if (!result.success) {
        throw new Error(`Compilation failed: ${result.diagnostics[0]?.message}`);
      }
    },
    { iterations: 100 }
  );
});

describe("App Compilation", () => {
  const appSource = `
import { defineApp } from "axint";
export default defineApp({
  name: "MyApp",
  scenes: [
    { kind: "windowGroup", view: "ContentView" },
    { kind: "settings", view: "SettingsView", platform: "macOS" },
  ],
  storage: {
    isDarkMode: { key: "dark_mode", type: "boolean", default: false },
    username: { key: "username", type: "string", default: "" },
  },
});
`;

  bench(
    "compiles app with scenes and storage",
    () => {
      const result = compileAppSource(appSource, "MyApp.ts", {
        validate: false,
      });
      if (!result.success) {
        throw new Error(`Compilation failed: ${result.diagnostics[0]?.message}`);
      }
    },
    { iterations: 100 }
  );
});
