# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 0.4.x   | Yes                    |
| 0.3.x   | Critical fixes only    |
| 0.2.x   | No (deprecated)        |
| 0.1.x   | No (deprecated)        |

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

## Dependency and audit policy

- Dependabot version updates are configured in `.github/dependabot.yml` for npm,
  Python, and GitHub Actions on a grouped weekly cadence.
- CI treats `npm audit --audit-level=moderate` as a real gate on the TypeScript
  compiler job. Security issues should not be silently ignored in the default path.
- If an advisory must be temporarily tolerated, document the rationale in a
  visible pull request or follow-up issue instead of masking the audit step.
