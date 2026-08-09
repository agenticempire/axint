# Security Policy

## Supported Versions

Axint supports the current minor release line and reserves the previous minor
line for critical security fixes. Older minor lines are unsupported.

| Version           | Support policy      |
| ----------------- | ------------------- |
| 0.6.x             | Full support        |
| 0.5.x             | Critical fixes only |
| 0.4.x and earlier | Unsupported         |

## Reporting a Vulnerability

Please do not open a public issue for a security vulnerability. Instead, email **security@axint.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and provide a timeline for patching.

## Security Best Practices

When using Axint in production:

1. Keep Axint updated to the latest patch version
2. Validate all untrusted agent definitions before compilation
3. Review generated App Intent code before deployment
4. Use code signing for all compiled artifacts

## Privacy-Safe Telemetry and Feedback

Axint includes source-free adoption telemetry and source-free feedback packets so repeated Apple failure modes can be fixed without collecting user projects.

These paths do not send source code, prompts, generated Swift bodies, file names, file paths, credentials, local machine identifiers, or secrets. Users can inspect and disable them with:

```bash
axint telemetry status
axint telemetry opt-out
axint feedback status
axint feedback opt-out
```

Environment controls are also supported: `AXINT_TELEMETRY=off`, `AXINT_DISABLE_TELEMETRY=1`, `AXINT_FEEDBACK=off`, and `AXINT_DISABLE_FEEDBACK=1`.

## A2A deployment security

The packaged A2A server binds to loopback by default. Non-loopback deployments
must configure named bearer tokens through `AXINT_A2A_TOKENS` unless the
operator explicitly overrides the guard. Production deployments should use a
TLS reverse proxy, unique tokens per caller, the narrowest possible
`--project-root`, and encrypted operator-only storage for A2A state.

A2A project and source paths are confined to the configured root after
symbolic-link resolution. Request bodies, inline source, failure evidence, raw
logs, authorization headers, and absolute paths are not persisted in task
history or returned in result artifacts. Full proof logs remain only in the
operator-controlled A2A state directory and can contain paths and command
output. Durable tasks are scoped by both tenant and authenticated token
identity. See [docs/A2A.md](docs/A2A.md) for the full operation and
threat-boundary checklist.

## Dependency and audit policy

- Dependabot version updates are configured in `.github/dependabot.yml` for npm,
  Python, and GitHub Actions on a grouped weekly cadence.
- CI treats `npm audit --audit-level=moderate` as a real gate on the TypeScript
  compiler job. Security issues should not be silently ignored in the default path.
- Python CI installs every supported optional surface into an isolated
  environment and runs `pip-audit`; release CI repeats the audit before building
  and validating the wheel and source distribution.
- The hosted MCP Worker runs its own npm audit, type check, dry-run bundle, and
  post-deploy protocol verification. Release CI also requires the hosted
  runtime to report the package version being published.
- The npm package manifest is checked before publication for required
  executables and declarations, including A2A, unexpected development files, sensitive file
  patterns, and accidental size growth.
- If an advisory must be temporarily tolerated, document the rationale in a
  visible pull request or follow-up issue instead of masking the audit step.
