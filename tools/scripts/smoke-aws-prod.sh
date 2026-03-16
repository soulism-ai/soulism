#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-${1:-soulism-prod}}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-${2:-$(aws configure get region 2>/dev/null || true)}}}"
REGION="${REGION:-us-east-2}"

stack_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey==\`${key}\`].OutputValue" \
    --output text
}

assert_json() {
  local label="$1"
  local expression="$2"
  local payload="$3"

  node - "$label" "$expression" "$payload" <<'EOF'
const [, , label, expression, raw] = process.argv;
const data = JSON.parse(raw);
const fn = new Function('data', `return (${expression});`);
if (!fn(data)) {
  console.error(`${label} assertion failed`);
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}
EOF
}

ALB_DNS="$(stack_output LoadBalancerDnsName)"
API_KEY_SECRET_ARN="$(stack_output GatewayApiKeySecretArn)"

if [[ -z "$ALB_DNS" || "$ALB_DNS" == "None" ]]; then
  echo "unable to resolve LoadBalancerDnsName from stack ${STACK_NAME}" >&2
  exit 1
fi

if [[ -z "$API_KEY_SECRET_ARN" || "$API_KEY_SECRET_ARN" == "None" ]]; then
  echo "unable to resolve GatewayApiKeySecretArn from stack ${STACK_NAME}" >&2
  exit 1
fi

BASE_URL="http://${ALB_DNS}"
API_KEY="$(aws secretsmanager get-secret-value --secret-id "$API_KEY_SECRET_ARN" --region "$REGION" --query SecretString --output text)"

if [[ -z "$API_KEY" || "$API_KEY" == "None" ]]; then
  echo "gateway API key secret ${API_KEY_SECRET_ARN} is empty" >&2
  exit 1
fi

echo "smoking ${BASE_URL}"

health_payload="$(curl -fsS --max-time 20 "${BASE_URL}/health")"
assert_json "health" "data.ok === true && data.service === 'api-gateway'" "$health_payload"

ready_payload="$(curl -fsS --max-time 20 "${BASE_URL}/ready")"
assert_json "ready" "data.ready === true && Array.isArray(data.checks) && data.checks.length > 0" "$ready_payload"

auth_payload="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/auth/me")"
assert_json "auth" "data.authenticated === true && typeof data.subject === 'string' && data.subject.length > 0" "$auth_payload"

personas_payload="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/personas")"
assert_json "personas" "Array.isArray(data.personas) && data.personas.length > 0" "$personas_payload"

budgets_payload="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/budgets")"
assert_json "budgets" "Array.isArray(data) || Array.isArray(data.budgets)" "$budgets_payload"

audit_payload="$(curl -fsS --max-time 20 -H "Authorization: Bearer ${API_KEY}" "${BASE_URL}/audit/events")"
assert_json "audit" "Array.isArray(data)" "$audit_payload"

policy_payload="$(curl -fsS --max-time 20 -X POST \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"personaId":"default","userId":"spoofed-user","tenantId":"spoofed-tenant","tool":"tool:webfetch","action":"fetch","riskClass":"low"}' \
  "${BASE_URL}/policy/check")"
assert_json "policy" "data.state === 'allow' && typeof data.traceId === 'string' && data.traceId.length > 0" "$policy_payload"

root_headers="$(curl -fsSI --max-time 20 "${BASE_URL}/")"
if ! grep -qi '^content-type: text/html' <<<"$root_headers"; then
  echo "root document is not serving HTML" >&2
  echo "$root_headers" >&2
  exit 1
fi

echo "aws smoke passed for ${BASE_URL}"
