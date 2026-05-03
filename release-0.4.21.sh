#!/usr/bin/env bash
# release-0.4.21.sh — finalizes the 0.4.21 release.
#
# Run this ONCE from your Mac terminal:
#   cd ~/agenticempire/axint && bash release-0.4.21.sh
#
# What's in this release — directly addresses the 2026-05-03 dogfooding
# entry "Overnight extended sprint: end-of-sprint Axint wishlist (18 files,
# 1 build error, ~80% caught)":
#   1. AX848 — nested type / static member access on a project type
#      (closes the FIFTH cross-file member-resolution miss; AX841 left this
#      gap because its receiver regex is anchored on lowercase-first IDs)
#   2. AX841 extended with typed-collection-element inference
#      (ForEach(store.results) { item in ... } binds item: VoiceCaptureResult)
#   3. axint cloud check --diff-only (suppresses ambient pre-existing warnings)
#   4. Snapshot-baseline affinity hint (auto-reminds to rebaseline)
#   5. Drift-age stamp on axint.workflow.check (10-minute checkpoint enforcement)
#
# After PR merges:
#   npm run build && npm publish --access public
#   git tag v0.4.21 && git push origin v0.4.21
#   bash ~/SWARM/install-axint-mcp.sh   # pin bumped to 0.4.21

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

bold "axint 0.4.21 release"
echo

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  green "cleared stale .git/index.lock"
fi

CURRENT="$(git branch --show-current)"
FEATURE="v0421-cross-file-resolution-and-workflow-quality"

if [ "${CURRENT}" != "${FEATURE}" ]; then
  STASHED=0
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -u -m "auto-stash for 0.4.21 release script" >/dev/null
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
  if [ "${STASHED}" = "1" ]; then
    git stash pop >/dev/null 2>&1 || yellow "stash pop conflict — resolve manually"
  fi
  green "on branch ${FEATURE}"
else
  green "already on ${FEATURE}"
fi

bold "Recomputing metrics + public truth from source"
npm run metrics:emit >/dev/null && green "metrics:emit"
if [ -f ../public-truth/package.json ] && grep -q "\"sync\"" ../public-truth/package.json; then
  (cd ../public-truth && npm run sync) >/dev/null && green "public-truth sync"
elif [ -f ../public-truth/scripts/sync.mjs ]; then
  (cd ../public-truth && node scripts/sync.mjs) >/dev/null && green "public-truth sync (direct)"
else
  yellow "public-truth sync script not found — bump axint version manually if drift"
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
  git commit -m "Release Axint 0.4.21 cross-file resolution AX848, diff-only, drift-age"
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
      --title "Release Axint 0.4.21 cross-file resolution AX848, diff-only, drift-age" \
      --body "$(cat <<'EOF'
Closes the recurring cross-file member-resolution miss (5+ instances across two sprints in AXINT_DOGFOODING.md) plus three workflow-quality improvements requested in the 2026-05-03 overnight-sprint entry.

AX848 — nested type / static member access on a project-indexed type:
- AX841 deliberately ignores receivers whose first character is uppercase (instance-member access only).
- IntelBriefItem.Kind is a type-on-type lookup, not instance member access — AX841 skips it.
- AX848 specifically catches the type-on-type form, only fires when the parent is project-indexed, and uses Levenshtein over the parent's nested types / static members / enum cases for "did you mean" suggestions.
- Resolves the FIFTH cross-file miss documented in the dogfooding log.

AX841 extended with typed-collection-element inference:
- ForEach(store.results) { item in ... } now binds item to the element type of store.results.
- for item in store.results { ... } same.
- Closes the dogfooding item.title (real field is headline) miss where item came from a typed ForEach.
- Required reordering the member-access loop: an inferred closure-parameter type now wins over the untyped-closure skip-list.

axint cloud check --diff-only:
- Filters diagnostics to lines this branch actually changed via git diff --unified=0.
- Pre-existing warnings on unchanged lines stay silent so the warning count means "things I broke."
- Companion --diff-base <ref> and --diff-cwd <dir> for branch / submodule layouts.
- CloudCheckReport.diffFilter exposes the suppressed-diagnostic count.

Snapshot-baseline affinity hint:
- When the validated Swift file has matching __Snapshots__/<view>*.png baselines on disk, Cloud Check appends a one-line "this view has N snapshot baselines; rebaseline after the next build" reminder to nextSteps.
- Default-on when sourcePath is provided; opt out with --no-snapshot-affinity.
- CloudCheckReport.snapshotAffinity exposes the matching baseline paths.

Drift-age stamp on axint.workflow.check:
- Every workflow.check call writes .axint/session/last-workflow-check.json and reads the prior one.
- "Minutes since last workflow.check" now appears in checked for normal runs and in recommended (with a DRIFT tag) when the gap exceeds the 10-minute checkpoint rule.
- WorkflowCheckReport.driftAge exposes the structured value for tooling.

Internal:
- collectDeclaredMemberNames now includes nested type names (struct/class/actor/enum/typealias declared inside the parent body) so AX841 + AX848 don't false-positive on legitimate nested-type access.
- New collectDeclaredMemberTypes returns the property-name -> declared-type map used by the collection-element inference.

15 new tests across swift-validator-0421-rules.test.ts and cloud/diff-and-affinity.test.ts. Lint, typecheck, versions:check, metrics:check, docs:check all clean.
EOF
)"
    green "PR opened"
  fi
fi

echo
bold "Done. After PR merges:"
echo "  npm run build && npm publish --access public"
echo "  git tag v0.4.21 && git push origin v0.4.21"
echo "  bash ~/SWARM/install-axint-mcp.sh   # pin bumped to 0.4.21"
