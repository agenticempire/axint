# Axint Wow Fixture: Composer Blocker

This fixture demonstrates the repair loop Axint should make obvious for a real Apple UI bug:

1. The text input exists on screen.
2. A nearly invisible overlay captures taps.
3. The UI test fails because the composer is not hittable.
4. Axint should classify this as an existing SwiftUI interaction repair, point at the likely overlay surface, and ask for focused UI proof before claiming done.

## Try The Loop

```bash
axint init --apple-project examples/wow/composer-blocker --agent codex --force
axint agent advice --dir examples/wow/composer-blocker --agent codex --changed App/HomeView.swift UITests/ComposerBlockerUITests.swift
axint repair "Home composer text field exists but is not hittable because a translucent overlay is blocking input" --dir examples/wow/composer-blocker --agent codex --changed App/HomeView.swift UITests/ComposerBlockerUITests.swift
axint run --dir examples/wow/composer-blocker --agent codex --dry-run --project ComposerBlocker.xcodeproj --scheme ComposerBlocker --only-testing ComposerBlockerUITests/ComposerBlockerUITests/testComposerTextFieldAcceptsInput
```

## Expected Diagnosis

Axint should not suggest a new feature. It should say this is an existing SwiftUI interaction repair and focus the agent on:

- The overlay in `App/HomeView.swift`.
- The `composer-input` accessibility identifier.
- The failing focused UI test in `UITests/ComposerBlockerUITests.swift`.
- The proof command that reruns only `testComposerTextFieldAcceptsInput`.

## Sample Failure

The file `.axint-demo/failure.log` contains a representative Xcode UI-test failure that Axint can parse into a repair packet:

```text
XCTAssertTrue failed - composer-input should be hittable
```
