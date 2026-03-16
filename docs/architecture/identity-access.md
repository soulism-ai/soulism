# Identity and Access

Identity is required for policy gating and auditability.

---

## Identity model

### Actors
- Human end user
- Service account (MCP services, gateway)
- Operator (control plane UI)

### Identifiers
- `user_id` (stable)
- `session_id`
- `request_id`
- `trace_id`

---

## Authorization model

Use scopes:
- `personas.read`, `personas.write`
- `policy.read`, `policy.write`
- `audit.read`
- `memory.read`, `memory.write`, `memory.delete`
- `tools.webfetch`, `tools.files.read`, `tools.files.write`

Policy gate decisions may require scopes:
- decision output includes `requirements` such as `needs_scope:memory.write`

---

## Service-to-service auth

Minimum:
- bearer tokens (mTLS recommended in production deployments)
- rotate secrets (see runbook `key-rotation.md`)
- do not allow anonymous internal endpoints

---

## Operator auth

Control plane must require operator login and enforce RBAC:
- viewer (read-only)
- operator (can approve confirmations)
- admin (policy and budgets)

