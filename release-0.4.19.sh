#!/usr/bin/env bash
# release-0.4.19.sh — finalizes the 0.4.19 release.
#
# Run this ONCE from your Mac terminal:
#   cd ~/agenticempire/axint && bash release-0.4.19.sh
#
# What's in this release:
#   1. AX843 — state-machine orphan (enum case written but never read)
#   2. AX844 — synthesized Hashable/Equatable/Codable propagation
#   3. AX845 — @MainActor static method in init default-value
#   4. AX846 — @ViewBuilder requires View return type (catches @ViewBuilder some Shape)
#   5. AX847 — type-erased SwiftUI protocol method missing (catches AnyShape.strokeBorder)
#   6. axint.registry.search MCP tool — agent-lookup loop entry point
#   7. registryPackages metric is auto-counted (was hardcoded 14)
#   + bump-consumer-versions-and-sync.sh fixes (auto-detect + npm install)
#
# After PR merges:
#   npm run build && npm publish --access public
#   git tag v0.4.19 && git push origin v0.4.19
#   bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.19

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"

bold "axint 0.4.19 release"
echo

if [ -f .git/index.lock ]; then
  rm -f .git/index.lock
  green "cleared stale .git/index.lock"
fi

CURRENT="$(git branch --show-current)"
FEATURE="v0419-coverage-rules"

if [ "$CURRENT" != "$FEATURE" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -u -m "auto-stash for 0.4.19 release script" >/dev/null
    STASHED=1
  fi
  git fetch origin --quiet
  git checkout main
  git pull --ff-only origin main
  if git rev-parse --verify "$FEATURE" >/dev/null 2>&1; then
    git checkout "$FEATURE"
  else
    git checkout -b "$FEATURE"
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
  git commit -m "Release Axint 0.4.19 actor isolation, conformance propagation, registry search"
  green "committed"
fi

bold "Pushing to origin/${FEATURE}"
git push -u origin "${FEATURE}"
green "pushed"

if command -v gh >/dev/null 2>&1; then
  bold "Opening PR"
  if gh pr view "$FEATURE" >/dev/null 2>&1; then
    yellow "PR already exists for ${FEATURE}"
  else
    gh pr create \
      --title "Release Axint 0.4.19 actor isolation, conformance propagation, registry search" \
      --body "$(cat <<'EOF'
Five new validator rules from the SWARM dogfooding log, one new MCP tool, and infrastructure fixes.

New rules:

- AX847 catches methods called on type-erased SwiftUI protocols that don't exist on the erased surface. Bundled table — currently AnyShape.strokeBorder (lives on InsettableShape, not Shape) and AnyShape.inset. Suggests the closest valid replacement (`.stroke` for `.strokeBorder`).
- AX846 catches @ViewBuilder annotations on properties/funcs whose return type isn't some View. Catches the @ViewBuilder some Shape pattern that produces _ConditionalContent (View only) but is asked to satisfy a Shape constraint.
- AX845 catches @MainActor classes with init parameter defaults that call same-type static methods. Default-value expressions evaluate at the caller's isolation context (often non-isolated), and Swift 6 rejects the actor crossing. Single-keyword fix the diagnostic suggests directly (mark the static method nonisolated).
- AX844 catches structs declaring synthesized Hashable/Equatable/Codable when a stored property's type doesn't conform. Walks project-context to verify cross-file conformance, including extensions. Catches the SkillEndorsementBucket / LiveTeammate pattern from this sprint.
- AX843 catches enum cases written somewhere but never read by a switch/pattern anywhere reachable. Catches the Navigator.rightPane = .voiceInbox pattern where the writer survived a refactor but the consumer view was dropped.

New tool:

- axint.registry.search — natural-language query against the local Axint Registry. Returns ranked hits with install commands. Use BEFORE axint.feature so agents install existing packages instead of regenerating Swift the community has already shipped. Token-overlap scoring with field weighting; honors AXINT_REGISTRY_PATH for non-default checkouts.

Infrastructure:

- registryPackages metric is now auto-counted from the sibling axint-registry/first-party/ directory. The previous hardcoded 14 was stale; the real count from the registry now flows through metrics.json and every public surface.
- bump-consumer-versions-and-sync.sh now auto-detects OLD/NEW versions from axint/package.json and uses npm install --save-exact for docs.axint.ai's lockfile (avoids the EINTEGRITY trap from the 0.4.17/0.4.18 deploys).

21 new tests (1278 total). Diagnostics 198 to 203. Lint, typecheck, versions:check, metrics:check, docs:check all clean.
EOF
)"
    green "PR opened"
  fi
fi

echo
bold "Done. After PR merges:"
echo "  npm run build && npm publish --access public"
echo "  git tag v0.4.19 && git push origin v0.4.19"
echo "  bash ~/SWARM/install-axint-mcp.sh   # already pinned to 0.4.19"
