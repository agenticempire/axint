#!/bin/bash
# generate-demo.sh — Generate the demo GIF for the README
#
# Requirements:
#   brew install vhs   (charmbracelet/vhs for terminal recording)
#
# Usage:
#   ./scripts/generate-demo.sh
#
# This uses VHS (https://github.com/charmbracelet/vhs) to record
# a terminal session showing Axint in action.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check for vhs
if ! command -v vhs &>/dev/null; then
  echo "Error: 'vhs' is required. Install with: brew install vhs"
  exit 1
fi

# Create VHS tape file
cat > /tmp/axint-demo.tape << 'TAPE'
Output docs/assets/axint-demo.gif
Set FontSize 16
Set Width 900
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Type "cat examples/calendar-assistant.ts"
Enter
Sleep 2s

Type "axint compile examples/calendar-assistant.ts --stdout"
Enter
Sleep 3s

Type "# TypeScript in, Swift out ✨"
Enter
Sleep 2s
TAPE

echo "Recording demo GIF..."
vhs /tmp/axint-demo.tape
echo "Done! GIF saved to docs/assets/axint-demo.gif"
