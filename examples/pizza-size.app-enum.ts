/**
 * Pizza Size App Enum
 *
 * Demonstrates the `defineAppEnum` surface — the shape Apple requires
 * for enum-typed parameters in App Intents and Shortcuts. Compiles to
 * a Swift `enum: String, AppEnum` with the matching
 * `typeDisplayRepresentation` and `caseDisplayRepresentations` map.
 */

import { defineAppEnum } from "@axint/compiler";

export default defineAppEnum({
  name: "PizzaSize",
  title: "Pizza Size",
  cases: [
    { value: "small", title: "Small", image: "circle" },
    { value: "medium", title: "Medium", image: "circle.fill" },
    { value: "large", title: "Large", image: "largecircle.fill.circle" },
  ],
});
