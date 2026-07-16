# Accessibility Nutrition Label Proof

App Store accessibility declarations should follow completed common tasks, not
the presence of one modifier or one passing screen.

Axint's accessibility assessment API models Apple's recommended matrix:

- rows are common tasks such as first launch, login, purchase, primary product
  workflows, and settings
- columns are accessibility features
- each device family is evaluated separately
- every applicable common task needs passing or explicitly not-applicable
  evidence before a feature is claimable

Supported features:

- VoiceOver
- Voice Control
- Larger Text
- Dark Interface
- Differentiate Without Color Alone
- Sufficient Contrast
- Reduced Motion
- Captions
- Audio Descriptions

## Example

```ts
import {
  evaluateAccessibilityNutritionLabels,
  renderAccessibilityNutritionLabelReport,
} from "@axint/compiler";

const assessment = evaluateAccessibilityNutritionLabels({
  devices: ["iphone", "ipad"],
  commonTasks: [
    { id: "login", title: "Log in" },
    { id: "create-project", title: "Create a project" },
    { id: "upgrade", title: "Upgrade the account" },
  ],
  evidence: [
    {
      taskId: "login",
      device: "iphone",
      feature: "voiceOver",
      status: "pass",
      artifact: ".axint/proof/login-voiceover.xcresult",
    },
  ],
});

console.log(renderAccessibilityNutritionLabelReport(assessment));
```

The result keeps failed and missing tasks visible. It never infers that a
feature is supported from unrelated compiler success.

Cloud Build should attach the matrix, `.xcresult` references, screenshots,
accessibility snapshots, and review identity to the release receipt before it
offers to publish App Store accessibility declarations.

Authoritative guidance:

- [Overview of Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)
- [Manage Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels)
- [Configure accessibility declarations with the API](https://developer.apple.com/documentation/appstoreconnectapi/configuring-accessibility-declarations)
