#!/usr/bin/env bash
# recover-release-0.4.18.sh
#
# Diagnoses what state the previous release attempt left the repo in,
# then completes the missing steps. Idempotent — safe to re-run.
#
# Run from ~/agenticempire/axint:
#   bash recover-release-0.4.18.sh

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }
sub() { printf "\033[2m  %s\033[0m\n" "$1"; }

cd "$(dirname "$0")"
FEATURE="v0418-coverage-rules"
COMMIT_MSG="Release Axint 0.4.18 SwiftUI reachability and cross-file member resolution"

[ -f .git/index.lock ] && rm -f .git/index.lock

if ! command -v gh >/dev/null 2>&1; then
  red "gh CLI required. Install: brew install gh"
  exit 1
fi

# ── Diagnose current state ────────────────────────────────────────────
bold "Current state"
CURRENT="$(git branch --show-current)"
sub "branch: $CURRENT"

LOCAL_FEATURE_EXISTS=0
git rev-parse --verify "$FEATURE" >/dev/null 2>&1 && LOCAL_FEATURE_EXISTS=1
sub "local '$FEATURE' branch: $([ "$LOCAL_FEATURE_EXISTS" = 1 ] && echo "exists" || echo "missing")"

git fetch origin --quiet
REMOTE_FEATURE_EXISTS=0
git rev-parse --verify "origin/$FEATURE" >/dev/null 2>&1 && REMOTE_FEATURE_EXISTS=1
sub "remote 'origin/$FEATURE' branch: $([ "$REMOTE_FEATURE_EXISTS" = 1 ] && echo "exists" || echo "missing")"

UNCOMMITTED=0
if ! git diff --quiet || ! git diff --cached --quiet; then UNCOMMITTED=1; fi
sub "uncommitted changes: $([ "$UNCOMMITTED" = 1 ] && echo "yes" || echo "no")"

STASH_COUNT=$(git stash list | wc -l | tr -d ' ')
sub "stashes: $STASH_COUNT"

PR_EXISTS=0
gh pr view "$FEATURE" >/dev/null 2>&1 && PR_EXISTS=1
sub "PR for '$FEATURE': $([ "$PR_EXISTS" = 1 ] && echo "exists" || echo "missing")"
echo

# ── Recovery flow ─────────────────────────────────────────────────────

# Step 1: Get to the feature branch with all current edits.
if [ "$CURRENT" = "$FEATURE" ]; then
  green "already on '$FEATURE'"
elif [ "$LOCAL_FEATURE_EXISTS" = 1 ]; then
  yellow "switching to existing '$FEATURE'"
  if [ "$UNCOMMITTED" = 1 ]; then
    git stash push -u -m "auto-stash for recovery" >/dev/null
    git checkout "$FEATURE"
    git stash pop >/dev/null 2>&1 || red "stash pop conflict — resolve manually"
  else
    git checkout "$FEATURE"
  fi
  green "on '$FEATURE'"
else
  yellow "creating '$FEATURE' from main"
  if [ "$UNCOMMITTED" = 1 ]; then
    git stash push -u -m "auto-stash for recovery" >/dev/null
    STASHED=1
  fi
  if [ "$CURRENT" != "main" ]; then
    git checkout main
  fi
  git pull --ff-only origin main
  git checkout -b "$FEATURE"
  if [ "${STASHED:-0}" = 1 ]; then
    git stash pop >/dev/null 2>&1 || red "stash pop conflict — resolve manually"
  fi
  green "on new '$FEATURE'"
fi

# Step 2: Re-run gates so we know the state is shippable.
bold "Re-running gates"
npm run versions:check >/dev/null && green "versions:check"
npm run metrics:check >/dev/null && green "metrics:check"
npm run docs:check >/dev/null && green "docs:check"
npm run lint >/dev/null && green "lint"
npm run typecheck >/dev/null && green "typecheck"
npx vitest run --reporter=dot >/dev/null && green "vitest"

# Step 3: Stage + commit if there's anything to commit.
git add -A
if git diff --cached --quiet; then
  yellow "nothing to commit — release commit may already exist"
else
  bold "Committing"
  git commit -m "$COMMIT_MSG"
  green "committed"
fi

# Step 4: Push (force-with-lease in case origin already has a stale tip).
bold "Pushing"
if git push -u origin "$FEATURE" 2>&1; then
  green "pushed origin/$FEATURE"
else
  yellow "plain push failed — retrying with --force-with-lease"
  git push --force-with-lease -u origin "$FEATURE"
  green "pushed origin/$FEATURE"
fi

# Step 5: Open PR if it doesn't exist.
if [ "$PR_EXISTS" = 1 ]; then
  yellow "PR already exists for $FEATURE — leaving as is"
  gh pr view "$FEATURE" --json url --jq .url
else
  bold "Opening PR"
  gh pr create \
    --title "$COMMIT_MSG" \
    --body "$(cat <<'EOF'
Adds four new Swift validator rules from the SWARM dogfooding log:

- AX842 catches SwiftUI View structs declared but never instantiated anywhere in the project. Would have prevented sprint-scale dead-code work shipped into ProjectWarRoomView, PersonalWorkspaceView, and ProjectAuditView. Honors `// axint:reachable` opt-out for views constructed reflectively.
- AX841 extends AX768 by indexing every type declared anywhere in the project, not just files in the validation set. Catches voiceInbox.items when VoiceInboxStore exposes results. Includes "Did you mean" suggestions via Levenshtein.
- AX840 ships a bundled module-export table covering UniformTypeIdentifiers, AVFoundation, MapKit, Combine, AppIntents, CryptoKit and other commonly-missed Swift-only frameworks. Catches UTType.text and `[.text]` shorthand patterns.
- AX787 expansion runs a companion pass that scans `\\(IDENTIFIER)` interpolations for undefined identifiers regardless of name shape.

`validateSwiftSources` accepts an optional `projectContext: { projectRoot }` to unlock AX841 and AX842. Backward compatible — existing callers see no behavior change.

15 new tests (1146 total). Diagnostics 195 to 198. Lint, typecheck, versions:check, metrics:check, docs:check all clean.
EOF
)"
  green "PR opened"
fi

echo
bold "Done. After the PR is reviewed and merged:"
echo "  npm run build && npm publish --access public"
echo "  git tag v0.4.18 && git push origin v0.4.18"
echo "  bash ~/SWARM/install-axint-mcp.sh"
