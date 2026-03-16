# Audit Ledger Service

Append-only, tamper-evident audit log.

## Responsibilities
- accept audit append requests
- store records immutably (no updates)
- maintain hash chain integrity
- provide paged queries for operators

## Core endpoints (example)
- `GET /health`
- `GET /ready`
- `POST /v1/audit/append`
- `GET /v1/audit/query`

## Security
- strict RBAC for reads
- store arg hashes, not raw sensitive payloads
