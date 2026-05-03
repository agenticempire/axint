#!/usr/bin/env bash
# fix-main-and-harden-publish.sh
#
# 1. Re-runs the failed Publish MCP Registry workflow on commit 1652f75
#    so main goes from 6/7 (X) to 7/7 (✓). 0.4.16 IS now on npm, so the
#    visibility check will pass this time.
# 2. Ships the workflow trigger fix to dogfooding-v0417 (or main, your call).
#    The fix changes the trigger from "push to main on server.json" to
#    "push of a v* tag", matching release.yml's pattern. This kills the
#    race for 0.4.17 and every release after.
#
# Run from ~/agenticempire/axint:
#   bash fix-main-and-harden-publish.sh

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

# ── 1. Commit + push the workflow fix ─────────────────────────────────
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "dogfooding-v0417" ]; then
  yellow "Switching to dogfooding-v0417 (fix rides with the 0.4.17 release)"
  git checkout dogfooding-v0417
fi

if git diff --quiet -- .github/workflows/publish-mcp-registry.yml; then
  yellow "publish-mcp-registry.yml has no pending changes — already shipped or unchanged."
else
  git add .github/workflows/publish-mcp-registry.yml
  git commit -m "Trigger Publish MCP Registry on tag push instead of server.json change"
  green "committed workflow trigger fix"
  git push origin dogfooding-v0417
  green "pushed → PR #223 picks up the fix"
fi

# ── 2. Re-run the historical failure on main ──────────────────────────
bold "Re-running the failed Publish MCP Registry run on main…"
echo
echo "  Run ID: 25153038634 (commit 1652f75 — Reduce agent token overhead #222)"
echo "  Now that @axint/compiler@0.4.16 is on npm, the visibility check will pass."
echo

gh run rerun 25153038634 --failed 2>&1 | head -5 || \
  yellow "Re-run via gh failed (may need different permissions). Manual fallback below."

echo
yellow "If gh re-run didn't work, do it in the UI:"
echo "  https://github.com/agenticempire/axint/actions/runs/25153038634"
echo "  → 'Re-run failed jobs' (top right)"
echo

bold "Done."
echo
echo "After PR #223 merges and you tag + push v0.4.17:"
echo "  git tag v0.4.17 && git push origin v0.4.17"
echo
echo "The Publish MCP Registry workflow will trigger on the tag push (not"
echo "the server.json change), which means npm publish will already have"
echo "completed by the time the visibility check runs. No more race."
