#!/usr/bin/env bash
# recover-0419-missing-file.sh
#
# CI build failed because src/registry/search.ts was excluded by an
# unscoped `registry/` rule in .gitignore. The file exists locally but
# was never staged. This script:
#   1. Verifies the file exists and the gitignore fix is in place.
#   2. Adds .gitignore (with the anchored fix) and src/registry/search.ts
#      to the v0419 branch.
#   3. Commits + pushes so CI re-runs and goes green.
#
# Run from ~/agenticempire/axint:
#   bash recover-0419-missing-file.sh

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

[ -f .git/index.lock ] && rm -f .git/index.lock

if [ ! -f src/registry/search.ts ]; then
  red "src/registry/search.ts is missing locally — something deeper went wrong."
  exit 1
fi
green "src/registry/search.ts exists locally"

if ! grep -q "^/registry/" .gitignore; then
  red ".gitignore fix not applied — '/registry/' should be anchored. Aborting."
  exit 1
fi
green ".gitignore is anchored to root"

CURRENT="$(git branch --show-current)"
if [ "$CURRENT" != "v0419-coverage-rules" ]; then
  yellow "Switching to v0419-coverage-rules"
  git checkout v0419-coverage-rules
fi

bold "Force-adding the previously-ignored file + the gitignore fix"
git add .gitignore
git add -f src/registry/search.ts

if git diff --cached --quiet; then
  yellow "Nothing to commit — file is already staged."
else
  git commit -m "Anchor .gitignore registry/ rule and add missing src/registry/search.ts"
  green "committed"
fi

bold "Pushing to origin/v0419-coverage-rules"
git push origin v0419-coverage-rules
green "pushed — CI should re-run and go green"

echo
bold "Watch CI:"
echo "  gh pr checks   # or visit the PR in the GitHub UI"
echo
bold "After CI is green, squash-merge as planned:"
echo "  gh pr merge --squash --delete-branch"
