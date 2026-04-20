# TypeScript examples

These are the maintained TypeScript entry points for the public compiler surface.

| File | Surface | What it demonstrates |
| --- | --- | --- |
| `calendar-assistant.ts` | Intent | Calendar creation flow with date and duration parameters |
| `health-log.ts` | Intent | HealthKit entitlement + Info.plist privacy copy |
| `messaging.ts` | Intent | Basic messaging intent structure |
| `profile-card.ts` | View | SwiftUI view composition and conditional rendering |
| `smart-home.ts` | Intent | Device-style control intent |
| `step-counter.ts` | Widget | WidgetKit entry/body/family coverage |
| `trail-planner.ts` | Intent | Richer parameter coverage for outdoor planning |
| `weather-app.ts` | App | Full app scaffold with scenes and app storage |

Quick ways to use them:

```bash
npx @axint/compiler compile examples/health-log.ts --stdout
npx @axint/compiler compile examples/profile-card.ts --stdout
npx @axint/compiler compile examples/step-counter.ts --stdout
npx @axint/compiler compile examples/weather-app.ts --stdout
```

Need the Swift/Xcode repair-loop examples too? See [`examples/swift/README.md`](./swift/README.md).
