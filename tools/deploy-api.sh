#!/usr/bin/env bash
# Lægger konto-serveren på Fly.io (og opdaterer den, hvis den allerede ligger der).
#   tools/deploy-api.sh [app-navn]      standard: worldwide-id, adressen bliver https://<navn>.fly.dev
# Kræver flyctl, og at kontoen har et betalingskort: https://fly.io/trial
set -euo pipefail
cd "$(dirname "$0")/../api"
APP="${1:-worldwide-id}"

if ! fly apps list >/dev/null 2>&1; then
  echo "Fly svarer ikke. Log ind med 'fly auth login', og tjek at kontoen har et betalingskort: https://fly.io/trial" >&2
  exit 1
fi
fly status -a "$APP" >/dev/null 2>&1 || fly apps create "$APP"
fly volumes list -a "$APP" 2>/dev/null | grep -q worldwide_data || fly volumes create worldwide_data --region arn --size 1 -a "$APP" -y
# --ha=false: kun én maskine (Fly laver ellers to). --depot: bygger hos Depot og starter ikke Flys gamle byggemaskine.
fly deploy -a "$APP" --ha=false --depot

echo
curl -fsS "https://$APP.fly.dev/v1/health" && echo
if [ "$APP" != "worldwide-id" ]; then
  echo "Navnet er et andet end standarden. Ret 'api' i catalog/games.json til https://$APP.fly.dev og push."
fi
