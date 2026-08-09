# Axint A2A

Axint exposes its Apple proof and repair loop as an A2A agent. An orchestrator
can delegate a complete check or Xcode proof, observe task progress, cancel the
underlying work, reconnect later, and retrieve compact result artifacts.

Use MCP when a host needs individual Axint tools inside one agent session. Use
A2A when one agent or workflow engine needs to delegate a durable job to Axint.
Both transports call the same check, repair, run, and proof services.

## Start locally

```bash
npx -y -p @axint/compiler axint-a2a --project-root /path/to/MyApp
```

The default server listens on `127.0.0.1:41242` and advertises:

- Agent Card: `http://127.0.0.1:41242/.well-known/agent-card.json`
- JSON-RPC endpoint: `http://127.0.0.1:41242/a2a`
- Health check: `http://127.0.0.1:41242/healthz`

Loopback is unauthenticated unless tokens are configured. For shared or remote
access, configure one or more named bearer tokens:

```bash
export AXINT_A2A_SECRET="$(openssl rand -hex 32)"
export AXINT_A2A_TOKENS="local=$AXINT_A2A_SECRET"
axint-a2a \
  --host 0.0.0.0 \
  --public-url https://proof.example.com \
  --project-root /srv/apple-projects
```

Terminate TLS at a trusted reverse proxy and forward only the A2A endpoint,
Agent Card, and health route. Axint refuses unauthenticated non-loopback access
unless the operator passes `--allow-unauthenticated` explicitly.

## Skills

| Skill                    | Result                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `check_apple_code`       | Compiler-grounded static findings, confidence, coverage, and the evidence still needed.               |
| `diagnose_apple_failure` | Ranked hypotheses for build, test, runtime, interaction, and Apple-platform failures.                 |
| `prove_apple_project`    | Local Xcode build/test evidence and a signed, source-free proof receipt.                              |
| `plan_apple_repair`      | Likely causes, files to inspect, evidence to collect, and an exact proof plan without source changes. |

All four skills complete with a domain verdict of `pass`, `needs_review`, or
`fail`. A failed Xcode build is a valid completed A2A task with a `fail` result;
the A2A task itself enters `failed` only when Axint cannot execute the request.

## Request contract

Structured data is preferred:

```json
{
  "schema": "https://axint.ai/schemas/a2a-request.v1.json",
  "skill": "prove_apple_project",
  "input": {
    "projectPath": ".",
    "scheme": "MyApp",
    "platform": "iOS",
    "timeoutSeconds": 900
  }
}
```

Send the object as an A2A message data part with media type
`application/vnd.axint.a2a-request+json`. Axint also accepts a JSON object in a
text part and four compact local commands: `check <path>`, `diagnose <issue>`,
`prove <path>`, and `repair <issue>`.

Common input fields:

| Field                                                                        | Meaning                                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `projectPath`                                                                | Project directory beneath the configured project root.                                         |
| `sourcePath`                                                                 | Existing source file beneath the selected project directory.                                   |
| `source` / `fileName`                                                        | Optional inline source and its display name. Inline source is never persisted in task history. |
| `issue`                                                                      | Failure or repair objective.                                                                   |
| `xcodeBuildLog`, `testFailure`, `runtimeFailure`                             | Bounded evidence consumed for diagnosis and omitted from durable task history.                 |
| `workspace`, `project`, `scheme`, `destination`, `configuration`, `testPlan` | Xcode selection controls. Paths remain confined to the project directory.                      |
| `skipBuild`, `skipTests`, `runtime`, `timeoutSeconds`                        | Proof execution controls. Automatic fixes are intentionally unavailable over A2A.              |

Input and evidence sizes are bounded. Paths are resolved through the local file
system and must stay within `--project-root`, including after symbolic-link
resolution. Repository URLs, outbound delegation, automatic source edits, and
push-notification webhooks are not part of this initial server surface.

## Results and task lifecycle

The result artifact contains both structured JSON and Markdown. It excludes
input source, raw command logs, and absolute local paths. The signed proof
receipt preserves command outcomes, evidence steps, environment facts, hashes,
and diagnostics under the same source-free receipt contract used by the CLI.

Full local proof reports, `.xcresult` bundles, and command logs remain beneath
the operator-controlled A2A state directory so failures can be investigated.
Those local files can contain absolute project paths and command output; they
are not embedded in task history or sent in the A2A result artifact.

Task states follow the protocol lifecycle:

```text
submitted -> working -> completed
                     -> failed
                     -> canceled
submitted -> input-required
submitted -> rejected
```

Long-running proof calls support streaming updates and protocol cancellation.
Cancellation propagates through Axint's proof runner to the active Xcode child
process group. Durable task JSON lives under `~/.axint/a2a` by default, scoped
by both tenant and authenticated token identity. Original input content is not
written into task history.

## Platform boundary

Static checking and repair planning can run wherever the JavaScript package and
the relevant Swift toolchain run. Xcode build, simulator, test, `.xcresult`, and
runtime proof still require macOS with Xcode. A Linux or Windows orchestrator
can call an Axint A2A server running on a Mac; this transport does not emulate
Apple's toolchain on a non-Apple host.

## Production checklist

1. Run behind HTTPS and do not publish the plain HTTP port directly.
2. Set unique, randomly generated bearer tokens for each caller or trust domain.
3. Set `--project-root` to the smallest directory the server needs.
4. Keep the state directory on encrypted storage with operator-only permissions.
5. Rotate tokens by adding the replacement, moving callers, then removing the old token.
6. Apply reverse-proxy request, connection, and concurrency limits in addition to Axint's per-IP rate limit.
7. Monitor `/healthz`, process exits, disk use, and Xcode runner capacity without logging authorization headers or request bodies.
