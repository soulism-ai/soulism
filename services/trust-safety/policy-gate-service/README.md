# Policy Gate Service

Authoritative decision engine for tool calls.

## Responsibilities
- evaluate tool call proposals and return: allow | confirm | deny
- enforce scopes and budgets (via risk-budget-service)
- emit decision events (optional)
- (optional) sign decisions for verification by tool servers

## Core endpoints (example)
- `GET /health`
- `GET /ready`
- `POST /v1/decisions/check`
- `GET /v1/policies`
- `PUT /v1/policies` (admin only)

## Dependencies
- risk-budget-service (for budgets)
- audit-ledger-service (for logging decisions)

## Security
- deny-by-default if policy is missing
- never accept tool args without schema validation
