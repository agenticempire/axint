# Axint v0.3.0 Launch Thread

## Tweet 1 (Hook)
We just open-sourced Axint — a compiler that turns one TypeScript function into two things:

→ A native Siri action (Swift App Intent)
→ An MCP tool (for Claude, Cursor, Windsurf)

One definition. Two agent surfaces. Zero Swift required.

🧵 Here's how it works:

## Tweet 2 (The Problem)
The problem: AI agents are fragmented.

Siri needs Swift App Intents.
Claude needs MCP tool servers.
Cursor needs MCP.
Shortcuts needs App Intents.

Same capability, 4 different implementations. That's insane.

## Tweet 3 (The Solution)
Axint fixes this with `defineIntent()`:

```typescript
defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  params: {
    title: param.string("Event title"),
    date: param.date("When"),
  },
})
```

One compile command → Swift + MCP. Done.

## Tweet 4 (Demo GIF)
[ATTACH: Screen recording of the axint.ai playground — type defineIntent(), watch Swift appear in real time]

The full compiler runs in your browser. Sub-millisecond compilation on every keystroke.

Try it: axint.ai/#playground

## Tweet 5 (Technical Depth)
Under the hood:
- Real TypeScript AST parser (not regex)
- EntityQuery + DynamicOptionsProvider for complex intents
- SPM build plugin — runs inside Xcode automatically
- `axint eject` → standalone Swift, zero vendor lock-in
- 120+ tests, 98% coverage

## Tweet 6 (The Meta-Layer)
Here's the wild part: Axint itself is an MCP server.

That means Claude, Cursor, and Windsurf can use Axint to CREATE new agent capabilities.

Agents building agents. That's the flywheel.

## Tweet 7 (WWDC Angle)
Apple is fusing MCP with App Intents in iOS 26.1.

"Siri action" and "AI agent tool" are becoming the same thing.

Axint has been building for this convergence since day one. We have a nightly CI pipeline that auto-diffs Apple's App Intents headers — within 72 hours of WWDC, we ship support.

## Tweet 8 (CTA)
Axint is Apache 2.0, zero telemetry, no CLA.

⭐ GitHub: github.com/agenticempire/axint
🎮 Playground: axint.ai
📦 Install: npm install -g @axintai/compiler
💬 Discord: [link]

Built by @[handle]. Feedback welcome — what intent patterns do you want next?
