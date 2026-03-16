# Engineering Standards

These are repo-wide conventions intended to keep the system predictable and production-grade.

---

## Monorepo rules
- Use `pnpm` workspaces and a single lockfile.
- Use `turbo` (or equivalent) to orchestrate tasks.
- Avoid “snowflake” project setups; keep shared configs in root.

---

## TypeScript rules
- `strict: true`
- No `any` in exported API surfaces
- Prefer `unknown` + runtime validation
- Exported functions must have explicit return types
- Prefer `Result<T, E>` style error handling for internal libraries

---

## API rules (HTTP)
- Every endpoint must:
  - validate input schema
  - return typed error codes
  - include request IDs
- Prefer idempotent writes with idempotency keys.
- Never return secrets in responses.

---

## Event rules (AsyncAPI)
- Use versioned event names.
- Include correlation IDs in event metadata.
- Consumers must be idempotent.

---

## Security rules
- Treat everything as untrusted:
  - user input
  - retrieved content
  - tool outputs
- Never allow arbitrary shell execution from LLM outputs.
- Always enforce allowlists (domains, paths).
- Validate Origin for browser-based clients.
- Use signed persona packs in production.

---

## Testing rules
Minimum test requirements per service:
- Contract tests for OpenAPI/AsyncAPI/MCP contract
- Unit tests for core logic
- Integration tests for data stores and service dependencies
- E2E smoke tests for core routes

---

## Observability rules
- JSON logs only in production
- Traces: propagate W3C `traceparent`
- Metrics: standard RED + USE metrics
- Audit: append-only, hash chained

---

## Documentation rules
- Every non-trivial decision gets an ADR under `docs/adr`.
- Every service README must include:
  - purpose
  - dependencies
  - env vars
  - endpoints/tools
  - local run commands
  - operational notes (SLOs, alerts)
