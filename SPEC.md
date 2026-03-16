# Cognitive AI Platform — System Specification

This is the **source of truth** for what the system must do.

If there is a conflict between this doc and implementation details in code, update either:
- an ADR (`docs/adr/*`), or
- this SPEC, and then update the code.

---

## 1. Primary objective

Ship a platform that can be embedded into an AI agent runtime to provide:

1) **Cognitive personalities** (personas) that are:
- composable, inheritable, and versioned
- signed and verified (supply-chain safe)
- rendered deterministically

2) **Governed tool usage**:
- all tool calls are checked by a policy engine (allow/confirm/deny)
- budgets and scopes are enforced
- high-risk actions require confirmation

3) **Auditability**:
- append-only audit ledger
- tamper-evident records (hash chaining)
- correlation IDs across services

4) **Memory with privacy boundaries**:
- short-term memory (session)
- long-term memory (opt-in, user-scoped)
- retention policies and deletion workflows

---

## 2. Functional requirements

### 2.1 Personas and persona packs
- Persona packs live under `packs/*`.
- A pack includes:
  - `manifest.json`
  - `personas/*.yml`
  - `signatures/pack.sig.json` (+ public key)
- Packs must be verified before loading in production mode.

Persona features:
- **Inheritance**: `extends: basePersonaId`
- **Composition**: `compose([personaA, personaB, ...])` with deterministic override order
- **Rendering**: effective persona → system prompt string (and structured form)

### 2.2 Policy gating
Policy gate must provide:
- `decision = allow | confirm | deny`
- `reason_code` (enum)
- `explanation` (operator-facing string)
- `requirements` (e.g., “needs_user_confirmation”, “needs_scope:files.write”)
- `budget_snapshot` (optional: remaining budget)

Policy gate inputs:
- persona id + version
- tool name + args summary
- requester identity + scopes
- environment (prod/staging/dev)

### 2.3 Audit ledger
Every externally meaningful action produces an audit entry.

An audit entry includes:
- `timestamp`
- `actor` (user/service)
- `persona_id` and `persona_version`
- `tool_name`
- `tool_args_hash` (never store raw secrets)
- `policy_decision` and decision signature
- `result_summary`
- `trace_id` / `request_id`
- `prev_hash` + `hash` (hash chain)

Ledger must be append-only; updates are forbidden (only compensating entries allowed).

### 2.4 Memory
Memory service must support:
- session memory (TTL)
- user memory (opt-in, deletion supported)
- vector search and key/value storage
- provenance tracking (source, timestamp, consent flag)

Memory writes must be mediated by policy:
- “write_memory” is treated as a tool with policies and budgets.

### 2.5 MCP servers
MCP services must expose:
- tools/resources/prompts per MCP contract
- stdio and HTTP transport modes
- clear errors with stable error codes
- origin validation and auth hooks (HTTP)

Tools must never “do everything”.
Tools must be explicit and permissioned.

---

## 3. Non-functional requirements

### Security
- SSRF protections on any network tool
- domain allowlists
- file path allowlists
- input validation (schemas)
- rate limiting
- secrets management (no secrets in code)
- signed packs and signed policy decisions

### Reliability
- health/readiness endpoints everywhere
- graceful shutdown
- idempotency for mutating operations
- retries with backoff for service-to-service calls

### Observability
- structured logs
- metrics
- distributed tracing
- audit trail correlation

### Performance
- tool latency budgets per tool category
- caching for persona pack loads
- pagination for audit queries

---

## 4. Deliverables (what “done” looks like)

See `DEFINITION_OF_DONE.md` for the full checklist.
