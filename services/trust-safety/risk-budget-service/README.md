# Risk Budget Service

Central store for budgets and quotas.

## Responsibilities
- track budgets per tool/persona/user/tenant
- answer “remaining budget” queries
- emit alerts/events when budgets exceeded

## Core endpoints (example)
- `GET /health`
- `GET /ready`
- `GET /budgets`
- `POST /budgets/check`
- `POST /budgets/reset`
- `GET /v1/budgets` (alias)
- `POST /v1/budgets/check` (alias)
- `POST /v1/budgets/reset` (alias)

## Dependencies
- audit-ledger-service (for logging)

## Behavior
- budget checks are atomic and consume budget only when `allowed === true`;
- snapshots include both compact (`remaining`, `max`) and contract (`remainingBudget`, `maxBudget`) fields;
- window is deterministic by `(RISK_BUDGET_MAX, RISK_BUDGET_WINDOW_MS)`.
