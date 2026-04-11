# Axint Registry

The backend for `registry.axint.ai` — a Cloudflare Workers service that powers `axint login`, `axint publish`, and `axint add`.

## Architecture

- **D1** — SQLite database for package metadata, users, and auth tokens
- **R2** — Object storage for package source bundles
- **GitHub OAuth** — Device-code flow for CLI authentication

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/device-code` | Start device-code login flow |
| POST | `/api/v1/auth/token` | Poll for auth token |
| GET | `/api/v1/auth/callback` | GitHub OAuth callback |
| POST | `/api/v1/publish` | Publish an intent package |
| GET | `/api/v1/install` | Download a package |
| GET | `/api/v1/search` | Search packages |
| GET | `/api/v1/packages/:ns/:slug` | Package detail |
| GET | `/api/v1/health` | Health check |

## Setup

```bash
# Create D1 database
wrangler d1 create axint-registry

# Create R2 bucket
wrangler r2 bucket create axint-packages

# Update wrangler.toml with the database_id from step 1

# Run migrations
npm run db:migrate

# Set GitHub OAuth secrets
wrangler secret put GITHUB_CLIENT_SECRET

# Deploy
npm run deploy
```

## Local dev

```bash
npm install
npm run dev
```
