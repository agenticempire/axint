# Axint Launch Posts

Copy-paste-ready drafts for launch day. Fire them in this order:

1. Show HN (9am ET, Tue–Thu)
2. Twitter/X thread (same time, pinned)
3. LinkedIn (same day, afternoon)
4. Reddit — r/swift, r/iOSProgramming, r/LocalLLaMA (next day)

Replace `axint.ai` with the live playground URL once the domain is pointed at
Vercel, and replace `0.1.1` with whichever version npm actually accepted.

---

## 1 · Show HN

**Title:**

> Show HN: Axint – an Apple-native execution layer for AI agents

**Body:**

> Hey HN — I'm Nima, founder of Agentic Empire (agenticempire.co). We just
> open-sourced Axint, a
> compiler that turns a TypeScript `defineIntent()` call into a native Apple
> App Intent you can drop into Xcode.
>
> The motivation: App Intents is the right surface for AI agents on Apple
> platforms (Siri, Shortcuts, Spotlight, Apple Intelligence), but the
> ceremony to author one correctly — `@AppIntent`, `@Parameter`, resolver
> rules, localization keys — is a lot of Swift boilerplate per intent. And
> if you want an AI coding assistant to author them for you, the model has
> to juggle all of that context every time.
>
> Axint gives you one TypeScript function. You call `defineIntent({ name,
> title, description, params, perform })` and get back idiomatic Swift that
> looks like what a senior Apple engineer would have written.
>
> It's three things in one repo:
>
>   • A CLI (`axint compile my-intent.ts`) with Rust-style diagnostics
>   • A library (`compileSource()` / `compileFile()`) if you want to
>     embed it in your own tooling
>   • An MCP server so Claude Code, Cursor, and Windsurf can call the
>     compiler directly as a tool
>
> The compiler itself is tiny — ~735 lines of pure TypeScript, no Babel, no
> ts-morph, no TypeScript compiler API. Four passes: parse → validate IR →
> generate Swift → validate Swift. 117 tests at 98% coverage, including an
> injection-resistance suite (Swift string literals are a surprisingly
> interesting attack surface).
>
> There's a live playground at https://axint.ai — it runs the exact same
> compiler core in your browser with zero telemetry. Paste TypeScript on
> the left, watch Swift update on the right sub-millisecond.
>
> This is v0.1 — today it covers the common-case shape (name, params,
> perform handler, return values) for a handful of App Intent categories.
> Enum/entity resolvers, custom Swift types, and full Xcode project
> integration are next. Apache 2.0, no CLA on the compiler, happy to take
> PRs.
>
> Repo: https://github.com/agenticempire/axint
> Playground: https://axint.ai
> Docs: in the repo README for now; real docs coming next week.
>
> Would love feedback — especially from anyone who's written non-trivial
> App Intents by hand.

---

## 2 · Twitter / X (thread)

**Post 1 (pinned):**

> just open-sourced Axint — a TypeScript → Swift compiler for Apple App
> Intents 🧵
>
> paste TypeScript, get native Swift. runs in your browser. zero telemetry.
>
> 👉 axint.ai

**Post 2:**

> App Intents is where Siri, Shortcuts, Spotlight, and Apple Intelligence
> meet. it's also a Swift boilerplate festival:
>
> `@AppIntent`, `@Parameter`, `ResolverError`, `SummaryBuilder`,
> localization keys, resolver closures, …
>
> one intent = 60 lines of Swift before you've written any logic.

**Post 3:**

> with Axint, you define it once in TypeScript:
>
> ```ts
> defineIntent({
>   name: "SetLights",
>   title: "Set Lights",
>   params: {
>     room: param.string("Which room"),
>     brightness: param.number("0–100", { default: 100 }),
>   },
>   perform: async ({ room, brightness }) => ({ room, brightness }),
> })
> ```
>
> and compile to idiomatic Swift. one file per intent, done.

**Post 4:**

> three entry points, same core:
>
> → CLI: `axint compile intent.ts`
> → library: `compileSource()` for your own tooling
> → MCP server: Claude Code / Cursor / Windsurf can call `axint.compile`, `axint.validate`, and the rest directly

**Post 5:**

> 735 lines of pure TypeScript. no ts-morph, no Babel. 4 passes: parse →
> validate IR → generate Swift → validate Swift.
>
> 117 tests, 98% coverage, injection-resistance suite included (string
> literal escaping in Swift is a real attack surface).

**Post 6:**

> try it in your browser, no install required:
>
> 👉 axint.ai
>
> the playground bundles the exact same compiler core you'd get from npm.
> every keystroke runs end-to-end in < 1ms.

**Post 7:**

> Apache 2.0. no CLA on the compiler. PRs welcome — especially if you've
> written non-trivial App Intents by hand.
>
> ⭐ github.com/agenticempire/axint

---

## 3 · LinkedIn

**Post:**

