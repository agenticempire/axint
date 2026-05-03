#!/usr/bin/env bash
# release-0.4.17.sh — finalizes the 0.4.17 release on the dogfooding-v0417 branch.
#
# Run this ONCE from your Mac terminal:
#   cd ~/agenticempire/axint && bash release-0.4.17.sh
#
# What it does (in order, with bail-on-failure):
#   1. Clears any stale .git/index.lock left over from sandbox writes.
#   2. Confirms you're on the dogfooding-v0417 branch.
#   3. Re-runs versions:check + metrics:check + lint + typecheck + tests.
#   4. Stages everything, commits with the project's conventional message.
#   5. Pushes the branch to origin.
#   6. Opens a PR via `gh` if available (otherwise prints the PR URL to open).
#   7. Reminds you about the build + npm publish steps (left manual on purpose).

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red() { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }
yellow() { printf "\033[33m→\033[0m %s\n" "$1"; }

cd "$(dirname "$0")"
ROOT="$(pwd)"

bold "axint 0.4.17 release"
echo

# ── 1. Clean stale index lock ─────────────────────────────────────────
if [ -f .git/index.lock ]; then
  yellow "Removing stale .git/index.lock"
  rm -f .git/index.lock
fi
green "git index unlocked"

# ── 2. Branch check ───────────────────────────────────────────────────
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "dogfooding-v0417" ]; then
  red "Expected branch dogfooding-v0417, got '$BRANCH'."
  red "Run: git checkout dogfooding-v0417"
  exit 1
fi
green "on branch dogfooding-v0417"

# ── 3. Re-run gates ───────────────────────────────────────────────────
bold "Running gates…"
npm run versions:check >/dev/null
green "versions:check"
npm run metrics:check >/dev/null
green "metrics:check"
npm run lint >/dev/null
green "lint"
npm run typecheck >/dev/null
green "typecheck"
npx vitest run --reporter=dot >/dev/null
green "vitest"

# ── 4. Stage + commit ─────────────────────────────────────────────────
git add -A

if git diff --cached --quiet; then
  yellow "No staged changes. The release commit may already exist."
else
  bold "Committing…"
  git commit -m "Release Axint 0.4.17 cross-file lint and honest cloud-check copy"
  green "committed"
fi

# ── 5. Push ──────────────────────────────────────────────────────────
bold "Pushing to origin/dogfooding-v0417…"
git push -u origin dogfooding-v0417
green "pushed"

# ── 6. PR ────────────────────────────────────────────────────────────
if command -v gh >/dev/null 2>&1; then
  bold "Opening PR…"
  if gh pr view dogfooding-v0417 >/dev/null 2>&1; then
    yellow "PR already exists for this branch."
    gh pr view dogfooding-v0417 --web >/dev/null 2>&1 || true
  else
    gh pr create \
      --title "Release Axint 0.4.17 cross-file lint and honest cloud-check copy" \
      --body "$(cat <<'EOF'
Adds three new Swift validator rules informed by the SWARM dogfooding log:

- AX787 catches references to is*/has*/should*/can*/did*/will* identifiers that no longer resolve in scope after a refactor — the "deleted computed property, call site left behind" pattern that bit ProjectShowcaseView during the M-3 ShowcaseTheme rewrite.
- AX788 flags HStack children whose body chains .frame(maxWidth: .infinity) without a fixed-width clamp. Static analysis was previously blind to this layout-collapse class even though it broke rendering on every page during the Divider → SwarmGradientDivider sweep.
- AX789 flags redundant Task { @MainActor in ... } inside .onAppear / .task. Companion to AX730.

Cleans up two long-running noise sources:

- AX768 references on Apple framework types that fall outside the bundled member table now emit at info instead of warning.
- Bundled member coverage extended to ScrollGeometry, ScrollPhase, Animation, Color, Image, Text, Bindable, Binding, AnyView, EmptyView.

Cloud Check copy now states explicitly that static checks do not equal compiler acceptance — evidence_required and ready_for_build reasons surface "xcodebuild build (compile proof — non-negotiable)" so agents stop reading a clean static gate as a build pass.

Includes 8 new tests (1129 total, all green). Lint, typecheck, versions:check, metrics:check all clean.
EOF
)"
  fi
  green "PR opened (or already existed)"
else
  yellow "gh CLI not installed — open the PR manually:"
  echo "  https://github.com/agenticempire/axint/pull/new/dogfooding-v0417"
fi

# ── 7. Next steps ────────────────────────────────────────────────────
echo
bold "Done. Manual next steps:"
echo
echo "  Build the dist (npm publish requires it):"
echo "    npm run build"
echo
echo "  Publish to npm (requires npm login):"
echo "    npm publish --access public"
echo
echo "  After publish, smoke-test from anywhere:"
echo "    npx -y -p @axint/compiler@0.4.17 axint --version"
echo
echo "  And rerun the install in Cowork hosts so they pick up 0.4.17:"
echo "    bash ~/SWARM/install-axint-mcp.sh"
echo "    (the script bumps the pinned version every time it's edited)"
echo
