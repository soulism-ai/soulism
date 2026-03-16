#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"

curl -sS "${GATEWAY_URL}/health" | jq .
curl -sS "${GATEWAY_URL}/ready" | jq .
