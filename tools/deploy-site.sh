#!/usr/bin/env bash
# Lægger hjemmesiden på https://linbatkivi.github.io/ (repoet linbatkivi/linbatkivi.github.io).
# Kopierer site/ og kataloget derind, og sørger for at launchere der peger på den gamle adresse /worldwide-studios/
# stadig finder kataloget og billederne.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
gh repo clone linbatkivi/linbatkivi.github.io "$TMP/s" -- -q
cd "$TMP/s"
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$ROOT/site/." .
cp "$ROOT/catalog/games.json" catalog.json
mkdir -p worldwide-studios/assets
cp catalog.json worldwide-studios/catalog.json
cp -R assets/art worldwide-studios/assets/art
git add -A
if git diff --cached --quiet; then echo "Siden er allerede ajour."; exit 0; fi
git commit -q -m "Hjemmeside: Worldwide (Studios)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -q
echo "Lagt ud: https://linbatkivi.github.io/ (kan tage et par minutter)"
