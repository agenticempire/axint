/**
 * Pizza Delivery Live Activity
 *
 * Demonstrates the `defineLiveActivity` surface end-to-end: immutable
 * order metadata in `attributes`, mutable delivery state in
 * `contentState`, a lock-screen banner, and every Dynamic Island
 * region.
 */

import { activityState, defineLiveActivity, view } from "@axint/compiler";

export default defineLiveActivity({
  name: "PizzaDelivery",
  attributes: {
    orderNumber: activityState.string("Short order number shown to the user"),
    storeName: activityState.string("Store the pizza was ordered from"),
  },
  contentState: {
    status: activityState.string("Human-readable delivery status"),
    eta: activityState.date("Estimated arrival time"),
    progress: activityState.double("0.0 – 1.0 delivery progress", {
      default: 0,
    }),
  },
  lockScreen: [
    view.vstack(
      [
        view.text("Pizza on the way"),
        view.text("ETA: soon"),
      ],
      { spacing: 6 }
    ),
  ],
  dynamicIsland: {
    expanded: [
      view.vstack([
        view.text("Pizza Delivery"),
        view.text("On its way"),
      ]),
    ],
    compactLeading: [view.image({ systemName: "bicycle" })],
    compactTrailing: [view.text("5m")],
    minimal: [view.image({ systemName: "bicycle" })],
  },
});
