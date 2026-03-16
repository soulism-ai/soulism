#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
API_KEY="${API_KEY:-local-dev-key}"

curl -sS "${GATEWAY_URL}/personas" \
  -H "x-api-key: ${API_KEY}" \
  -H "x-user-id: example-user" \
  -H "x-tenant-id: example-tenant" \
  -H "x-persona-id: default" | jq .
