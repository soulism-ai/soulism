#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
API_KEY="${API_KEY:-local-dev-key}"

curl -sS "${GATEWAY_URL}/policy/check" \
  -X POST \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{
    "personaId": "default",
    "userId": "example-user",
    "tenantId": "example-tenant",
    "tool": "tool:webfetch",
    "action": "fetch",
    "riskClass": "low",
    "traceId": "curl-example"
  }' | jq .

curl -sS "${GATEWAY_URL}/tools/files/write" \
  -X POST \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -H "x-user-id: example-user" \
  -H "x-tenant-id: example-tenant" \
  -H "x-persona-id: default" \
  -H "x-policy-confirmed: true" \
  -d '{
    "path": "notes/example.txt",
    "content": "hello from curl"
  }' | jq .
