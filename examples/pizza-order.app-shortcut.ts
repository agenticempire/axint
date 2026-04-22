/**
 * Pizza Order App Shortcut
 *
 * Demonstrates the `defineAppShortcut` surface — the Shortcuts/Siri
 * entry point Apple requires for each app that exposes App Intents.
 * Compiles to a Swift `struct PizzaShortcuts: AppShortcutsProvider`
 * with a static `@AppShortcutsBuilder` body.
 *
 * Authors write `${applicationName}` inside phrases; Axint rewrites
 * it to Apple's `\(.applicationName)` interpolation token, which at
 * least one phrase per shortcut must contain.
 */

import { defineAppShortcut } from "@axint/compiler";

export default defineAppShortcut({
  name: "PizzaShortcuts",
  shortcuts: [
    {
      intent: "OrderPizza",
      phrases: [
        "Order a pizza with ${applicationName}",
        "Start a pizza order in ${applicationName}",
      ],
      shortTitle: "Order Pizza",
      systemImageName: "fork.knife",
    },
    {
      intent: "FindStore",
      phrases: [
        "Find a ${applicationName} store near me",
      ],
      shortTitle: "Find a Store",
      systemImageName: "location.fill",
    },
  ],
});
