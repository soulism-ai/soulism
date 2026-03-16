# Roadmap

This roadmap is organized by “production readiness”, not by demo milestones.

## Phase 0 — Repo foundations (must)
- pnpm + turbo pipelines
- lint/typecheck/test/verify gates
- contract validators (OpenAPI/AsyncAPI/MCP)
- scaffolders and structure verifiers

## Phase 1 — Persona engine (packages/)
- persona schema + pack manifest
- inheritance + composition
- deterministic renderer
- signing and verification
- CLI integration

## Phase 2 — Trust & safety services
- policy gate service (allow/confirm/deny + reason codes)
- risk budget service (quotas per tool/persona)
- audit ledger service (append-only hash chain)

## Phase 3 — MCP services
- persona registry MCP service (packs + resources + prompts)
- memory service (KV + vector + retention)
- tool servers (webfetch/files) with hardened boundaries
- MCP stdio + HTTP transport

## Phase 4 — Operator control plane
- UI to inspect personas, policies, budgets, audits
- alerting hooks and dashboards

## Phase 5 — Distribution
- publish npm packages
- publish container images
- publish signed persona packs
- marketplace manifests
