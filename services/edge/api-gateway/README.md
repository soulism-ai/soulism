# API Gateway

Edge service providing:
- ingress routing to internal services
- authentication and authorization enforcement
- rate limiting
- request correlation (request_id + trace_id)

## Endpoints (example)
- `GET /health`
- `GET /ready`
- `GET /audit` (proxy to audit ledger, RBAC protected)
- `POST /policy/check` (proxy to policy gate)
- `GET /personas` (proxy to persona registry)

## Dependencies
- policy-gate-service
- audit-ledger-service
- persona-registry-service
- memory-service

## Local dev
```bash
./scripts/dev.sh
```

## Testing
```bash
./scripts/test.sh
```
