# Fix Packet

The Fix Packet is Axint's local repair contract for compile and watch runs.

Every `axint compile` and `axint watch` run emits:

- `.axint/fix/latest.json`
- `.axint/fix/latest.md`

The goal is simple:

1. Axint runs a compiler validation locally.
2. Axint writes one durable packet with the verdict, findings, and AI-ready fix prompt.
3. AI tools, Xcode helpers, or future plugins read that same packet instead of asking the user to copy diagnostics by hand.

## What is in the packet

The JSON packet includes:

- schema version and timestamp
- compiler version
- source surface, file name, file path, and language
- verdict: `pass`, `needs_review`, or `fail`
- confidence: whether Axint recognized a supported Apple-native surface or is treating the result as low-confidence
- counts for errors, warnings, and infos
- top findings and full diagnostics
- next steps
- AI-ready fix prompt
- Xcode-oriented checklist
- artifact paths for generated Swift, plist fragments, entitlements, and the packet files themselves

The markdown packet is the same information rendered for human review and easy sharing.

If Axint cannot recognize a supported Apple-native Swift surface, the packet drops to
`confidence: low` instead of pretending the file is fully covered.

## CLI flow

`axint compile` and `axint watch` emit the packet automatically by default.

You can opt out with:

```bash
axint compile my-intent.ts --no-fix-packet
axint watch ./intents --no-fix-packet
```

You can also change the packet directory:

```bash
axint compile my-intent.ts --fix-packet-dir .axint/custom-fix
```

## MCP flow

AI tools can read the latest packet through:

- `axint.fix-packet`

Formats:

- `json` — full structured packet
- `markdown` — human-readable report
- `prompt` — AI repair prompt only

This means the repair loop can be:

1. user runs Axint
2. Axint writes `.axint/fix/latest.json`
3. AI client calls `axint.fix-packet`
4. AI client fixes the code
5. user reruns Axint

## Xcode / plugin loop

This packet is the intended bridge for future Xcode-native and plugin-native flows.

The target loop is:

1. Axint compile or build plugin runs inside the Apple workflow.
2. Axint emits the latest Fix Packet locally.
3. Xcode assistant / plugin / MCP agent reads the packet.
4. The assistant applies the repair or presents the fix prompt.
5. Axint reruns until the packet becomes `pass`.

That keeps the system consistent:

- one packet format
- one repair prompt
- one source of truth

instead of separate diagnostics formats for CLI, MCP, and Xcode.
