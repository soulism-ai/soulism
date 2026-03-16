# Policy Gates

Policy gating is the core safety feature of the platform.

---

## Goal

Decide whether a proposed tool call is:

- **allow** — may proceed
- **confirm** — requires explicit user/operator confirmation
- **deny** — forbidden

---

## Inputs

- persona id + version (and effective persona hash)
- tool name + args summary (hash)
- identity + scopes
- environment (dev/staging/prod)
- budgets snapshot

---

## Outputs

- decision: allow | confirm | deny
- reason_code: stable enum
- explanation: operator-facing message
- requirements: list of additional requirements (scopes, confirmations)
- budget_snapshot: remaining budget (optional)

---

## Confirm workflow (two-phase)
1. Tool server asks policy gate → returns `confirm`
2. Agent runtime asks user/operator for confirmation
3. Agent runtime re-requests decision with confirmation flag
4. Tool server executes and logs audit entry

---

## Budgets

Budgets can apply to:
- tool calls per time window
- estimated cost per time window
- write actions per time window
- memory writes per time window

Budgets are enforced by:
- policy gate (authoritative)
- risk budget service (shared state + alerting)

---

## Reason codes (example)
- `SCOPE_MISSING`
- `CONFIRMATION_REQUIRED`
- `BUDGET_EXCEEDED`
- `TOOL_DENYLIST`
- `TENANT_POLICY_DENY`
- `UNSAFE_ARGS`

Keep these stable for clients.

