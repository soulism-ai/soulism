# Definition of Done (Final Form)

This repo is “final-form production” only when every checkbox below is true.

---

## Repository-level

- [ ] `pnpm -r build` passes
- [ ] `pnpm -r test` passes
- [ ] `pnpm verify` passes (structure + contracts + lint + typecheck)
- [ ] `pnpm smoke` passes (repo smoke suite)
- [ ] CI is green on main for PRs
- [ ] SBOM generation workflow runs and produces artifacts
- [ ] Secret scanning + SAST + dependency scanning are enabled

---

## Service-level (applies to every service)

Each `services/**/<service>/` must have:

- [ ] `.env.example`
- [ ] `README.md` describing purpose, APIs, dependencies, runbooks
- [ ] `Dockerfile`
- [ ] `helm/Chart.yaml` + templates
- [ ] `k8s/` manifests
- [ ] `openapi.yaml` (even if internal)
- [ ] `asyncapi.yaml` if it emits/consumes events (or explicit “none” policy)
- [ ] `scripts/dev.sh` and `scripts/test.sh`
- [ ] `src/` following layered layout
- [ ] `test/contract`, `test/unit`, `test/integration`, `test/e2e`

Service runtime requirements:

- [ ] `/health` (liveness)
- [ ] `/ready` (readiness: dependencies reachable)
- [ ] request ID + trace ID propagation
- [ ] rate limits at ingress
- [ ] schema validation at boundaries
- [ ] structured logging (JSON)

---

## Trust & Safety

- [ ] Policy gate returns allow/confirm/deny decisions with stable reason codes
- [ ] Decisions can be signed and verified
- [ ] Audit ledger is append-only with hash chaining
- [ ] Audit records include correlation IDs and policy decision metadata
- [ ] Risk budgets are enforced (per persona/tool)

---

## Personas

- [ ] Packs can be signed and verified
- [ ] Persona inheritance + composition works deterministically
- [ ] Rendering produces stable system prompt output
- [ ] Policy hints exist but do not replace enforcement

---

## MCP

- [ ] MCP stdio transport works for every MCP service
- [ ] MCP HTTP transport works with origin validation and auth hooks
- [ ] Tool responses include provenance + correlation IDs
- [ ] Tool execution always calls policy gate and writes audit logs

---

## Operator experience

- [ ] Control plane UI can:
  - list personas
  - inspect effective persona (after composition)
  - view policy decisions
  - search audit entries
  - see system health panels

---

## Documentation

- [ ] `docs/architecture/*` is accurate
- [ ] Runbooks exist for incidents/rollback/key rotation
- [ ] Privacy/PII policy is documented
