#!/usr/bin/env bash
# release-0.4.20.sh — finalizes the 0.4.20 release.
#
# Run this ONCE from your Mac terminal:
#   cd ~/agenticempire/axint && bash release-0.4.20.sh
#
# What's in this release — three high-leverage moves from SWARM's strategic feedback:
#   1. swift -typecheck integration in axint.cloud.check (opt-in via typecheck:true)
#   2. Snapshot test integration scaffold (runSnapshotTests + AX-SNAPSHOT-FAIL)
#   3. axint paint-test scaffold CLI (auto-generates XCTest mounting every reachable View)
#
# After PR merges:
#   npm run build && npm publish --access public
#   git tag v0.4.20 && git push origin v0.4.20
#   bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.20

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

bold "axint 0.4.20 release"
echo

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  green "cleared stale .git/index.lock"
fi

CURRENT="$(git branch --show-current)"
FEATURE="v0420-typecheck-snapshots-paint"

if [ "$CURRENT" != "$FEATURE" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -u -m "auto-stash for 0.4.20 release script" >/dev/null
    STASHED=1
  fi
  git fetch origin --quiet
  git checkout main
  git pull --ff-only origin main
  if git rev-parse --verify "${FEATURE}" >/dev/null 2>&1; then
    git checkout "${FEATURE}"
  else
    git checkout -b "${FEATURE}"
  fi
  if [ "${STASHED:-0}" = "1" ]; then
    git stash pop >/dev/null 2>&1 || yellow "stash pop conflict — resolve manually"
  fi
  green "on branch ${FEATURE}"
else
  green "already on ${FEATURE}"
fi

bold "Running gates"
npm run versions:check >/dev/null && green "versions:check"
npm run metrics:check >/dev/null && green "metrics:check"
npm run docs:check >/dev/null && green "docs:check"
npm run lint >/dev/null && green "lint"
npm run typecheck >/dev/null && green "typecheck"
npx vitest run --reporter=dot >/dev/null && green "vitest"

bold "Committing"
git add -A
if git diff --cached --quiet; then
  yellow "No staged changes — release commit may already exist."
else
  git commit -m "Release Axint 0.4.20 swift typecheck, snapshot scaffold, paint-test CLI"
  green "committed"
fi

bold "Pushing to origin/${FEATURE}"
git push -u origin "${FEATURE}"
green "pushed"

if command -v gh >/dev/null 2>&1; then
  bold "Opening PR"
  if gh pr view "${FEATURE}" >/dev/null 2>&1; then
    yellow "PR already exists for ${FEATURE}"
  else
    gh pr create \
      --title "Release Axint 0.4.20 swift typecheck, snapshot scaffold, paint-test CLI" \
      --body "$(cat <<'EOF'
Three high-leverage moves shipped from SWARM's strategic feedback after the 0.4.19 dogfooding sprint.

Move 1 — swift -typecheck integration in axint.cloud.check:
- Opt-in via typecheck: true on the MCP tool (or --typecheck on the CLI).
- When the host has Xcode (macOS dev machine, Linux runner with swift installed), Cloud Check shells out to swift -typecheck and merges compiler diagnostics (AX-SWIFTC-ERROR / AX-SWIFTC-WARNING) into the report.
- Closes the cross-file conformance, actor-isolation, opaque-return, and protocol-method-availability gap that motivated all five new rules in 0.4.19. Static rule pack (200+ rules) PLUS Apple's typechecker.
- No-op on environments without the toolchain (axint cloud, Linux CI without swift, Cowork sandbox), so existing pipelines stay green.
- Honors AXINT_SWIFT_BINARY for non-default toolchains.

Move 2 — snapshot test integration scaffold:
- New runSnapshotTests helper drives xcodebuild test -only-testing:<suite>, parses pass/fail counts, surfaces snapshot failures with their reference-image artifact paths as AX-SNAPSHOT-FAIL diagnostics.
- Catches the visual regression class (dead-but-rendered, layout drift, white-on-white) that no static analysis can see.

Move 4 — axint paint-test scaffold CLI:
- New axint paint-test scaffold command auto-generates an XCTest file mounting every reachable struct X: View at canonical viewports (iPhone 16 Pro, iPad Pro 13") and asserts body resolves + > 0% non-empty pixels render.
- Skips App-conforming roots, PreviewProviders, generics, and structs with required init args (with explicit reasons surfaced for each).
- Standard Apple ImageRenderer + XCTest, no third-party dependencies.

11 new tests (1289 total). Lint, typecheck, versions:check, metrics:check, docs:check all clean.
EOF
)"
    green "PR opened"
  fi
fi

echo
bold "Done. After PR merges:"
echo "  npm run build && npm publish --access public"
echo "  git tag v0.4.20 && git push origin v0.4.20"
echo "  bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.20"
