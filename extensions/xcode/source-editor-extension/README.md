# Axint Source Editor Extension

A native Xcode Source Editor Extension that surfaces Axint's Swift validator
and auto-fixer directly in the editor — no terminal, no agent, no prompt.

Three commands appear under **Editor → Axint** in any Swift file:

| Command | What it does |
|---------|--------------|
| `Axint: Auto-fix this file` | Runs every mechanical fix (AX701, AX702, AX703, AX704, AX714) on the current buffer |
| `Axint: Validate this file` | Reports the first 5 issues without rewriting |
| `Axint: @State let → @State var` | Just the property-wrapper rewrite |

Source Editor Extensions run sandboxed and cannot shell out to `axint`, so
the rules are ported to Swift in `AxintEditor/AxintFixer.swift`. The
TypeScript implementation in `src/core/swift-fixer.ts` is the source of
truth — keep them in lockstep.

## Layout

```
source-editor-extension/
├── AxintForXcode/                  Host macOS app (required to install the extension)
│   ├── AxintForXcodeApp.swift      SwiftUI app shell with setup instructions
│   ├── Info.plist
│   └── AxintForXcode.entitlements
└── AxintEditor/                    The Source Editor Extension target
    ├── SourceEditorExtension.swift Command registry
    ├── FixFileCommand.swift        AX70x auto-fixer wired to the buffer
    ├── ValidateCommand.swift       AX70x validator + Swift port
    ├── AxintFixer.swift            Inline Swift port of swift-fixer.ts
    ├── Info.plist
    └── AxintEditor.entitlements
```

## Building it

These are the source files for the extension. To produce a `.app` bundle
you need an Xcode project around them. We don't check the
`xcodeproj` in because Xcode regenerates a lot of it on every change and
the diffs are noise.

1. **Open Xcode → File → New → Project → macOS → App.**
   - Product Name: `AxintForXcode`
   - Bundle ID: `com.axint.xcode-extension`
   - Interface: SwiftUI
   - Language: Swift

2. **Replace the generated `AxintForXcodeApp.swift` and `ContentView.swift`
   with the file in `AxintForXcode/`.** Drag in `Info.plist` and the
   `.entitlements` file (use Existing Files, do not copy).

3. **Add the Source Editor Extension target.**
   - File → New → Target → macOS → Xcode Source Editor Extension
   - Product Name: `AxintEditor`
   - The wizard creates a target with a stub `SourceEditorExtension.swift`
     and `SourceEditorCommand.swift`. Delete both.

4. **Drag the four files from `AxintEditor/` into the new target.**
   Make sure target membership is set to `AxintEditor` only, not the host app.

5. **Build the host app** (`⌘B`). The first build will compile both
   targets and embed `AxintEditor.appex` inside `AxintForXcode.app`.

6. **Run the host app once** (`⌘R`). macOS registers the extension.

7. **Enable the extension.**
   - System Settings → Login Items & Extensions → Xcode Source Editor
   - Tick `AxintEditor`
   - Restart Xcode

## Using it

Open any `.swift` file. The `Editor → Axint` menu has three commands.
Bind them to keyboard shortcuts in System Settings → Keyboard → Keyboard
Shortcuts → App Shortcuts if you use them often. Recommended bindings:

| Command | Suggested shortcut |
|---------|-------------------|
| `Axint: Auto-fix this file` | `⌃⌥⌘ F` |
| `Axint: Validate this file` | `⌃⌥⌘ V` |

## Why bother — isn't `axint xcode fix` enough?

The CLI is the right tool for batch runs and CI. The extension is the
right tool for the moment Xcode shows a red `type does not conform to
protocol` and you want a one-keystroke rewrite without leaving the file.

Both call into the same fix rules (`src/core/swift-fixer.ts` ↔
`AxintFixer.swift`) and the test suite enforces parity.

## Future work

- [ ] Ship a pre-built `.app` notarized via GitHub Actions
- [ ] `axint xcode extension install` to run the build + enable flow
- [ ] Generate `AxintFixer.swift` from `src/core/swift-fixer.ts` so they
      can never drift
- [ ] Inline the validator's full `parseSwift()` instead of the regex
      shortcuts, once the rule set grows past simple patterns
