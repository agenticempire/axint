# Apple 27 Compatibility

Axint tracks the current iOS, iPadOS, macOS, visionOS, SwiftUI, Foundation
Models, CoreAI, App Intents, UIKit, Background Assets, and Xcode 27 changes that
can affect generated or existing projects.

This page describes implemented checks. It is not a substitute for compiling
and testing with the matching Apple SDK.

## iOS and iPadOS 27 beta 3

Implemented source checks:

| Area | Axint behavior |
| --- | --- |
| `@State` macro | Warns when declaration-site initialization conflicts with assignment in `init`, or an extension delegates to a synthesized initializer the macro can disable. |
| SwiftUI documents | Flags `FileDocument`, `ReferenceFileDocument`, and `nonisolated` reader/writer requirements. |
| `TabView` | Warns when a selected `TabView` contains an explicitly hidden tab path. |
| Text selection | Warns when `.textSelection(.enabled)` is adjacent to a competing `.gesture(...)` without a high-priority policy. |
| Toolbar minimization | Renames `.toolbarMinimizeBehavior(...)` to `.toolbarMinimizationBehavior(...)`. |
| Text fields | Rewrites soft-deprecated square/rounded border styles to `.bordered`. |
| Foundation Models | Flags `PrivateCloudComputeLanguageModel` code with no explicit sampling mode. |
| On Demand Resources | Flags `NSBundleResourceRequest` and points to Background Assets. |

Tracked release-note risks that require runtime or integration proof:

- Fitness might not surface workout-audio `RelevantEntities`.
- Shortcuts "Describe a change" can discard intents using `Duration` or
  `LPLinkMetadata`.
- Shortcuts Use Model can fail for some on-device output types.
- Siri can ignore custom map schema values.
- Siri call starts can fail for CallKit apps using `phone.startCall`.
- Siri can choose the wrong `OpenIntent` or `system.open` path when entity
  targets are ambiguous.
- CoreAI models converted with `coreai-torch` 0.4.0 need reconversion with
  0.4.1 or newer.
- CoreAI `.aimodelc` artifacts built with Xcode 27 beta 2 or earlier need
  recompilation with beta 3.

The earlier Private Cloud Compute simulator failure is marked resolved in
Apple's beta 3 release-note data. Axint no longer emits a physical-device-only
workaround for that issue.

## Xcode 27 beta 3

Axint exposes compatibility checks for:

- removed `-ld_classic` linker flags
- duplicate Clang module names visible to one Swift dependency scan
- Interface Builder's simulator-mode opt-out on build servers
- Swift 6.4 compatibility canaries
- bounded `swift test --maximum-repetitions ... --repeat-until ...` proof

CI keeps a strict stable-Xcode sandbox and a non-blocking Xcode 27 beta lane.
The beta lane becomes required only after the SDK is final and the hosted image
is consistently available.

## App Store Connect API 4.4.1

The public API detects:

- deprecated v1 in-app purchase, subscription, and subscription-group metadata
  resources
- commerce review submissions that still reference an unversioned relationship
- missing `socialMedia` and `socialMediaAgeRestricted` age-rating attributes

Use `analyzeAppStoreConnect441Request(...)` from `@axint/compiler`.

## Verification

```bash
npm test
npm run benchmark:brownfield:check
npm run mcp:production:check
npx tsx scripts/wwdc-diff.ts --snapshot
```

Authoritative sources:

- [iOS and iPadOS 27 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes)
- [Xcode 27 release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes)
- [App Store Connect API release notes](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-release-notes)
