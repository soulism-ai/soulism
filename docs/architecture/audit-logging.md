# Audit Logging

Audit logging enables:
- incident response
- compliance reporting
- debugging tool behavior
- trustworthiness

---

## Design goals
- append-only
- tamper evident
- searchable (paged)
- correlatable across services

---

## Audit entry schema (high-level)
- time
- actor (user/service)
- persona (id + version)
- tool (name)
- args hash (never store raw secrets)
- policy decision (with signature metadata)
- result summary
- correlation IDs (request_id, trace_id)
- hash chain (prev_hash, hash)

---

## Hash chaining
Every entry includes `prev_hash`.
The entry’s `hash` is computed from:
- serialized entry payload
- `prev_hash`

This makes tampering evident.

---

## Access control
- Operators can query audit by tenant/user/time.
- Applications should not expose raw audit logs to end users by default.
- Export workflows should be explicit.

---

## Retention
Retention policy is defined in `docs/runbooks/data-retention.md`.

