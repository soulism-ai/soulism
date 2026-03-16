# EU AI Act Notes (Engineering)

This note is implementation-facing and is not legal advice.

## Scope
- System class: enterprise assistant runtime with policy-gated tool execution.
- Controlled boundaries: gateway ingress, trust-safety policy gates, audit ledger, MCP tool services, packaging/CLI path.
- Assumed legal posture: risk class at least `high` until deployment context and risk controls are formally signed off.

## Control map (engineering artifacts)

### Transparency and explainability
- Requirement: users and operators must be able to understand why actions are taken.
- Implementation:
  - Deterministic policy decision responses include `state`, `reasonCode`, `requirements`, and `budgetSnapshot`.
  - Tool routes expose `traceId` and policy metadata from `policy-gate-service`.
  - Marketplace/openai/copilot/claude artifacts require `publisher`, `signature`, `createdAt`, `digest`.
- Evidence:
  - `tools/contracts/validate-distribution-signing.ts`
  - `services/trust-safety/policy-gate-service`
  - smoke/eval evidence artifacts under `ci/baselines`.

### Data governance and minimization
- Requirement: explicit handling of user/tenant scope and retention constraints.
- Implementation:
  - Memory service supports user and tenant memory operations with delete-by-id and session scoping.
  - File and webfetch tools enforce allowlists and policy pre-flight checks.
- Evidence:
  - `services/mcp/memory-service/src`
  - `services/mcp/tool-files-service/src`
  - `services/mcp/tool-webfetch-service/src`

### Human oversight and risk controls
- Requirement: meaningful intervention paths where model confidence or impact is high.
- Implementation:
  - Policy engine emits `confirm` and `deny` states.
- Evidence:
  - `packages/persona-policy/src/policy.ts`
  - `packages/persona-runtime/src/middleware.ts`
  - `services/trust-safety/policy-gate-service/src/engine.ts`

### Logging and auditability
- Requirement: append-only evidence for safety-critical behavior.
- Implementation:
  - Audit ledger stores immutable chain via `prev_hash`/`hash`.
  - Contracts and workflows generate signed provenance artifacts for distribution.
- Evidence:
  - `services/trust-safety/audit-ledger-service/src`
  - `tools/scripts/build-evidence-bundle.ts`
  - `ci/smoke/audit-hash-chain.spec.ts`

### Security posture and governance
- Requirement: enforce minimum baseline across static and dependency analysis.
- Implementation:
  - CI executes Semgrep, Trivy, and Gitleaks via `security:*` scripts.
  - Contract checks validate KMS/live signing policy and seeded violation harness.
- Evidence:
  - `tools/security/run-semgrep.ts`
  - `tools/security/run-trivy.ts`
  - `tools/security/run-gitleaks.ts`
  - `tools/security/verify-seeded-violations.ts`

## Non-compliance risks to close before public beta
- Formal feature-level risk classification is not yet embedded in release gate PR checklists.
- Market-facing transparency copy (tool action notices, fallback/confidence messaging) is still fragmented across adapters.
- Incident-response runbook automation is not yet wired into on-call alerting for all deploy targets.
- Evidence chain still has two manual artifact dependencies in non-release environments.

## Required evidence set for audit review
- Contract validation passing:
  - `pnpm tsx tools/contracts/validate-openapi.ts`
  - `pnpm tsx tools/contracts/validate-asyncapi.ts`
  - `pnpm tsx tools/contracts/validate-mcp.ts`
  - `pnpm tsx tools/contracts/validate-distribution-signing.ts`
- Security and seed checks:
  - `pnpm run security:seed-check`
  - `pnpm run security:semgrep`
  - `pnpm run security:trivy`
  - `pnpm run security:gitleaks`
- Governance evidence:
  - `pnpm tsx tools/scripts/build-evidence-bundle.ts`
  - `pnpm tsx tools/scripts/build-rollback-evidence.ts`
  - `pnpm tsx tools/scripts/prove-kms-provider-signing.ts`

## Open decision items
1) Assign a legal owner per AI-high-risk feature and map every adapter flow to that owner.
2) Add signed user-facing notice templates into all distribution channels.
3) Add post-market surveillance checklist as a blocking release artifact in `build-evidence-bundle.ts`.
