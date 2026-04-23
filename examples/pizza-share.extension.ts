/**
 * Pizza App Extensions
 *
 * Demonstrates the `defineExtension` surface — one provider emitting
 * multiple App Extension targets. Each target compiles to its own
 * principal Swift class plus an `NSExtension` Info.plist fragment Xcode
 * merges into the extension bundle.
 *
 * The example covers two of the four extension points Axint supports:
 * a Share Extension (so the host app shows up in the iOS Share Sheet)
 * and a Notification Service Extension (for mutating rich pushes
 * before the system displays them). `action` and `notificationContent`
 * kinds use the same shape.
 */

import { defineExtension } from "@axint/compiler";

export default defineExtension({
  name: "PizzaExtensions",
  targets: [
    {
      principalClass: "PizzaShareHandler",
      kind: "share",
      displayName: "Share with Pizza",
      maxItemCount: 1,
      activationTypes: [
        "NSExtensionActivationSupportsImageWithMaxCount",
        "NSExtensionActivationSupportsWebURLWithMaxCount",
      ],
    },
    {
      principalClass: "PizzaPushHandler",
      kind: "notificationService",
      displayName: "Pizza Rich Push",
    },
  ],
});
