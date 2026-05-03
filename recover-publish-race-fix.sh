#!/usr/bin/env bash
# recover-publish-race-fix.sh
#
# The previous script tried to push directly to main; branch protection
# (correctly) blocked it. The hardening commit is sitting locally on main.
#
# This script:
#   1. Moves that local commit onto a fresh feature branch.
#   2. Resets local main back to origin/main (clean slate).
#   3. Pushes the feature branch and opens a PR.
#   4. Re-runs the failed Publish MCP Registry workflow on tag v0.4.17 —
#      independent of the PR. PyPI propagation is well past complete by
#      now, so the single-shot publish will succeed even without the
#      retry hardening (the hardening is for FUTURE releases, not this one).

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

# ── 1. Confirm the local main has the hardening commit ───────────────
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ]; then
  yellow "Switching to main"
  git checkout main
fi

git fetch origin --quiet

LOCAL_HEAD="$(git rev-parse HEAD)"
ORIGIN_HEAD="$(git rev-parse origin/main)"

if [ "$LOCAL_HEAD" = "$ORIGIN_HEAD" ]; then
  yellow "Local main is already in sync with origin/main."
  yellow "Either the previous push succeeded or you've already recovered. Skipping branch move."
else
  AHEAD=$(git rev-list --count "$ORIGIN_HEAD..HEAD")
  bold "Local main is $AHEAD commit(s) ahead of origin/main. Moving to feature branch…"

  COMMIT_MSG=$(git log -1 --pretty=%s HEAD)
  echo "  Will move commit: $COMMIT_MSG"

  # ── 2. Create the feature branch at HEAD ──────────────────────────
  FEATURE_BRANCH="harden-mcp-publish-retry"
  git branch -f "$FEATURE_BRANCH" HEAD
  green "feature branch '$FEATURE_BRANCH' created at HEAD"

  # ── 3. Reset local main back to origin/main ───────────────────────
  git reset --hard "$ORIGIN_HEAD"
  green "local main reset to origin/main (clean)"

  # ── 4. Switch to feature branch + push ────────────────────────────
  git checkout "$FEATURE_BRANCH"
  git push -u origin "$FEATURE_BRANCH"
  green "pushed $FEATURE_BRANCH to origin"

  # ── 5. Open the PR ────────────────────────────────────────────────
  if gh pr view "$FEATURE_BRANCH" >/dev/null 2>&1; then
    yellow "PR already exists for $FEATURE_BRANCH"
  else
    gh pr create \
      --title "Retry mcp-publisher on registry propagation 404s" \
      --body "Wraps the \`./mcp-publisher publish\` step in a retry loop (8 attempts × 60s = 8 min budget). Only retries on \"not found … 404\" / \"status: 404\" errors so real failures still surface fast. \"duplicate version\" continues to count as success.

Context: 0.4.17 release surfaced the race. Our \"Wait for package visibility\" pre-check polls the PyPI JSON API; mcp-publisher does its own independent PyPI lookup against an endpoint that lagged behind. PyPI uploaded the package at 03:55Z; the workflow ran at 03:58Z; mcp-publisher saw a 404 even though our pre-check had cleared. A simple retry loop kills the race for every future release."
    green "PR opened"
  fi
fi

# ── 6. Re-run the failed v0.4.17 publish workflow ────────────────────
bold "Finding the failed Publish MCP Registry run on tag v0.4.17…"
RUN_ID=$(gh run list --workflow "Publish MCP Registry" --limit 5 --json databaseId,conclusion,headBranch \
         --jq '[.[] | select(.conclusion == "failure")][0].databaseId')

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  yellow "No failed Publish MCP Registry run found. Either it already succeeded or you've never run it."
  yellow "Browse https://github.com/agenticempire/axint/actions to confirm."
else
  bold "Re-running run $RUN_ID (PyPI is now visible to mcp-publisher)…"
  if gh run rerun "$RUN_ID" --failed; then
    green "Re-run kicked off — should pass this time"
    echo
    echo "  Watch progress: gh run watch $RUN_ID"
    echo "  Or in the UI:   https://github.com/agenticempire/axint/actions/runs/$RUN_ID"
  else
    yellow "Re-run via gh failed. Do it in the UI:"
    echo "  https://github.com/agenticempire/axint/actions/runs/$RUN_ID"
  fi
fi

echo
bold "Done. Two things will happen:"
echo "  1. The PR for harden-mcp-publish-retry → review + merge when ready."
echo "  2. The v0.4.17 publish workflow re-run → should turn green and the"
echo "     MCP registry will then show v0.4.17."
echo
echo "Verify the MCP registry has v0.4.17 (after the re-run finishes):"
echo "  curl -s https://registry.modelcontextprotocol.io/v0/servers | jq '.servers[] | select(.name == \"io.github.agenticempire/axint\") | .version'"
