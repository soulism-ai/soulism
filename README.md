# Soulism: Cognitive AI Platform

An MIT-licensed open-source application for running a governed AI control plane, API gateway, persona system, audit ledger, memory service, and MCP tools. Soulism provides an "agenty" cockpit for monitoring and controlling your cognitive runtimes.

This repository is designed to be integrated into an AI agent runtime (Codex, Cursor, VS Code agents, Claude Desktop, custom runtimes) via:

- **MCP (Model Context Protocol)** servers (stdio + HTTP)
- A **Policy Gate** that decides whether tools are **allowed / require confirmation / denied**
- An **Audit Ledger** that records actions in an append-only, tamper-evident way
- A **Memory Service** (structured + vector) with privacy boundaries
- **Persona Packs** (signed) that define “cognitive personalities” and constraints
- SDKs + CLI for developers and operators

> This repo is intentionally production-first: every service is treated as deployable from day 1.
> No "just a script" services. No "we'll add Helm later".

---

## 🚀 Open-source Quickstart (Soulism Control Plane)

The fastest local path is the Docker Compose stack, which brings up the gateway, supporting services, and the **Soulism Web Control Plane** together.

### Prerequisites
- Docker
- Node.js LTS + pnpm

### Installation & Execution

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Start the Soulism stack (Services + Frontend):**
   ```bash
   pnpm oss:up
   ```
3. *(Optional)* **Run just the frontend dashboard locally for development:**
   ```bash
   pnpm --filter web-control-plane dev
   ```

### Accessing the System
- **Soulism Control Plane:** [http://localhost:3000](http://localhost:3000)
- **API Gateway Health:** [http://localhost:8080/health](http://localhost:8080/health)

**Default local operator credentials:**
- username: `operator`
- password: `localdev`

> These credentials are for the bundled local self-host stack only. Change them before exposing any deployment outside your machine.

---

## What “cognitive personalities” means here

A persona is **not** “prompt vibes”.

A persona is a **governed configuration** that influences:
- **Reasoning style**: plan/act/reflect loop, decomposition, verification habits
- **Voice**: tone, format, verbosity
- **Boundaries**: “must do”, “must not do”, refusal/escalation triggers
- **Tool policy hints**: default confirmation level, tool allow/deny rules, budgets
- **Memory policy**: what can be stored, retention, consent requirements

**Enforcement is outside the prompt**:
- Tool execution must go through the **Policy Gate**.
- Every externally-impactful action must be **audit logged**.

---

## System architecture

### High-level services
- **edge/api-gateway**: ingress, auth, rate limits, routing, request correlation
- **trust-safety/policy-gate-service**: central tool decision engine (allow/confirm/deny), budgets, signed decisions
- **trust-safety/audit-ledger-service**: append-only audit log (hash chained)
- **trust-safety/risk-budget-service**: budgets, quotas, and alerts across tools/personas
- **mcp/persona-registry-service**: loads persona packs, verifies signatures, serves persona tools/resources
- **mcp/memory-service**: structured + vector memory (with privacy and retention controls)
- **mcp/tool-webfetch-service**: safe web retrieval (allowlists, content limits, SSRF defenses)
- **mcp/tool-files-service**: constrained file operations in an allowlisted workspace

### Libraries and developer experience
- **packages/persona-\***: persona schema, composition, rendering, policy helpers, signing
- **packages/mcp-sdk**: client + transports (stdio/http) used by apps and examples
- **packages/cli**: `cogpersona` CLI to manage packs, verify signatures, start MCP servers
- **apps/web-control-plane**: operator UI (persona selection, policy console, audit viewer)
- **apps/docs-site**: architecture and runbooks site

### Trust boundaries (non-negotiable)
1. User input is **untrusted**
2. Retrieved content is **untrusted**
3. Personas are **trusted only if signed + verified**
4. Tools are **never executed directly by the model** — they must be mediated by Policy Gate

---

## Repository layout

- `apps/` — UIs and demo surfaces
- `packages/` — versioned npm packages (SDKs, runtime libs, CLI)
- `services/` — deployable microservices (template)
- `packs/` — signed persona packs
- `docs/` — architecture, ADRs, runbooks, compliance notes
- `tools/` — repo tooling (scaffolders, contract validators, security utilities)
- `ci/` — smoke suite, policy fixtures, baselines
- `infra/` — shared Helm/Terraform reference layouts

---

## Non-goals

- Building a general AGI
- Running arbitrary code on behalf of users without explicit policy controls
- “Auto-do-everything” autonomy without approvals/auditability
- Hidden prompts or “secret” behaviors

---

## Engineering invariants ( discipline)

These are hard rules. If you violate them, you create operational debt and security risk.

1. **Every service is deployable**: Dockerfile + Helm + K8s manifests live with the service.
2. **Every service is contract-defined**: OpenAPI/AsyncAPI (and MCP tool contracts for MCP services).
3. **No prompt-only safety**: policy decisions are enforced in code.
4. **Audit everything**: externally meaningful actions produce immutable audit records.
5. **Test pyramid**: unit + integration + e2e + contract tests; plus repo-level smoke suite.

---

## Getting started (developer)

Prereqs:
- Node.js (LTS) + pnpm
- Docker (for local dependencies)
- kubectl/helm (optional, for deploy tests)

Common commands (to be implemented/standardized):
- `pnpm install`
- `pnpm -r build`
- `pnpm -r test`
- `pnpm verify` (structure + contracts + lint + typecheck)
- `pnpm smoke` (repo smoke suite)

See:
- `CODEX.md` — how to use Codex to implement this repo safely
- `docs/architecture/overview.md` — system design
- `docs/runbooks/oncall.md` — operations

---

## Compliance and safety

This repository includes:
- privacy boundaries (`docs/compliance/privacy.md`)
- PII policy (`docs/compliance/pii-policy.md`)
- responsible AI notes (`docs/compliance/responsible-ai.md`)
- audit readiness templates (`docs/architecture/audit-logging.md`)

These docs are engineering guidance, not legal advice.

---

## License

See `LICENSE`.
# cogpersona
# soulism
# soulism
# soulism
