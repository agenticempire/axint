# Swift repair-loop examples

These examples exist for the validator, Fix Packet, and Xcode packet surfaces.

| File | Expectation | What it demonstrates |
| --- | --- | --- |
| `broken-intent.swift` | Needs review / fail | Missing `import AppIntents`, missing `perform()`, missing `@Parameter` |
| `clean-intent.swift` | Pass | A minimal AppIntent that satisfies Axint's Swift validator |
| `broken-widget.swift` | Needs review / fail | Missing `import WidgetKit` on a widget surface |
| `clean-view.swift` | Pass | A minimal SwiftUI view that should validate cleanly |

Try them directly:

```bash
axint validate-swift examples/swift/broken-intent.swift
axint validate-swift examples/swift/clean-intent.swift --json
axint validate-swift examples/swift --fix-packet-dir .axint/fix
axint xcode packet --kind validate --format prompt
```

The loop is intentionally simple:

1. Run a check.
2. Read the verdict and top findings.
3. Copy the Fix Packet prompt into your AI tool or use it as a manual repair checklist.
4. Re-run until the result drops to `pass`.
