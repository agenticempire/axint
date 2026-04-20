# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 0.3.x   | Yes                    |
| 0.2.x   | Security fixes only    |
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

## Dependency and audit policy

- Dependabot version updates are configured in `.github/dependabot.yml` for npm,
  Python, and GitHub Actions on a grouped weekly cadence.
- CI treats `npm audit --audit-level=moderate` as a real gate on the TypeScript
  compiler job. Security issues should not be silently ignored in the default path.
- If an advisory must be temporarily tolerated, document the rationale in a
  visible pull request or follow-up issue instead of masking the audit step.
