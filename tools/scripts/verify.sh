#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pnpm run lint
pnpm run typecheck
pnpm tsx tools/scripts/sign-marketplace-descriptors-kms.ts --provider=aws --key-id=marketplace-key-1 --publisher=soulism-labs --min-cli-version=0.1.0
pnpm tsx tools/contracts/validate-openapi.ts
pnpm tsx tools/contracts/validate-asyncapi.ts
pnpm tsx tools/contracts/validate-mcp.ts
pnpm tsx tools/contracts/validate-marketplace.ts
pnpm tsx tools/contracts/validate-telemetry-alerts.ts
pnpm tsx tools/contracts/validate-alert-providers.ts
pnpm tsx tools/contracts/validate-telemetry-pipeline.ts
pnpm tsx tools/contracts/validate-kms-providers.ts
pnpm tsx tools/contracts/validate-packs.ts
pnpm tsx tools/contracts/validate-eval-regression-policy.ts
pnpm tsx tools/contracts/validate-adapter-e2e-parity-policy.ts
pnpm tsx tools/contracts/validate-adapter-runtime-parity-policy.ts
pnpm tsx tools/contracts/validate-adapter-framework-parity-policy.ts
pnpm tsx tools/contracts/validate-adapter-framework-boot-policy.ts
pnpm tsx tools/contracts/validate-adapter-framework-cli-boot-policy.ts
pnpm tsx tools/contracts/validate-distribution-signatures.ts
pnpm tsx tools/contracts/validate-signing-rotation.ts
pnpm tsx ci/adapters/validate-adapters.ts
pnpm tsx tools/contracts/validate-adapter-contracts.ts
pnpm tsx ci/adapters/validate-nextjs.ts
pnpm tsx ci/adapters/validate-expo.ts
pnpm tsx tools/security/run-semgrep.ts --targets=ci/security/seeds/sast --expect-findings=true --report=ci/baselines/security/semgrep.seed.report.json
pnpm tsx tools/security/run-trivy.ts --targets=ci/security/seeds/deps --scanners=vuln --expect-findings=true --report=ci/baselines/security/trivy.deps.seed.report.json
pnpm tsx tools/security/run-gitleaks.ts --targets=ci/security/seeds/secrets --expect-findings=true --report=ci/baselines/security/gitleaks.seed.report.json
pnpm tsx tools/security/verify-seeded-violations.ts --mode=all
pnpm tsx tools/security/run-semgrep.ts --targets=services,packages,apps,tools --report=ci/baselines/security/semgrep.clean.report.json
pnpm tsx tools/security/run-trivy.ts --targets=services,packages,apps,tools --scanners=vuln --report=ci/baselines/security/trivy.deps.clean.report.json
pnpm tsx tools/security/run-gitleaks.ts --targets=services,packages,apps,tools --report=ci/baselines/security/gitleaks.clean.report.json
pnpm run test
pnpm run smoke
pnpm tsx ci/evals/signing-enforcement.gate.ts
pnpm tsx ci/evals/jailbreak-resistance.gate.ts
pnpm tsx ci/evals/adapter-e2e-parity.gate.ts
pnpm tsx ci/evals/adapter-runtime-parity.gate.ts
pnpm tsx ci/evals/adapter-framework-parity.gate.ts
pnpm tsx ci/evals/adapter-framework-boot.gate.ts
pnpm tsx ci/evals/adapter-framework-cli-boot.gate.ts
pnpm tsx ci/evals/eval-trend-regression.gate.ts
pnpm tsx ci/evals/rollback-drill.gate.ts
pnpm tsx tools/scripts/generate-live-audit-evidence.ts
pnpm tsx tools/scripts/export-audit-evidence.ts --source-file=ci/baselines/audit-evidence.json --out=ci/baselines/audit-export.json --previous-path=ci/baselines/audit-evidence.json --require-chain-ok=true
pnpm tsx tools/scripts/verify-evidence-chain.ts
pnpm tsx tools/scripts/prove-alert-dispatch.ts
pnpm tsx tools/scripts/prove-alert-provider-dispatch.ts
pnpm tsx tools/scripts/probe-nextjs-adapter.ts
pnpm tsx tools/scripts/probe-expo-adapter.ts
pnpm tsx tools/scripts/probe-hf-adapter.ts
pnpm tsx tools/scripts/probe-adapter-parity.ts
pnpm tsx tools/scripts/build-rollback-evidence.ts
pnpm tsx tools/scripts/build-key-rotation-evidence.ts
pnpm tsx tools/scripts/prove-kms-provider-signing.ts
pnpm tsx tools/contracts/validate-kms-live-readiness.ts
pnpm tsx tools/sbom/cyclonedx.ts
pnpm tsx tools/scripts/build-distribution-release-bundle.ts
pnpm tsx tools/scripts/build-evidence-bundle.ts
