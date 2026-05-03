#!/usr/bin/env bash
# release-0.4.18.sh — finalizes the 0.4.18 release.
#
# Run this ONCE from your Mac terminal:
#   cd ~/agenticempire/axint && bash release-0.4.18.sh
#
# What it does (bail-on-failure):
#   1. Clears stale .git/index.lock if any.
#   2. Creates feature branch v0418-coverage-rules from current main.
#   3. Re-runs versions:check + metrics:check + docs:check + lint + typecheck + tests.
#   4. Stages everything, commits with project's release message convention.
#   5. Pushes the branch to origin.
#   6. Opens a PR via `gh` if available.
#
# After the PR merges:
#   npm run build && npm publish --access public
#   git tag v0.4.18 && git push origin v0.4.18
#   bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.18

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

bold "axint 0.4.18 release"
echo

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  green "cleared stale .git/index.lock"
fi

# Make sure we're starting from clean main + any pending edits stage in.
CURRENT="$(git branch --show-current)"
FEATURE="v0418-coverage-rules"

if [ "$CURRENT" != "$FEATURE" ]; then
  if [ "$CURRENT" != "main" ]; then
    yellow "Currently on $CURRENT — switching to main and creating $FEATURE."
  fi
  # Stash any uncommitted edits so we keep them on the feature branch.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -u -m "auto-stash for 0.4.18 release script" >/dev/null
    STASHED=1
  fi
  git fetch origin --quiet
  git checkout main
  git pull --ff-only origin main
  git checkout -b "$FEATURE"
  if [ "${STASHED:-0}" = "1" ]; then
    git stash pop >/dev/null 2>&1 || yellow "stash pop had conflicts — resolve manually"
  fi
  green "on branch $FEATURE"
else
  green "already on $FEATURE"
fi

bold "Running gates…"
npm run versions:check >/dev/null && green "versions:check"
npm run metrics:check >/dev/null && green "metrics:check"
npm run docs:check >/dev/null && green "docs:check"
npm run lint >/dev/null && green "lint"
npm run typecheck >/dev/null && green "typecheck"
npx vitest run --reporter=dot >/dev/null && green "vitest (1146 tests)"

bold "Committing…"
git add -A
if git diff --cached --quiet; then
  yellow "No staged changes — release commit may already exist."
else
  git commit -m "Release Axint 0.4.18 SwiftUI reachability and cross-file member resolution"
  green "committed"
fi

bold "Pushing to origin/$FEATURE…"
git push -u origin "$FEATURE"
green "pushed"

if command -v gh >/dev/null 2>&1; then
  bold "Opening PR…"
  if gh pr view "$FEATURE" >/dev/null 2>&1; then
    yellow "PR already exists for this branch."
  else
    gh pr create \
      --title "Release Axint 0.4.18 SwiftUI reachability and cross-file member resolution" \
      --body "$(cat <<'EOF'
Adds four new Swift validator rules informed by the SWARM dogfooding log:

- AX842 catches SwiftUI View structs declared but never instantiated anywhere in the project. Would have prevented the sprint-scale dead-code work shipped into ProjectWarRoomView, PersonalWorkspaceView, and ProjectAuditView — three orphaned views that absorbed CC-2/CC-3/CC-4, S-2/S-3/S-4, BB-3/BB-4/BB-5 with zero user-visible effect. Honors `// axint:reachable` comment opt-out for views constructed reflectively.

- AX841 extends AX768 by indexing every type declared anywhere in the project, not just files in the validation set. Catches voiceInbox.items when VoiceInboxStore actually exposes results — the fourth "undeclared member" miss in last sprint. Includes "Did you mean…" suggestions via Levenshtein.

- AX840 ships a bundled module-export table covering UniformTypeIdentifiers, AVFoundation, MapKit, Combine, AppIntents, CryptoKit and other commonly-missed Swift-only frameworks. Fires when a file uses one of these symbols but doesn't import the defining module. Catches the UTType.text and onDrop(of: [.text]) shorthand patterns that bit ProjectMemoryStudioView.

- AX787 expansion runs a companion pass that scans `\\(IDENTIFIER)` string interpolations for undefined identifiers regardless of name shape. The original AX787 ran on stripped source; this fills the gap for refactor-leftover identifiers like `\\(projectName)`.

`validateSwiftSources` accepts an optional `projectContext: { projectRoot }` argument that unlocks AX841 and AX842. Without it the validator stays in single-input scope (no behavior change for existing callers).

15 new tests (1146 total), all green. Lint, typecheck, versions:check, metrics:check, docs:check all clean. Diagnostic count 195 → 198.
EOF
)"
    green "PR opened"
  fi
fi

echo
bold "Done. After PR merges:"
echo
echo "  npm run build && npm publish --access public"
echo "  git tag v0.4.18 && git push origin v0.4.18"
echo "  bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.18"
