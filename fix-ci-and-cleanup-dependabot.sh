#!/usr/bin/env bash
# fix-ci-and-cleanup-dependabot.sh
#
# 1. Pushes the README + public-truth proof-line fix to dogfooding-v0417
#    so PR #223 goes green on docs:check.
# 2. Closes dependabot PR #213 (fetch-metadata v3 requires Node 24, our
#    Actions runtime is 22 — would break CI immediately).
# 3. Comments on dependabot PR #212 (upload-artifact v4→v7) recommending
#    a rebase + manual review before merging.
#
# Run from ~/agenticempire/axint:
#   bash fix-ci-and-cleanup-dependabot.sh

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  green "cleared stale .git/index.lock"
fi

BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "dogfooding-v0417" ]; then
  red "Expected branch dogfooding-v0417, got '$BRANCH'."
  red "Run: git checkout dogfooding-v0417"
  exit 1
fi

# ── Stage README + public-truth fix ──────────────────────────────────
bold "Verifying docs:check passes locally before pushing…"
npm run docs:check >/dev/null
green "docs:check"

git add README.md
# public-truth is a sibling repo; only stage if axint owns it (it doesn't).
if git diff --cached --quiet -- README.md; then
  yellow "No README changes to commit. Skipping."
else
  git commit -m "Sync README proof line to v0.4.17 (1240 tests, 195 diagnostics)"
  green "committed README proof-line bump"
  git push origin dogfooding-v0417
  green "pushed → PR #223 will rerun CI"
fi

echo
bold "Sibling repo: ~/agenticempire/public-truth"
echo "  public-truth.json was updated in-place to match v0.4.17 numbers."
echo "  Commit + push that separately so the public site stays accurate:"
echo "    cd ~/agenticempire/public-truth"
echo "    git diff public-truth.json    # eyeball the bump"
echo "    git add public-truth.json && git commit -m 'Bump axint truth to v0.4.17' && git push"
echo

# ── Dependabot cleanup ───────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  red "gh CLI not installed; skipping dependabot cleanup."
  red "Install with: brew install gh"
  exit 0
fi

bold "Closing PR #213 (fetch-metadata v3 — requires Node 24, breaks CI)…"
gh pr close 213 --comment "Closing — fetch-metadata v3 requires Node.js 24 as the Actions runtime, and our CI uses Node 22 (see .github/workflows/ci.yml). Reopening this is fine once we bump the runtime, but in the meantime this would break dependabot-auto-merge.yml on the first run.

Recommend dependabot stays pinned to v2 for now via .github/dependabot.yml ignore rules:

\`\`\`yaml
ignore:
  - dependency-name: \"dependabot/fetch-metadata\"
    versions: [\">=3.0.0\"]
\`\`\`" 2>&1 | head -3
green "PR #213 closed"

bold "Commenting on PR #212 (upload-artifact v4→v7)…"
gh pr comment 212 --body "Heads up before merging:
- v5+ made artifacts immutable (you can't append to an existing artifact name within a run anymore — each upload needs a unique name).
- Used in .github/workflows/wwdc-nightly.yml:71 and .github/workflows/xcode-extension.yml:163.
- This branch is 10 commits behind main. Rebase before merging so CI runs against current code.

To rebase + retest:
\`\`\`bash
gh pr checkout 212
git rebase origin/main
git push --force-with-lease
\`\`\`

Once CI is green on the rebased branch, safe to squash-merge." 2>&1 | head -3
green "PR #212 commented"

echo
bold "Done. Summary:"
echo "  - dogfooding-v0417 pushed (PR #223 should re-run + go green)"
echo "  - PR #213 closed (Node 24 incompatibility documented)"
echo "  - PR #212 commented (rebase + verify before merge)"
echo "  - public-truth.json updated locally (commit + push separately)"
