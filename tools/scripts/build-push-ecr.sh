#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region)}}"
REGION="${REGION:-us-east-2}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
TAG="${TAG:-prod-$(date +%Y%m%d%H%M%S)}"

repo_for() {
  case "$1" in
    api-gateway) echo "soulism/api-gateway" ;;
    policy-gate-service) echo "soulism/policy-gate-service" ;;
    risk-budget-service) echo "soulism/risk-budget-service" ;;
    audit-ledger-service) echo "soulism/audit-ledger-service" ;;
    persona-registry-service) echo "soulism/persona-registry-service" ;;
    memory-service) echo "soulism/memory-service" ;;
    tool-files-service) echo "soulism/tool-files-service" ;;
    tool-webfetch-service) echo "soulism/tool-webfetch-service" ;;
    web-control-plane) echo "soulism/web-control-plane" ;;
    *) return 1 ;;
  esac
}

dockerfile_for() {
  case "$1" in
    api-gateway) echo "services/edge/api-gateway/Dockerfile" ;;
    policy-gate-service) echo "services/trust-safety/policy-gate-service/Dockerfile" ;;
    risk-budget-service) echo "services/trust-safety/risk-budget-service/Dockerfile" ;;
    audit-ledger-service) echo "services/trust-safety/audit-ledger-service/Dockerfile" ;;
    persona-registry-service) echo "services/mcp/persona-registry-service/Dockerfile" ;;
    memory-service) echo "services/mcp/memory-service/Dockerfile" ;;
    tool-files-service) echo "services/mcp/tool-files-service/Dockerfile" ;;
    tool-webfetch-service) echo "services/mcp/tool-webfetch-service/Dockerfile" ;;
    web-control-plane) echo "apps/web-control-plane/Dockerfile" ;;
    *) return 1 ;;
  esac
}

IMAGES=("$@")
if [[ "${#IMAGES[@]}" -eq 0 ]]; then
  IMAGES=(
    api-gateway
    policy-gate-service
    risk-budget-service
    audit-ledger-service
    persona-registry-service
    memory-service
    tool-files-service
    tool-webfetch-service
    web-control-plane
  )
fi

needs_persona_registry_bootstrap=false
for image in "${IMAGES[@]}"; do
  if [[ "$image" == "persona-registry-service" ]]; then
    needs_persona_registry_bootstrap=true
    break
  fi
done

if [[ "$needs_persona_registry_bootstrap" == "true" ]]; then
  pnpm tsx tools/scripts/build-bootstrap-persona-packs.ts \
    --out=build/bootstrap-packs \
    --provider="${BOOTSTRAP_PERSONA_KMS_PROVIDER:-aws}" \
    --key-id="${BOOTSTRAP_PERSONA_KMS_KEY_ID:-${SIGNING_KMS_ALIAS:-marketplace-key-1}}"
fi

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

for image in "${IMAGES[@]}"; do
  if ! repo="$(repo_for "$image")" || ! dockerfile="$(dockerfile_for "$image")"; then
    echo "unknown image key: $image" >&2
    exit 1
  fi

  if ! aws ecr describe-repositories --region "$REGION" --repository-names "$repo" >/dev/null 2>&1; then
    aws ecr create-repository \
      --region "$REGION" \
      --repository-name "$repo" \
      --image-tag-mutability IMMUTABLE \
      --image-scanning-configuration scanOnPush=true >/dev/null
  fi

  uri="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${repo}:${TAG}"
  local_tag="soulism/${image}:${TAG}"

  docker build -f "$dockerfile" -t "$local_tag" .
  docker tag "$local_tag" "$uri"
  docker push "$uri"
  echo "${image} => ${uri}"
done
