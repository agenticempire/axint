# Show HN: Axint — Write one TypeScript function, compile to a native Siri action AND an MCP tool

**Title options (pick one):**
1. Show HN: Axint — Write one TypeScript function, get a native Siri action and an MCP tool
2. Show HN: Axint — Open-source compiler that turns TypeScript into Apple App Intents + MCP tools
3. Show HN: Axint — Agents that build agents. TS → Swift App Intents + MCP, from one defineIntent() call

---

Hey HN,

I built Axint — an open-source compiler that takes a single TypeScript `defineIntent()` call and produces two outputs: a native Swift App Intent (for Siri, Shortcuts, Spotlight, Apple Intelligence) and an MCP tool server (for Claude, Cursor, Windsurf, and any MCP-compatible host).

The idea: AI agent capabilities shouldn't be siloed per platform. Write the logic once, compile it to every surface where agents operate.

**Quick demo:**

```typescript
defineIntent({
  name: "CreateEvent",
  title: "Create Calendar Event",
  description: "Creates a new event",
  params: {
    title: param.string("Event title"),
    date: param.date("When"),
  },
  perform: async ({ title, date }) => {
    return { eventId: "created" };
  },
});
```

One command: `axint compile event.ts --out ios/Intents/`

You get:
- A Swift file with proper `AppIntent` conformance, `@Parameter` decorators, typed `perform()`, and `ReturnsValue<T>`
- Info.plist and entitlements fragments
- An MCP tool definition that any AI coding assistant can call

**What's interesting technically:**
- Real TypeScript AST parser (not regex) using the TS compiler API
- Sub-millisecond compilation — the browser playground compiles on every keystroke
- EntityQuery and DynamicOptionsProvider support for complex App Intents patterns
- `axint eject` generates standalone Swift with zero Axint dependency
- SPM build plugin so it runs inside Xcode builds automatically
- The compiler itself is exposed as MCP tools, so AI agents can use Axint to create new agent capabilities (agents building agents)

**Why now:** Apple is fusing MCP with App Intents in iOS 26.1 (announced at WWDC 2026). The line between "Siri action" and "AI agent tool" is disappearing. Axint is the bridge.

Apache 2.0, zero telemetry, no CLA.

- GitHub: https://github.com/agenticempire/axint
- Playground: https://axint.ai/#playground
- npm: `npm install -g @axintai/compiler`

Would love feedback on the compilation model, the dual-surface approach, and what App Intent patterns you'd want supported next.
