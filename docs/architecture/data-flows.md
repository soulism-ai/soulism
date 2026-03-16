# Data Flows

This file describes end-to-end flows with sequence diagrams.

---

## 1) Persona activation

```mermaid
sequenceDiagram
  participant A as Agent Runtime
  participant PR as Persona Registry (MCP)
  participant PG as Policy Gate
  participant AL as Audit Ledger

  A->>PR: tools/persona_get_effective(persona_ids)
  PR->>PR: verify signatures + compose personas
  PR->>A: effective persona (structured + rendered)

  Note over A: Agent uses rendered system prompt
  A->>PR: prompts/activate_persona(persona_id)
  PR->>A: prompt bundle + constraints

  A->>AL: (optional) audit: persona selected
```

---

## 2) Tool call gating (high risk action)

```mermaid
sequenceDiagram
  participant A as Agent Runtime
  participant WF as WebFetch Tool (MCP)
  participant PG as Policy Gate
  participant AL as Audit Ledger

  A->>WF: tools/webfetch(url)
  WF->>PG: check(tool=webfetch, args_hash, persona, identity)
  PG-->>WF: decision=confirm + reason_code
  WF-->>A: requires_confirmation + reason

  A->>WF: tools/webfetch(url, confirmation=true)
  WF->>PG: check(...)
  PG-->>WF: decision=allow
  WF->>WF: fetch content (allowlist, limits)
  WF->>AL: append audit entry (decision + result summary)
  WF-->>A: content + provenance + audit_id
```

---

## 3) Memory write (opt-in)

```mermaid
sequenceDiagram
  participant A as Agent Runtime
  participant MEM as Memory (MCP)
  participant PG as Policy Gate
  participant AL as Audit Ledger

  A->>MEM: tools/memory_write(user_id, item, consent=true)
  MEM->>PG: check(tool=memory_write, args_hash, persona, identity)
  PG-->>MEM: allow + budget snapshot
  MEM->>MEM: persist (kv + vector) + provenance
  MEM->>AL: append audit entry
  MEM-->>A: ok + memory_item_id
```

---

## 4) Audit query flow

```mermaid
sequenceDiagram
  participant UI as Control Plane UI
  participant Edge as API Gateway
  participant AL as Audit Ledger

  UI->>Edge: GET /audit?user_id=...&limit=...
  Edge->>AL: GET /audit?...
  AL-->>Edge: audit entries (paged)
  Edge-->>UI: audit entries
```

