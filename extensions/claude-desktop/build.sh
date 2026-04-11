#!/usr/bin/env bash
set -euo pipefail

# Build the Axint Claude Desktop Extension (.mcpb)
# Requires: npm, zip

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/dist"

echo "Installing server dependencies..."
cd "$DIR/server"
npm install --production
cd "$DIR"

echo "Packing .mcpb..."
rm -rf "$OUT"
mkdir -p "$OUT"

# .mcpb is a zip archive containing manifest.json + server/
cd "$DIR"
zip -r "$OUT/axint.mcpb" \
  manifest.json \
  README.md \
  server/index.js \
  server/package.json \
  server/node_modules \
  -x "server/node_modules/.package-lock.json"

echo "Built: $OUT/axint.mcpb"
