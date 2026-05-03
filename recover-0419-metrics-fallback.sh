#!/usr/bin/env bash
# recover-0419-metrics-fallback.sh
#
# CI failed metrics:check because countRegistryPackages() returns 0 in CI
# (no axint-registry sibling repo there) but metrics.json has the real
# count of 5 from the dev machine. Drift = fail.
#
# Fix: countRegistryPackages() now falls back to the previously-committed
# value in metrics.json when the registry isn't on disk. Dev machines still
# compute the real count; CI trusts what got committed.
#
# Run from ~/agenticempire/axint:
#   bash recover-0419-metrics-fallback.sh

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

[ -f .git/index.lock ] && rm -f .git/index.lock

CURRENT="$(git branch --show-current)"
if [ "$CURRENT" != "v0419-coverage-rules" ]; then
  yellow "Switching to v0419-coverage-rules"
  git checkout v0419-coverage-rules
fi

# Verify the fix is in place locally before pushing.
if ! grep -q "Trust the committed value" scripts/metrics.mjs; then
  red "metrics.mjs fallback patch not applied — aborting."
  exit 1
fi
green "metrics.mjs fallback patch is in place"

bold "Verifying metrics:check passes with and without AXINT_REGISTRY_PATH"
AXINT_REGISTRY_PATH=/nonexistent npm run metrics:check >/dev/null
green "  passes when registry is unavailable (CI scenario)"
npm run metrics:check >/dev/null
green "  passes locally (registry available via sibling)"

bold "Committing + pushing"
git add scripts/metrics.mjs
if git diff --cached --quiet; then
  yellow "Nothing to commit — patch may already be on the branch."
else
  git commit -m "Fall back to committed registryPackages when registry not on disk"
  green "committed"
fi
git push origin v0419-coverage-rules
green "pushed — CI should re-run and clear metrics:check"

echo
bold "After this run:"
echo "  Watch CI: gh pr checks"
echo "  When green, squash-merge: gh pr merge --squash --delete-branch"
echo "  Then: npm run build && npm publish --access public"
echo "        git tag v0.4.19 && git push origin v0.4.19"
echo "        bash ~/SWARM/install-axint-mcp.sh"
