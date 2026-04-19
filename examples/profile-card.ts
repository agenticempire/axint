/**
 * Example: Profile Card View
 *
 * A SwiftUI view that shows a user's profile with an
 * expandable details section. Demonstrates props, state,
 * and conditional rendering.
 *
 * Run:
 *   axint compile examples/profile-card.ts --out generated/
 */

import { defineView, prop, state, view } from "@axint/compiler";

export default defineView({
  name: "ProfileCard",
  props: {
    displayName: prop.string("User's display name"),
    joinDate: prop.date("Account creation date"),
    avatarURL: prop.url("Profile image URL"),
  },
  state: {
    showDetails: state.boolean("Whether details are visible", { default: false }),
  },
  body: [
    view.vstack([
      view.hstack([
        view.text("entry.displayName"),
      ], { spacing: 12 }),
      view.button("showDetails ? \"Hide Details\" : \"Show Details\"", "showDetails.toggle()"),
      view.conditional("showDetails", [
        view.text("entry.joinDate"),
      ]),
    ], { alignment: "leading", spacing: 12 }),
  ],
});
