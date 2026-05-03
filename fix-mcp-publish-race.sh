#!/usr/bin/env bash
# fix-mcp-publish-race.sh
#
# 1. Re-runs the failed Publish MCP Registry workflow on tag v0.4.17.
#    PyPI propagation is now complete (the upload landed at 03:55Z, the
#    workflow ran at 03:58Z; mcp-publisher's own PyPI lookup hit a 404
#    against an endpoint that lagged behind). A re-run will see the
#    package and complete normally.
#
# 2. Ships a workflow hardening commit so this race can't happen again:
#    publish step now retries up to 8 times (≈ 8 min) when it sees a
#    propagation 404, only failing for real errors.

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
fi

if ! command -v gh >/dev/null 2>&1; then
  red "gh CLI required. Install with: brew install gh"
  exit 1
fi

# ── 1. Commit + push workflow hardening ──────────────────────────────
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  yellow "Switching to main"
  git checkout main
  git pull
fi

# Stash the local public-truth.json edit reminder noise — only stage the workflow.
if git diff --quiet -- .github/workflows/publish-mcp-registry.yml; then
  yellow "publish-mcp-registry.yml has no pending changes — already up to date."
else
  git add .github/workflows/publish-mcp-registry.yml
  git commit -m "Retry mcp-publisher on registry propagation 404s"
  green "committed publish retry hardening"
  git push origin main
  green "pushed → workflow file updated for next release"
fi

# ── 2. Re-run the failed workflow run ────────────────────────────────
bold "Finding the failed Publish MCP Registry run on tag v0.4.17…"
RUN_ID=$(gh run list --workflow "Publish MCP Registry" --limit 1 --json databaseId,conclusion --jq '.[0].databaseId')
if [ -z "$RUN_ID" ]; then
  red "Could not find the failed run via gh. Open the Actions tab manually:"
  red "  https://github.com/agenticempire/axint/actions"
  exit 1
fi

bold "Re-running run $RUN_ID (PyPI is now visible to mcp-publisher)…"
if gh run rerun "$RUN_ID" --failed; then
  green "Re-run kicked off"
  echo
  echo "  Watch progress: gh run watch $RUN_ID"
  echo "  Or in the UI:   https://github.com/agenticempire/axint/actions/runs/$RUN_ID"
else
  yellow "Re-run via gh failed. Do it in the UI:"
  echo "  https://github.com/agenticempire/axint/actions/runs/$RUN_ID"
  echo "  → 'Re-run failed jobs' (top right)"
fi

echo
bold "Done. After the re-run goes green, the MCP registry will have v0.4.17."
echo
echo "Verify the registry has the new version:"
echo "  curl -s https://registry.modelcontextprotocol.io/v0/servers | jq '.servers[] | select(.name == \"io.github.agenticempire/axint\") | .version'"