> We just open-sourced Axint — a compiler that turns TypeScript into native
> Apple App Intents.
>
> Why this matters: App Intents is the integration layer for Siri,
> Shortcuts, Spotlight, and Apple Intelligence. If you want an AI agent to
> show up on an iPhone, App Intents is how it gets there. But authoring one
> correctly in Swift is a lot of ceremony, and it's a pain for AI coding
> assistants to juggle that context reliably.
>
> Axint collapses the whole thing down to a single TypeScript function:
> `defineIntent({ name, title, params, perform })`. You get back idiomatic
> Swift that looks hand-written, not generated.
>
> The repo ships three things:
>
>   ▸ A CLI for developers
>   ▸ A library to embed in your own build tooling
>   ▸ An MCP server so Claude, Cursor, and Windsurf can author intents
>     directly
>
> Everything's browser-safe — there's a live playground at axint.ai that
> runs the exact compiler core in your browser with zero telemetry.
>
> v0.1, Apache 2.0, MIT-compatible. Built by Agentic Empire. If you ship
> Apple platform apps and want AI agents to integrate with them cleanly,
> we'd love your feedback.
>
> → Playground: axint.ai
> → Repo: github.com/agenticempire/axint
>
> #OpenSource #Apple #AppIntents #AIAgents #MCP #Swift #TypeScript

---

## 4 · Reddit — r/swift

**Title:**

> I open-sourced a TypeScript → Swift compiler for App Intents (with a
> browser playground)

**Body:**

> Hey r/swift — wrote this over the last few weeks and just put it on
> GitHub. Axint is a compiler that takes a TypeScript `defineIntent()` call
> and emits a native App Intent Swift file. 735 lines of pure TS, 117
> tests, Apache 2.0.
>
> The generated Swift is idiomatic — `@AppIntent`, `@Parameter` with
> descriptions, proper `perform()` signatures, docstring comments. It's
> meant to look like what a senior Apple engineer would write, because
> that's the bar for anything I'd check into my own codebase.
>
> Why do this? Two reasons:
>
>   1. Authoring App Intents by hand is repetitive enough to be annoying
>      but not enough to write your own codegen, so most people just copy
>      the last intent and tweak it.
>
>   2. I want AI coding assistants to be able to author App Intents
>      reliably. Ships with an MCP server so Claude Code / Cursor /
>      Windsurf can call the compiler directly.
>
> There's a live browser playground at axint.ai — it bundles the real
> compiler core, so what you see there is what the CLI would emit. Every
> keystroke runs sub-millisecond.
>
> Would love feedback from anyone here who's written App Intents in anger.
> Especially interested in where the generated Swift looks wrong, where
> you'd want custom entities/enums to be supported, and how you handle
> localization today.
>
> Repo: https://github.com/agenticempire/axint
> Playground: https://axint.ai
>
> Not trying to replace hand-written Swift for complex intents — just the
> 80% case where you want to add a new intent in under a minute.

---

## 5 · Reddit — r/LocalLLaMA

**Title:**

> Axint: open-source compiler that lets local LLMs author native Apple App
> Intents (with an MCP server)

**Body:**

> This is for anyone running Claude Code, Cursor, Windsurf, or their own
> agent loop on top of a local model and wanting to target Apple platforms.
>
> Axint is a compiler — TypeScript in, Swift App Intents out. It ships with
> an MCP server that exposes `axint_compile` and `axint_validate` as tools,
> so your agent can author App Intents directly instead of trying to
> reason about Swift syntax and App Intents boilerplate at the same time.
>
> The compiler is tiny (735 lines), pure TypeScript, no heavy deps. 117
> tests at 98% coverage, including an injection-resistance suite since
> Swift string literal escaping is a real attack surface when a model is
> writing the TS for you.
>
> Why this matters for local LLMs specifically: reducing the cognitive
> surface from "write correct Apple App Intents Swift" to "fill in a
> TypeScript object" moves the bar from ~70B to a range where small models
> can do it reliably.
>
> There's a browser playground at axint.ai — same compiler core, zero
> telemetry, so you can verify what the MCP server would emit before
> letting your agent loose on your codebase.
>
> Apache 2.0. Would love feedback, especially from anyone pointing an
> agent at App Intents today.
>
> MCP server: `npx -y axint-mcp` or bundled in `npm install -g axint`
> Repo: https://github.com/agenticempire/axint
> Playground: https://axint.ai

---

## Timing guide

| When | What | Where |
|---|---|---|
| T−0 | npm publish succeeds (version bump if needed) | CI |
| T+10m | Push v0.1.1 git tag again to re-trigger release | `git push origin v0.1.1` |
| T+20m | Verify `axint.ai` loads and playground compiles | Browser |
| T+30m | Show HN (Tue/Wed/Thu, 9am ET) | news.ycombinator.com/submit |
| T+35m | Twitter thread (pinned) | twitter.com |
| T+2h | LinkedIn post | linkedin.com |
| T+4h | Reply to HN comments — every single one, fast | |
| T+24h | Reddit r/swift + r/iOSProgramming | |
| T+48h | Reddit r/LocalLLaMA | |
| T+72h | Retrospective: stars, issues, PRs, traffic | |

## House rules while launching

- **Reply to every HN comment within 10 minutes** for the first 3 hours.
  HN conversion to front page is mostly determined by comment velocity.
- **Never lead with the playground URL on Reddit** — Reddit penalizes
  first-post-is-a-URL. Lead with the GitHub repo.
- **Don't crosspost mechanically** — rewrite the top paragraph for each
  subreddit audience. r/swift cares about generated Swift quality,
  r/LocalLLaMA cares about the MCP angle.
- **No engagement-bait copy.** No "we built this in 48 hours", no "this
  will change everything". HN and r/swift both smell that a mile away.
- **Disclose affiliation.** "Built by Agentic Empire" in every post.
