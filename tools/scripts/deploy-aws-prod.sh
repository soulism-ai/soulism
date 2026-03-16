#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region)}}"
REGION="${REGION:-us-east-2}"
STACK_NAME="${STACK_NAME:-soulism-prod}"
CLUSTER_NAME="${CLUSTER_NAME:-$STACK_NAME}"
NAMESPACE_NAME="${NAMESPACE_NAME:-soulism.internal}"
VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$REGION")}"
TAG="${TAG:-prod-$(date -u +%Y%m%d%H%M%S)}"
SIGNING_KMS_ALIAS="${SIGNING_KMS_ALIAS:-alias/marketplace-key-1}"
SIGNING_PUBLIC_KEY_SECRET_NAME="${SIGNING_PUBLIC_KEY_SECRET_NAME:-${STACK_NAME}/signing-public-key}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_SMOKE="${SKIP_SMOKE:-false}"

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "unable to resolve default VPC; set VPC_ID explicitly" >&2
  exit 1
fi

PUBLIC_SUBNETS=($(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query 'Subnets[?MapPublicIpOnLaunch==`true`].SubnetId' \
  --output text \
  --region "$REGION" | tr '\t' '\n' | sed '/^$/d' | sort))

SUBNET_A="${PUBLIC_SUBNETS[0]:-}"
SUBNET_B="${PUBLIC_SUBNETS[1]:-}"
SUBNET_C="${PUBLIC_SUBNETS[2]:-}"

if [[ -z "$SUBNET_A" || -z "$SUBNET_B" || -z "$SUBNET_C" ]]; then
  echo "unable to resolve three public subnets in VPC ${VPC_ID}" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

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

image_uri() {
  local repo
  repo="$(repo_for "$1")"
  printf '%s.dkr.ecr.%s.amazonaws.com/%s:%s' "$ACCOUNT_ID" "$REGION" "$repo" "$TAG"
}

if [[ "$SKIP_BUILD" != "true" ]]; then
  AWS_REGION="$REGION" TAG="$TAG" "$ROOT_DIR/tools/scripts/build-push-ecr.sh" \
    api-gateway \
    policy-gate-service \
    risk-budget-service \
    audit-ledger-service \
    persona-registry-service \
    memory-service \
    tool-files-service \
    tool-webfetch-service \
    web-control-plane
fi

SIGNING_KMS_KEY_ARN="$(aws kms describe-key --key-id "$SIGNING_KMS_ALIAS" --query 'KeyMetadata.Arn' --output text --region "$REGION")"
if [[ -z "$SIGNING_KMS_KEY_ARN" || "$SIGNING_KMS_KEY_ARN" == "None" ]]; then
  echo "unable to resolve KMS key for ${SIGNING_KMS_ALIAS}" >&2
  exit 1
fi

tmp_der="$(mktemp)"
tmp_pem="$(mktemp)"
trap 'rm -f "$tmp_der" "$tmp_pem"' EXIT

aws kms get-public-key --key-id "$SIGNING_KMS_ALIAS" --query 'PublicKey' --output text --region "$REGION" \
  | openssl base64 -d -A >"$tmp_der"
openssl pkey -pubin -inform DER -in "$tmp_der" -out "$tmp_pem" >/dev/null 2>&1
SIGNING_PUBLIC_KEY="$(cat "$tmp_pem")"

if aws secretsmanager describe-secret --secret-id "$SIGNING_PUBLIC_KEY_SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value \
    --secret-id "$SIGNING_PUBLIC_KEY_SECRET_NAME" \
    --secret-string "$SIGNING_PUBLIC_KEY" \
    --region "$REGION" >/dev/null
  SIGNING_PUBLIC_KEY_SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SIGNING_PUBLIC_KEY_SECRET_NAME" --query 'ARN' --output text --region "$REGION")"
else
  SIGNING_PUBLIC_KEY_SECRET_ARN="$(aws secretsmanager create-secret \
    --name "$SIGNING_PUBLIC_KEY_SECRET_NAME" \
    --description "Cognitive AI signing public key material for gateway posture checks" \
    --secret-string "$SIGNING_PUBLIC_KEY" \
    --query 'ARN' \
    --output text \
    --region "$REGION")"
fi

aws cloudformation validate-template \
  --template-body "file://$ROOT_DIR/infra/aws/ecs/stack.yaml" \
  --region "$REGION" >/dev/null

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$ROOT_DIR/infra/aws/ecs/stack.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
    ClusterName="$CLUSTER_NAME" \
    NamespaceName="$NAMESPACE_NAME" \
    VpcId="$VPC_ID" \
    SubnetA="$SUBNET_A" \
    SubnetB="$SUBNET_B" \
    SubnetC="$SUBNET_C" \
    ApiGatewayImageUri="$(image_uri api-gateway)" \
    WebControlPlaneImageUri="$(image_uri web-control-plane)" \
    PolicyGateImageUri="$(image_uri policy-gate-service)" \
    RiskBudgetImageUri="$(image_uri risk-budget-service)" \
    AuditLedgerImageUri="$(image_uri audit-ledger-service)" \
    PersonaRegistryImageUri="$(image_uri persona-registry-service)" \
    MemoryImageUri="$(image_uri memory-service)" \
    ToolFilesImageUri="$(image_uri tool-files-service)" \
    ToolWebfetchImageUri="$(image_uri tool-webfetch-service)" \
    SigningKmsKeyArn="$SIGNING_KMS_KEY_ARN" \
    SigningPublicKeySecretArn="$SIGNING_PUBLIC_KEY_SECRET_ARN"

LOAD_BALANCER_DNS="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDnsName`].OutputValue' \
  --output text \
  --region "$REGION")"
API_KEY_SECRET_ARN="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`GatewayApiKeySecretArn`].OutputValue' \
  --output text \
  --region "$REGION")"

cat <<EOF
Deployment complete.
Stack: $STACK_NAME
Region: $REGION
Control plane URL: http://$LOAD_BALANCER_DNS
Gateway API key secret ARN: $API_KEY_SECRET_ARN
Signing public key secret ARN: $SIGNING_PUBLIC_KEY_SECRET_ARN
Image tag: $TAG
EOF

if [[ "$SKIP_SMOKE" != "true" ]]; then
  "$ROOT_DIR/tools/scripts/smoke-aws-prod.sh" "$STACK_NAME" "$REGION"
fi
