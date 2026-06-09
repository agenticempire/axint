# Apple Intelligence Proof

Use Axint before and after every Apple Intelligence or App Intents edit in Xcode.

## Required Loop

1. Start with `axint.status`, then `axint.session.start` for the project.
2. For new App Intents, entities, enums, Foundation Models, previews, or localization flows, call `axint.suggest` or `axint.feature` before writing code.
3. After edits, run `axint.swift.validate` on changed Swift files.
4. Run `axint.cloud.check` with Xcode 27 build/test evidence.
5. For schema-backed App Intents, attach AppIntentsTesting proof for Siri, Shortcuts, and Spotlight pathways.
6. Before claiming the task is fixed, run `axint.run` or focused `xcodebuild` proof and summarize the exact command output.

## Guardrails

- Do not call generated Apple Intelligence code demo-ready from static checks alone.
- Do not invent App Schema, Foundation Models, or AppIntentsTesting APIs.
- If Xcode 27 beta is installed outside the selected developer directory, set `DEVELOPER_DIR` before build/test proof.
- Keep source, prompts, and user content out of public reports unless the user explicitly opts in.
