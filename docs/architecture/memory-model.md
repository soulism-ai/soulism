# Memory Model

Memory is powerful and dangerous. This platform treats memory as a governed capability.

---

## Types of memory

### 1) Session memory (short-term)
- TTL-based (minutes/hours)
- Not used for long-term personalization
- Suitable for multi-step tasks inside a session

### 2) Long-term memory (user scoped)
- Opt-in only
- Must support deletion
- Must track provenance (who/when/why stored)
- Must respect retention policies

---

## Storage model

Recommended hybrid:
- KV store for structured items (Postgres)
- Vector index for semantic retrieval (OpenSearch/pgvector/etc.)

---

## Privacy controls

- Default: do not store personal data.
- Memory writes are treated as a **tool call**:
  - go through Policy Gate
  - audited
  - subject to budgets and scopes

---

## Retrieval controls

- Filter by `user_id` and `tenant_id`
- Optional “sensitivity” labels:
  - public
  - internal
  - confidential
  - regulated

---

## Deletion

- Provide deletion by:
  - item ID
  - user ID (wipe)
  - retention expiry

Deletion itself is audited.

