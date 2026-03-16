# Codex Build Guide (Project Instructions)

This document exists to make Codex / Cursor / VS Code agents productive **without breaking the architecture**.

If you do nothing else: follow the **Workstreams** and obey **Non‑Negotiables**.

---

## Non‑Negotiables

1. **Do not delete files or folders.** Only add or fill placeholders.
2. **Keep service discipline.**
   - Services must ship with Dockerfile, Helm, K8s, scripts, contracts, tests.
3. **Contracts before implementation.**
   - Define OpenAPI/AsyncAPI/MCP tool contracts and validate them in CI.
4. **No prompt-only safety.**
   - Tool execution must be mediated by Policy Gate.
5. **Everything externally meaningful is audit logged.**
6. **Least privilege always.**
   - Each MCP tool server gets a minimal scope and must not be able to escalate privileges.

---

## Recommended order (workstreams)

### Workstream A — Repo foundations
**Goal:** pnpm workspace + turbo pipeline + shared tsconfig/eslint/prettier + vitest workspace + CI gates.

Definition of done:
- `pnpm -r build` passes
- `pnpm verify` checks structure + contracts
- CI runs lint/typecheck/build/test/verify

### Workstream B — Contract tooling
**Goal:** validators for OpenAPI, AsyncAPI, MCP tool contracts + repo-level verify scripts.

Definition of done:
- `tools/contracts/validate-openapi.ts` (spectral or similar)
- `tools/contracts/validate-asyncapi.ts`
- `tools/contracts/validate-mcp.ts`
- `tools/repo/verify-contracts.ts` fails CI when contracts invalid/missing

### Workstream C — Persona engine (packages/)
**Goal:** persona schema + inheritance + composition + renderer + policy helpers + signing.

Definition of done:
- Supports `extends` and `compose([...])`
- Deterministic rendering into system prompt text
- Signing and verification for packs
- Unit tests for merge/compose/sign/verify

### Workstream D — Trust & Safety services
**Goal:** policy gate + audit ledger + risk budgets (deployable services).

Definition of done:
- Health/readiness endpoints
- OpenAPI and AsyncAPI defined + validated
- Audit ledger is append-only with hash chaining
- Policy gate returns allow/confirm/deny + reason codes
- Integration tests using dockerized dependencies

### Workstream E — MCP services
**Goal:** persona registry + memory + tool servers.

Definition of done:
- MCP stdio transport
- MCP HTTP transport (streamable or SSE) with origin validation and auth hooks
- Tools/resources/prompts implemented per contract
- Tool execution always calls policy gate
- Tool outputs include provenance + audit correlation IDs

### Workstream F — Apps
**Goal:** operator UI and demo clients.

Definition of done:
- Control plane can list personas, inspect effective persona, view audit entries
- Demo clients exercise both stdio and HTTP MCP transports

---

## “Elite” guardrails Codex should implement automatically

- **Structured logging** with request IDs and correlation IDs (W3C tracecontext compatible).
- **Input size limits** at every ingress boundary.
- **SSRF protection** for any network tool (DNS rebinding defenses, allowlists).
- **Rate limiting** at edge and tool servers.
- **Idempotency** for tool actions (especially anything that mutates state).
- **Schema validation** at boundaries (Zod/JSON Schema).

---

## How to write code in this repo

### TypeScript rules
- `strict: true` everywhere
- No `any` in public surface area
- Prefer explicit return types for exported functions

### Service rules
- Each service must have:
  - `openapi.yaml` and `asyncapi.yaml`
  - `scripts/dev.sh` and `scripts/test.sh`
  - Helm chart + templates
  - K8s manifests
  - `test/contract`, `test/unit`, `test/integration`, `test/e2e`

### Security rules
- Never log secrets.
- Treat all content as untrusted (users, retrieved docs, tool outputs).
- Add explicit allowlists (domains, file paths).
- Validate `Origin` for browser-based HTTP MCP clients.

---

## Suggested Codex prompts (copy/paste)

### Implement a service skeleton
> Implement the missing service skeleton for services/<path>/<service>. Add Dockerfile, helm, k8s, scripts, src layering, tests folders, and README. Do not remove any existing files. Fill placeholders with minimal working code that compiles and exposes /health and /ready endpoints.

### Implement a contract validator
> Implement tools/contracts/validate-mcp.ts that validates mcp.tools.json using JSON Schema in packages/contracts/schemas. Integrate into tools/repo/verify-contracts.ts. Ensure CI fails on invalid schema.

---

## Where to start
Read:
- `SPEC.md` — the system specification (what to build)
- `docs/architecture/overview.md` — architecture narrative
- `docs/architecture/service-map.md` — service responsibilities
