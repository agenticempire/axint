# Fix Packet

The Fix Packet is Axint's local repair contract for compile and watch runs.

Every `axint compile`, `axint watch`, and `axint validate-swift` run emits:

- `.axint/fix/latest.json`
- `.axint/fix/latest.md`
- `.axint/fix/latest.check.json`
- `.axint/fix/latest.check.md`

The goal is simple:

1. Axint runs a compiler validation locally.
2. Axint writes one durable packet with the verdict, findings, and AI-ready fix prompt.
3. Axint also writes a lighter human-first check summary so the first read is a verdict, not a wall of raw diagnostics.
4. AI tools, Xcode helpers, or future plugins read that same packet instead of asking the user to copy diagnostics by hand.

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

The `latest.check.*` files are the lightweight verdict layer:

- `latest.check.json` — compact machine-readable summary for UI or workflow glue
- `latest.check.md` — compact human-readable summary that leads with verdict, top findings, and next step

The AI prompt is intentionally structured so it is more useful than a generic
LLM debugging dump. It now gives the model:

- what broke
- why it matters for the Apple workflow
- the concrete change direction for each top finding
- generated artifact hints for Swift, plist, and entitlements when Axint has them
- the next repair steps and Xcode checklist

If Axint cannot recognize a supported Apple-native Swift surface, the packet drops to
`confidence: low` instead of pretending the file is fully covered.

## CLI flow

`axint compile`, `axint watch`, and `axint validate-swift` emit both the Fix Packet and the lightweight Axint Check automatically by default.

When you are anonymous, the terminal output keeps the report lean and shows a gentle
`axint login` prompt. When you are signed in, the terminal output expands into the
richer signed-in verdict view automatically.

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
2. Axint emits both the latest Axint Check and the richer Fix Packet locally.
3. Xcode assistant / plugin / MCP agent reads the Axint Check first for the quick verdict.
4. The assistant opens the Fix Packet when it needs the full AI repair brief.
5. Axint reruns until the result becomes `pass`.

That keeps the system consistent:

- one quick-check format
- one packet format
- one repair prompt
- one source of truth

instead of separate diagnostics formats for CLI, MCP, and Xcode.

The Xcode-facing commands now map directly to those two layers:

- `axint xcode check` — quick verdict, top findings, next step, or AI prompt
- `axint xcode packet` — full Fix Packet, markdown, JSON, prompt, or packet path
