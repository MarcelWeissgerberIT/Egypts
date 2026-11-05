#!/usr/bin/env bash
# Build the game and publish dist/ to the gh-pages branch (GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build.mjs
tmp=$(mktemp -d)
cp -r dist/. "$tmp"/
touch "$tmp/.nojekyll"
remote=$(git remote get-url origin)
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy Purpursonne Pyramide to GitHub Pages"
git push -f "$remote" gh-pages
rm -rf "$tmp"
