# Xcode 26.3 Predictive Code Completion — integration surface

*Research spike · April 2026*

## Question

Can Axint plug into Xcode 26.3's new agentic / predictive code completion
pipeline, and if so, how? What APIs does Apple actually expose to third
parties?

## Finding: three distinct surfaces, only one is open to us

Xcode 26.3 ships three overlapping features that get lumped together as
"AI in Xcode." They're architecturally different and have different
extension stories.

### 1. Predictive Code Completion (inline ghost-text)

The on-device Swift-tuned model that suggests the next few tokens as
you type. Powered by Apple silicon, shipped inside Xcode, trained on
Swift and Apple SDKs.

**Extension story: closed.** There is no public API to register a
competing completion engine, pipe suggestions through a custom model,
or influence the ranking. The model is bundled with Xcode and runs on
the user's GPU.

Implication for Axint: we cannot replace or augment inline completions
directly. Anything we do here has to ride on a different surface.

### 2. Coding Assistant — Chat Completions providers

The right-side chat panel that talks to a model provider. Xcode ships
with Claude and ChatGPT built in, and users can add custom providers
via `Settings → Intelligence → Add a Model Provider`.

**Registration:** URL (Chat Completions compatible) + API key. Xcode
speaks the OpenAI chat completions shape. For Anthropic's real endpoint
the workaround is:

```
defaults write com.apple.dt.Xcode IDEChatClaudeAgentAPIKeyOverride ' '
```

**Tool registration:** the provider can return OpenAI tool calls, and
those tools are executed by Xcode's MCP bridge (see #3). A custom
provider cannot register *new* tools — it can only call the tools
mcpbridge already exposes.

Implication for Axint: we could technically ship an Axint-flavored
proxy that translates Xcode's chat completions request into our own
compiler-aware agent, but this path is a dead-end for us — it forces us
to reimplement general-purpose chat, and we lose access to the user's
primary model (Claude, GPT-5). Not worth it.

### 3. MCP via `xcrun mcpbridge`

The most interesting surface. Xcode's intelligence panel has an "Enable
Model Context Protocol" toggle. When on, `xcrun mcpbridge` translates
between stdio MCP and Xcode's internal XPC layer, exposing 20 tools:

| Category | Tools |
|---|---|
| **File ops** (9) | XcodeRead, XcodeWrite, XcodeUpdate, XcodeGlob, XcodeGrep, XcodeLS, XcodeMakeDir, XcodeRM, XcodeMV |
| **Build & test** (5) | BuildProject, GetBuildLog, RunAllTests, RunSomeTests, GetTestList |
| **Diagnostics** (2) | XcodeListNavigatorIssues, XcodeRefreshCodeIssuesInFile |
| **Other** (4) | ExecuteSnippet, RenderPreview, DocumentationSearch, XcodeListWindows |

The flow is:

```
External agent (Claude Code, Codex, Cursor)
    ↕ stdio MCP
xcrun mcpbridge
    ↕ XPC
Xcode
```

**Crucially, mcpbridge is one-way: external agent → Xcode.** There is
no public hook for registering *additional* tools into Xcode's MCP
surface. Apple controls that list. We cannot expose `axint compile` or
`axint validate` as a tool Xcode's coding assistant can call directly.

### 4. Source Editor Extensions

Unchanged from Xcode 14. Still the same sandboxed `NSExtension` with
`XCSourceEditorCommand` entries. Can't talk to mcpbridge, can't touch
XPC, can't read from the filesystem outside the current buffer. Axint
already ships one of these (PR #81).

## Recommendation

The leverage point isn't Xcode — it's the *agent*.

Users of Xcode 26.3 have two independent MCP connections in their
Claude Code / Codex config:

1. `xcode` — via `xcrun mcpbridge` (file ops, build, test, diagnostics)
2. `axint` — via `axint-mcp` (compile, validate, fix, eject)

Claude Code stitches them together. When the agent wants to fix a
Swift 6 concurrency error, it:

1. Reads the file via `XcodeRead` (mcpbridge)
2. Runs `axint validate-swift` via our MCP server
3. Applies a fix with `axint xcode fix` (our tool)
4. Writes it back via `XcodeWrite` (mcpbridge)
5. Rebuilds via `BuildProject` (mcpbridge)

We don't need to be *inside* Xcode. We need to be **adjacent to the
agent** alongside mcpbridge. Our MCP server already does this — the
work is making sure its tool descriptions make the composition obvious
to the agent.

## Concrete next steps

1. **Ship an `axint xcode mcp-install` command** that writes both
   entries to the user's Claude Code / Codex config at once:

   ```json
   {
     "mcpServers": {
       "xcode":  { "command": "xcrun",      "args": ["mcpbridge"] },
       "axint":  { "command": "axint-mcp", "args": [] }
     }
   }
   ```

2. **Tune Axint MCP tool descriptions** so Claude naturally chains them
   after `XcodeRead`. Current descriptions assume Axint is the only
   MCP in the room — fix that.

3. **Add a doctor check** that detects Xcode 26.3+, checks the
   Intelligence → MCP toggle state (via `defaults read
   com.apple.dt.Xcode`), and recommends enabling it if off.

4. **Skip the Coding Assistant provider path entirely.** It's a trap:
   the proxy work is large, we become responsible for general chat,
   and we compete with the frontier model the user actually wants.

5. **Do not invest further in the Source Editor Extension beyond what
   ships in PR #81.** It's a legacy surface Apple hasn't touched since
   Xcode 14 and the sandbox rules prevent it from being useful for
   compile/validate work.

## Open questions

- Does `xcrun mcpbridge` accept additional tool registrations via a
  plist or env var that Apple didn't advertise? The source isn't
  public. Worth a 30-min `strings` / `otool` dig before we write this
  off completely.
- Does the Coding Assistant's built-in Claude/Codex adapter allow
  auto-discovering user-registered MCP servers and passing those tools
  through? Unclear from the docs. If yes, requirement (1) becomes
  cheaper.
- What's the latency hit on the current predictive completion model?
  If it's bad, a Swift-specialized server-side model could beat it —
  but that's a product question, not a 26.3 integration question.

## Time spent

~90 minutes. No code written this spike — the finding is that the
integration doesn't require new Axint code, it requires different
docs and a config-file installer.
